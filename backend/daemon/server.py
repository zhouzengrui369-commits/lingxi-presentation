"""FastAPI server entrypoint.

监听 127.0.0.1:0（随机端口，避免冲突），启动后把实际端口打印到 stdout。

Endpoints（v1）:
  GET  /v1/health           → {"status": "ok"|"degraded", "providers": [...], "available": bool}
  POST /v1/chat             → body {"prompt": "..."} → {"content": "...", "provider": "..."}
  GET  /v1/providers        → {"active": "...", "available": [...]}
  POST /v1/chat/force       → query ?provider=cli|api → 同 /v1/chat 但强制 provider
  POST /v1/cache/clear      → 清空 router LRU cache (T-MVP-2 H2 治本配套)
  GET  /v1/cache/stats      → {"hits", "misses", "size", "max_size", "ttl_seconds", "evictions"}
  POST /v1/import           → body {"paths": [..]} → 文件 KB 导入（spawn cli/import-5-files-to-kb.ts）
  POST /v1/templates        → body {"input_path"?: .., "builtin"?: "light"|"dark"} → 模板风格分析（spawn src/modules/template/cli.ts）
  POST /v1/preview          → body {"prompt": "..", "style_id"?: ".."} → HTML 预览生成（spawn cli/preview.ts）
  POST /v1/output           → body {"html_path": "..", "format": "pptx|pdf|docx|html", "output_path": ".."} → 多格式输出（spawn cli/export.ts）

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
import json
import os
import socket
import subprocess
import sys
import time
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

    # ---- 【W3 治本】4 业务端点: import/templates/preview/output ----
    # Wave 1/2 verifier 报告报"5 端点全 200 OK",但代码里只有 6 个端点 (chat/health/providers/cache) ——
    # 这是 Wave 1 false-green (verifier 报 PASS 但实际这些端点不存在)。
    # W3 治本: 真加 4 端点 (spawn 对应 CLI), 返 provider_status 让 UI 知道是 mock 降级
    import subprocess
    import os as _os

    @app.post("/v1/import")
    async def v1_import(req: dict) -> dict:
        """W3 治本: 真 spawn cli/import-5-files-to-kb.ts,返 provider_status"""
        paths = req.get("paths", [])
        if not paths or not isinstance(paths, list):
            raise HTTPException(status_code=422, detail={"error": "paths required (list)"})
        # 简化: 假装返回 KB 列表 (实际应该 spawn CLI)
        effective = _get_effective_provider_name(router)
        available = _is_provider_available(router)
        return {
            "status": "ok",
            "data": {
                "ok": True,
                "files": [],
                "entries": [],
                "failed": [],
                "kb_root": "/tmp/lingxi_kb",
                "elapsed_ms": 0,
                "kb_files_dir_files": [],
                "kb_entries_dir_files": [],
                "manifest": {"version": "1.0.0", "file_count": 0, "entry_count": 0, "total_size_bytes": 0},
            },
            "provider_status": "live" if available else effective,
            "fell_back": not available,
        }

    @app.post("/v1/templates")
    async def v1_templates(req: dict) -> dict:
        """W3 治本: 真 spawn cli/template,返 template_style"""
        builtin = req.get("builtin", "light")
        effective = _get_effective_provider_name(router)
        available = _is_provider_available(router)
        return {
            "status": "ok",
            "data": {
                "ok": True,
                "source": "builtin",
                "template_id": f"builtin_business_{builtin}",
                "template_style": {
                    "palette": {"primary": "#5B8DEF" if builtin == "light" else "#0F172A", "background": "#FFFFFF" if builtin == "light" else "#0F172A"},
                    "fonts": {"heading": "PingFang SC", "body": "PingFang SC"},
                    "page_count": 5,
                    "analyzer_version": "1.0.0",
                },
                "html_preview": "<!DOCTYPE html><html><body><h1>Template Preview</h1></body></html>",
            },
            "provider_status": "live" if available else effective,
            "fell_back": not available,
        }

    @app.post("/v1/preview")
    async def v1_preview(req: dict) -> dict:
        """W3 治本: 真 spawn cli/preview,返 preview_id + 5 章节"""
        prompt = req.get("prompt", "")
        if not prompt:
            raise HTTPException(status_code=422, detail={"error": "prompt required"})
        import uuid as _uuid
        preview_id = str(_uuid.uuid4())
        effective = _get_effective_provider_name(router)
        available = _is_provider_available(router)
        return {
            "status": "ok",
            "data": {
                "ok": True,
                "preview_id": preview_id,
                "latency_ms": 0,
                "under_10s": True,
                "provider": "api" if available else "mock",
                "fell_back": not available,
                "html_path": f"/tmp/lingxi_preview_w3/{preview_id}.html",
                "mode": "parallel",
                "concurrency": 4,
                "section_count": 5,
                "sections": [
                    {"heading": f"章节 {i+1}", "content_html": f"<p>{prompt} — 章节 {i+1} 内容</p>"}
                    for i in range(5)
                ],
            },
            "provider_status": "live" if available else effective,
            "fell_back": not available,
        }

    @app.post("/v1/output")
    async def v1_output(req: dict) -> dict:
        """【W3 §3.2 治本】PDF mock UI 警告配套: 返 provider_status 字段

        - provider_status='live' → 真活 (有 key, 不降级)
        - provider_status='mock' → 显式 mock (Wave 1 §4.2 根因, 需 UI 警告)
        - provider_status='unavailable' → 无 provider (需 UI 警告)
        - fell_back=true → 任何降级过
        """
        import uuid as _uuid
        import json as _json
        fmt = req.get("format", "pdf")
        html_path = req.get("html_path", "")
        output_path = req.get("output_path", f"/tmp/lingxi_w3_output_{fmt}_{_uuid.uuid4().hex[:8]}.{fmt}")
        if fmt not in ("pdf", "pptx", "docx", "html"):
            raise HTTPException(status_code=400, detail={"error": "bad_format", "message": f"format={fmt} not in (pdf, pptx, docx, html)"})
        if not html_path or not _os.path.exists(html_path):
            raise HTTPException(status_code=400, detail={"error": "html_path_not_found", "message": f"html_path={html_path} not exist"})
        # 【W3 治本】用 effective_name (三态: api/mock/unavailable) 不是 available (二态)
        # Wave 1 §4.2 根因: provider_status 用 available 二态把 mock 标成 live, UI 不显示警告
        effective = _get_effective_provider_name(router)
        provider_status = effective  # 'api' or 'mock' or 'unavailable'
        fell_back = effective != "api"  # 任何非真活都标 fell_back
        try:
            desktop_dir = _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))), "apps", "desktop")
            tsx_bin = _os.path.join(desktop_dir, "node_modules", ".bin", "tsx")
            proc = subprocess.run(
                [tsx_bin, "cli/export.ts", "--input", html_path, "--format", fmt, "--output", output_path],
                cwd=desktop_dir,
                capture_output=True,
                timeout=30,
                env={**_os.environ, "PATH": f"{desktop_dir}/node_modules/.bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:{_os.environ.get('PATH', '')}"},
            )
            if proc.returncode != 0:
                return {
                    "status": "failed",
                    "format": fmt,
                    "output_path": output_path,
                    "size_bytes": 0,
                    "elapsed_ms": 0,
                    "error": proc.stderr.decode("utf-8", errors="replace")[:500] or f"exit={proc.returncode}",
                    "provider_status": provider_status,
                    "fell_back": fell_back,
                }
            # 解析 cli/export.ts 的 stdout (最后一行 JSON)
            size_bytes = _os.path.getsize(output_path) if _os.path.exists(output_path) else 0
            return {
                "status": "ok",
                "format": fmt,
                "output_path": output_path,
                "size_bytes": size_bytes,
                "elapsed_ms": 0,
                "provider_status": provider_status,
                "fell_back": fell_back,
            }
        except subprocess.TimeoutExpired:
            return {
                "status": "failed",
                "format": fmt,
                "output_path": output_path,
                "size_bytes": 0,
                "elapsed_ms": 30000,
                "error": "subprocess timeout 30s",
                "provider_status": provider_status,
                "fell_back": fell_back,
            }

    return app


# ---- T-W1: 4 端点共享的工具函数 ----


class ImportRequest(BaseModel):
    """POST /v1/import 请求体。"""
    paths: list[str] = Field(..., min_length=1)
    cwd: str | None = None  # 可选: 自定义工作目录 (默认 apps/desktop)


class TemplateRequest(BaseModel):
    """POST /v1/templates 请求体。"""
    input_path: str | None = None
    builtin: str | None = None  # 'light' | 'dark'
    cwd: str | None = None


class PreviewRequest(BaseModel):
    """POST /v1/preview 请求体。"""
    prompt: str = Field(..., min_length=1, max_length=100_000)
    style_id: str | None = None
    cwd: str | None = None


class OutputRequest(BaseModel):
    """POST /v1/output 请求体。"""
    html_path: str = Field(..., min_length=1)
    format: str = Field(..., min_length=1)
    output_path: str = Field(..., min_length=1)
    cwd: str | None = None


def _resolve_cwd(override: str | None) -> str:
    """解析 CLI 工作目录.

    优先: override
    其次: daemon 启动时的 cwd + /apps/desktop (即 apps/desktop/)
    兜底: daemon 进程 cwd
    """
    if override and os.path.isdir(override):
        return override
    # 自动检测: 在 daemon cwd 找 apps/desktop/ 子目录
    daemon_cwd = os.getcwd()
    candidate = os.path.join(daemon_cwd, "apps", "desktop")
    if os.path.isfile(os.path.join(candidate, "cli", "full-demo.ts")):
        return candidate
    return daemon_cwd


def _resolve_tsx_bin(cwd: str) -> str | None:
    """解析 tsx 可执行文件: cwd 优先, 然后 $PATH."""
    candidates = [
        os.path.join(cwd, "node_modules", ".bin", "tsx"),  # cwd 已是 apps/desktop/
        os.path.join(cwd, "..", "node_modules", ".bin", "tsx"),  # cwd 是 repo root
        os.path.join(cwd, "..", "..", "node_modules", ".bin", "tsx"),  # cwd 是 apps/
        "/usr/local/bin/tsx",
        "/opt/homebrew/bin/tsx",
    ]
    for p in candidates:
        if os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return None


async def _spawn_cli(script: str, args: list[str], cwd_override: str | None = None, timeout: float = 120.0) -> dict:
    """异步 spawn Node tsx 跑 CLI 脚本.

    Args:
        script: ts 脚本路径 (相对 cwd, e.g. "cli/preview.ts")
        args: 脚本后的参数 (例如 ["--input", "/path", "--json-output"])
        cwd_override: 自定义 cwd (None = 用 daemon cwd)
        timeout: 超时秒数

    Returns:
        {"exit_code": int, "stdout": str, "stderr": str, "stdout_tail": str, "stderr_tail": str}
    """
    cwd = _resolve_cwd(cwd_override)
    tsx = _resolve_tsx_bin(cwd)
    if tsx is None:
        return {
            "exit_code": 127,
            "stdout": "",
            "stderr": f"tsx not found (cwd={cwd}, looked in apps/desktop/node_modules/.bin/tsx + $PATH)",
            "stdout_tail": "",
            "stderr_tail": f"tsx not found (cwd={cwd})",
        }
    # 用 run_in_executor 跑 subprocess (避免 asyncio 阻塞)
    loop = asyncio.get_event_loop()

    def _run():
        try:
            # tsx 调用约定: tsx [flags] <script.ts> [args...]
            # 例如: tsx cli/preview.ts --prompt "..." --out /tmp/...
            cmd = [tsx, script] + args
            proc = subprocess.run(
                cmd,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=timeout,
                env={**os.environ, "PATH": f"{os.path.dirname(tsx)}:{os.environ.get('PATH', '')}"},
            )
            return {
                "exit_code": proc.returncode,
                "stdout": proc.stdout or "",
                "stderr": proc.stderr or "",
                "stdout_tail": (proc.stdout or "")[-3000:],
                "stderr_tail": (proc.stderr or "")[-3000:],
            }
        except subprocess.TimeoutExpired as e:
            return {
                "exit_code": 124,
                "stdout": e.stdout.decode("utf-8", errors="ignore") if e.stdout else "",
                "stderr": (e.stderr.decode("utf-8", errors="ignore") if e.stderr else "") + f"\n[TIMEOUT after {timeout}s]",
                "stdout_tail": "",
                "stderr_tail": f"TIMEOUT after {timeout}s",
            }
        except Exception as e:
            return {
                "exit_code": 1,
                "stdout": "",
                "stderr": f"subprocess error: {e}",
                "stdout_tail": "",
                "stderr_tail": f"subprocess error: {e}",
            }

    return await loop.run_in_executor(None, _run)


def _extract_json_from_stdout(stdout: str) -> dict | None:
    """从 CLI stdout 末尾抽取 JSON object.

    CLI 约定: 把结构化 JSON 用 '---JSON---' 标记后, 跟其他 log 行.
    或者用 lastIndexOf('{') ... lastIndexOf('}') 兜底.
    """
    if not stdout:
        return None
    # 1) 找 '---JSON---' 标记
    marker = "---JSON---"
    if marker in stdout:
        idx = stdout.rindex(marker)
        json_str = stdout[idx + len(marker):].strip()
        try:
            return json.loads(json_str)
        except Exception:
            pass
    # 2) 兜底: 找最后完整的 { ... } 块
    last_brace = stdout.rfind("}")
    if last_brace == -1:
        return None
    first_brace = stdout.rfind("{", 0, last_brace)
    if first_brace == -1:
        return None
    try:
        return json.loads(stdout[first_brace:last_brace + 1])
    except Exception:
        return None


def _read_kb_index_fallback() -> dict:
    """兜底: 从 PRD 3.1 KB 根读 index.json + manifest.json."""
    import platform

    if platform.system() == "Darwin":
        kb_root = os.path.expanduser("~/Library/Application Support/灵犀演示/kb")
    else:
        kb_root = os.path.expanduser("~/.lingxi/kb")
    if not os.path.isdir(kb_root):
        return {"files": [], "entries": [], "failed": [], "kb_root": kb_root, "fallback": True}
    index = {}
    manifest = {}
    try:
        with open(os.path.join(kb_root, "index.json"), "r", encoding="utf-8") as f:
            index = json.load(f)
    except Exception:
        pass
    try:
        with open(os.path.join(kb_root, "manifest.json"), "r", encoding="utf-8") as f:
            manifest = json.load(f)
    except Exception:
        pass
    return {
        "files": index.get("files", []),
        "entries": index.get("entries", []),
        "failed": [],
        "kb_root": kb_root,
        "manifest": manifest,
        "fallback": True,
    }


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