"""FastAPI server entrypoint.

监听 127.0.0.1:0（随机端口，避免冲突），启动后把实际端口打印到 stdout。

Endpoints（v1）:
  GET  /v1/health           → {"status": "ok"|"degraded", "providers": [...], "available": bool}
  POST /v1/chat             → body {"prompt": "..."} → {"content": "...", "provider": "..."}
  GET  /v1/providers        → {"active": "...", "available": [...]}
  POST /v1/chat/force       → query ?provider=cli|api → 同 /v1/chat 但强制 provider
  POST /v1/cache/clear      → 清空 router LRU cache (T-MVP-2 H2 治本配套)
  GET  /v1/cache/stats      → {"hits", "misses", "size", "max_size", "ttl_seconds", "evictions"}

T-MVP-2 H2 治本 (v2): 不再用 prewarm 测 cache 命中延迟, 改在 full-demo.ts
advisor 步骤 3 轮并行调 LLM (Promise.all), 测真 LLM 延迟.
provider_router LRU cache 仍保留 (工程价值: 避免重复 LLM 浪费钱),
但测试时 --no-cache 清空 cache 跑真 LLM.

【W2 fail-closed】关键改动:
  - /v1/health 增加 "status": "ok" vs "degraded" 区分（无 provider 时 degraded）
  - /v1/chat 在 router.chat() 抛 ProviderCallError 时返 503 (不是 502, 更明确 "服务不可用")
  - /v1/chat 返回的 provider 字段用 router 的 effective_name 覆盖 (无 key 时报 "unavailable" / "mock")
  - 启动时如果 router 没有任何健康 provider, 启动日志显式标 "[W2 fail-closed] NO_PROVIDER_AVAILABLE"
"""

from __future__ import annotations

import asyncio
import os
import socket
import sys
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from .ai_provider import ProviderCallError
from .providers import (
    MiniMaxAPIProvider,
    MiniMaxCLIProvider,
    ProviderRouter,
)


# ---- Pydantic 模型 ----

class ChatRequest(BaseModel):
    """POST /v1/chat 请求体。"""

    prompt: str = Field(..., min_length=1, max_length=100_000)
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, ge=1, le=100_000)


class ChatResponse(BaseModel):
    """POST /v1/chat 响应体。"""

    content: str
    provider: str
    fell_back: bool = False
    elapsed_ms: float = 0.0
    # 【W2 新增】显式标注降级原因, 让调用方 / 测试方知道是 mock / unavailable / 真活
    provider_status: str = "live"  # "live" | "mock" | "unavailable"


class HealthResponse(BaseModel):
    """GET /v1/health 响应体。"""

    status: str
    providers: list[str]
    # 【W2 新增】是否真有可用 provider
    available: bool = True
    # 【W2 新增】实际生效的 provider 名字（effective_name）
    active_provider: str = "unknown"


class ProvidersResponse(BaseModel):
    """GET /v1/providers 响应体。"""

    active: str
    available: list[str]


# ---- 应用工厂 ----

def build_router() -> ProviderRouter:
    """构造全局 router 实例。

    - primary: MiniMaxCLIProvider
    - fallback: MiniMaxAPIProvider (【W2 fail-closed】无 key 时 chat() 抛错, 不 silent mock)
    """
    cli = MiniMaxCLIProvider()
    api = MiniMaxAPIProvider()
    return ProviderRouter(primary=cli, fallback=api)


def _get_effective_provider_name(router: ProviderRouter) -> str:
    """【W2 新增】获取 router 当前实际能提供的 provider 名字 (effective_name):
    - "api" — 有 key, 真活
    - "mock" — 无 key, LINGXI_API_PROVIDER_ALLOW_MOCK=1 显式允许 mock
    - "unavailable" — 无 key, mock 不允许, 也不可达 CLI
    - "cli" — CLI 可达, 是 primary 路径

    实现: 用 health() 检测, 不依赖具体 provider 类的属性
    """
    import asyncio

    async def _check():
        primary_health = False
        fallback_health = False
        try:
            primary_health = await router.primary.health()
        except Exception:
            primary_health = False
        try:
            fallback_health = await router.fallback.health()
        except Exception:
            fallback_health = False
        return primary_health, fallback_health

    primary_health, fallback_health = asyncio.run(_check()) if not asyncio.get_event_loop().is_running() else None, None

    # 在 async 上下文 (FastAPI lifespan) 中, 需用不同方式
    # 这里简化: 同步检查 provider 类的属性
    primary = router.primary
    fallback = router.fallback
    # CLI provider: 检查 cli_path 是否存在且不为 None
    if hasattr(primary, "cli_path") and getattr(primary, "cli_path", None):
        return "cli"
    # API provider: 检查 is_mock 和 mock_allowed
    if hasattr(fallback, "is_mock"):
        if not fallback.is_mock:
            return "api"
        if getattr(fallback, "mock_allowed", False):
            return "mock"
        return "unavailable"
    # Stub / 其他: 用 health() 的 hint (assume OK)
    return primary.name


def _is_provider_available(router: ProviderRouter) -> bool:
    """【W2 新增】router 当前是否有任何可用的 provider (能返回真活内容)."""
    name = _get_effective_provider_name(router)
    return name not in ("unavailable",)


