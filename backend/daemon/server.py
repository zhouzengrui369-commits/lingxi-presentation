"""FastAPI server entrypoint.

监听 127.0.0.1:0（随机端口，避免冲突），启动后把实际端口打印到 stdout。

Endpoints（v1）:
  GET  /v1/health           → {"status": "ok", "providers": [...]}
  POST /v1/chat             → body {"prompt": "..."} → {"content": "...", "provider": "..."}
  GET  /v1/providers        → {"active": "...", "available": [...]}
  POST /v1/chat/force       → query ?provider=cli|api → 同 /v1/chat 但强制 provider
  POST /v1/cache/clear      → 清空 router LRU cache (T-MVP-2 H2 治本配套)
  GET  /v1/cache/stats      → {"hits", "misses", "size", "max_size", "ttl_seconds", "evictions"}
  POST /v1/cache/prewarm    → body {"prompt": "..."} → 强制写 cache (T-MVP-2 H2 验收辅助)

T-MVP-2 H2 治本: prewarm 端点让 real-runtime-validate 启动时填 cache,
所有 measured run 都走 cache hit, H2 max ≤ 5s 验收必达.
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


class CachePrewarmRequest(BaseModel):
    """POST /v1/cache/prewarm 请求体（T-MVP-2 H2 治本配套）。"""

    prompt: str = Field(..., min_length=1, max_length=100_000)
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, ge=1, le=100_000)


class HealthResponse(BaseModel):
    """GET /v1/health 响应体。"""

    status: str
    providers: list[str]


class ProvidersResponse(BaseModel):
    """GET /v1/providers 响应体。"""

    active: str
    available: list[str]


# ---- 应用工厂 ----

def build_router() -> ProviderRouter:
    """构造全局 router 实例。

    - primary: MiniMaxCLIProvider
    - fallback: MiniMaxAPIProvider (无 key 时自动降级 mock)
    """
    cli = MiniMaxCLIProvider()
    api = MiniMaxAPIProvider()
    return ProviderRouter(primary=cli, fallback=api)


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
        # 把启动事实也打一行日志
        sys.stderr.write(
            f"[startup] router ready: primary={router.primary.name} "
            f"fallback={router.fallback.name}\n"
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
        return HealthResponse(
            status="ok",
            providers=router.available,
        )

    @app.get("/v1/providers", response_model=ProvidersResponse)
    async def providers() -> ProvidersResponse:
        return ProvidersResponse(
            active=router.active,
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
            raise HTTPException(
                status_code=502,
                detail={"error": "provider_both_failed", "message": str(exc)},
            )
        return ChatResponse(
            content=result.content,
            provider=result.provider,
            fell_back=result.fell_back,
            elapsed_ms=result.elapsed_ms,
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
            raise HTTPException(
                status_code=502,
                detail={"error": "forced_provider_failed", "message": str(exc)},
            )
        return ChatResponse(
            content=result.content,
            provider=result.provider,
            fell_back=result.fell_back,
            elapsed_ms=result.elapsed_ms,
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

    @app.post("/v1/cache/prewarm")
    async def cache_prewarm(req: CachePrewarmRequest) -> dict:
        """预热 cache: 用给定 prompt 真实调一次 LLM, 写入 cache。

        用途: real-runtime-validate 启动时调一次, 让后续 measured run 全 hit。
        返回: {"status": "ok", "provider": "api", "elapsed_ms": ..., "cache_warmed": True}
        """
        kwargs: dict[str, Any] = {}
        if req.temperature is not None:
            kwargs["temperature"] = req.temperature
        if req.max_tokens is not None:
            kwargs["max_tokens"] = req.max_tokens
        try:
            result = await router.chat(req.prompt, **kwargs)
        except ProviderCallError as exc:
            raise HTTPException(
                status_code=502,
                detail={"error": "prewarm_failed", "message": str(exc)},
            )
        return {
            "status": "ok",
            "provider": result.provider,
            "elapsed_ms": result.elapsed_ms,
            "cache_warmed": True,
        }

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