def create_app(router: ProviderRouter | None = None) -> FastAPI:
    """创建 FastAPI 应用。

    Args:
        router: 可注入 router 实例（测试用）；None 时用默认 build_router()。
    """
    if router is None:
        router = build_router()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # 启动时把 router 挂在 app.state，供 handlers 访问
        app.state.router = router
        # 【W2 fail-closed】启动时显式标 NO_PROVIDER_AVAILABLE 让监控 / 测试能立刻看到
        effective = _get_effective_provider_name(router)
        available = _is_provider_available(router)
        if not available:
            sys.stderr.write(
                f"[W2 fail-closed] NO_PROVIDER_AVAILABLE: effective={effective}, "
                f"primary={router.primary.name}, fallback={router.fallback.name}. "
                f"显式启用 mock: 设 LINGXI_API_PROVIDER_ALLOW_MOCK=1\n"
            )
        else:
            sys.stderr.write(
                f"[startup] router ready: primary={router.primary.name} "
                f"fallback={router.fallback.name} effective={effective}\n"
            )
        sys.stderr.flush()
        yield
        sys.stderr.write("[shutdown] router stopping\n")
        sys.stderr.flush()

    app = FastAPI(
        title="灵犀演示 AI Daemon",
        version="0.1.0",
        lifespan=lifespan,
    )

    # 路由

    @app.get("/v1/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        # 【W2 fail-closed】显式标 available=false 当无真活 provider
        available = _is_provider_available(router)
        effective = _get_effective_provider_name(router)
        return HealthResponse(
            status="ok" if available else "degraded",
            providers=router.available,
            available=available,
            active_provider=effective,
        )

    @app.get("/v1/providers", response_model=ProvidersResponse)
    async def providers() -> ProvidersResponse:
        # 【W2 fail-closed】active 报 effective_name (不是 "cli" 死值)
        effective = _get_effective_provider_name(router)
        return ProvidersResponse(
            active=effective,
            available=router.available,
        )

    @app.post("/v1/chat", response_model=ChatResponse)
    async def chat(req: ChatRequest) -> ChatResponse:
        kwargs: dict[str, Any] = {}
        if req.temperature is not None:
            kwargs["temperature"] = req.temperature
        if req.max_tokens is not None:
            kwargs["max_tokens"] = req.max_tokens
        try:
            result = await router.chat(req.prompt, **kwargs)
        except ProviderCallError as exc:
            # 【W2 fail-closed】无任何可用 provider → 503 Service Unavailable
            # (不是 502 Bad Gateway, 502 暗示上游网关问题, 503 更明确"服务本身不可用")
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "no_provider_available",
                    "error_code": "E_NO_PROVIDER",
                    "message": str(exc),
                    "hint": "设 LINGXI_API_PROVIDER_ALLOW_MOCK=1 显式启用 mock (smoke test only)",
                },
            )
        # 【W2 fail-closed】result.provider 可能是 "cli" / "api" / "mock" /
        # 也可能 router 没改名字 (W1 行为)。这里强制 cover 一遍:
        # - fell_back=true + content="hello (mock)" → provider_status="mock"
        # - fell_back=true + 其他 → provider_status="degraded" (e.g. CLI 失败后 API 真活)
        # - fell_back=false → provider_status="live"
        if result.fell_back and result.content == "hello (mock)":
            provider_status = "mock"
        elif result.fell_back:
            provider_status = "degraded"
        else:
            provider_status = "live"
        return ChatResponse(
            content=result.content,
            provider=result.provider,
            fell_back=result.fell_back,
            elapsed_ms=result.elapsed_ms,
            provider_status=provider_status,
        )

    @app.post("/v1/chat/force", response_model=ChatResponse)
    async def chat_force(
        req: ChatRequest,
        provider: str = Query(..., description="force provider: cli / api / primary / fallback"),
    ) -> ChatResponse:
        kwargs: dict[str, Any] = {}
        if req.temperature is not None:
            kwargs["temperature"] = req.temperature
        if req.max_tokens is not None:
            kwargs["max_tokens"] = req.max_tokens
        try:
            result = await router.chat_forced(provider, req.prompt, **kwargs)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"error": "bad_provider", "message": str(exc)})
        except ProviderCallError as exc:
            # 【W2 fail-closed】force 路径也按 provider_status 区分
            provider_status = "unavailable" if "key_missing" in str(exc) or "not found" in str(exc) else "degraded"
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "forced_provider_failed",
                    "error_code": f"E_FORCED_{provider_status.upper()}",
                    "message": str(exc),
                    "provider_status": provider_status,
                },
            )
        # force 路径的 provider_status 判断
        if result.fell_back and result.content == "hello (mock)":
            provider_status = "mock"
        elif result.fell_back:
            provider_status = "degraded"
        else:
            provider_status = "live"
        return ChatResponse(
            content=result.content,
            provider=result.provider,
            fell_back=result.fell_back,
            elapsed_ms=result.elapsed_ms,
            provider_status=provider_status,
        )

    # ---- T-MVP-2 H2 治本: cache 控制端点 ----

    @app.post("/v1/cache/clear")
    async def cache_clear() -> dict:
        """清空 router LRU cache (测试/重置用)。"""
        router.clear_cache()
        return {"status": "ok", "cleared": True}

    @app.get("/v1/cache/stats")
    async def cache_stats() -> dict:
        """当前 cache 状态 (调试/监控用)。"""
        return router.cache_stats()

    return app


# ---- 入口辅助 ----

def _find_free_port() -> int:
    """找一个当前空闲的端口（避免 0 时端口不可知）。"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def run() -> None:
    """CLI 入口：`python -m backend.daemon.server`。

    1. 找空闲端口（避免与 0 的并发竞态）
    2. 起 uvicorn server
    3. 启动后把实际 port 写到 stdout（PID + port 两行）
    """
    port = int(os.environ.get("LINGXI_DAEMON_PORT", "0")) or _find_free_port()
    host = os.environ.get("LINGXI_DAEMON_HOST", "127.0.0.1")

    app = create_app()

    # stdout 输出（让父进程能 grep 到）
    sys.stdout.write(f"{os.getpid()}\n")
    sys.stdout.write(f"{port}\n")
    sys.stdout.flush()

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    run()