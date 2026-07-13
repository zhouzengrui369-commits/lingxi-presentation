"""Server 端到端测试。

用 httpx.AsyncClient + ASGITransport 直接打到 FastAPI app（不真起端口），
覆盖：
  - GET /v1/health
  - POST /v1/chat
  - GET /v1/providers
  - POST /v1/chat/force
  - 校验 schema（422 输入校验）
  - 注入 mock router 验证 fallback 路径
"""

from __future__ import annotations

import asyncio
import io
import socket

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.daemon.ai_provider import AIProvider, ProviderCallError
from backend.daemon.providers.provider_router import ProviderRouter
from backend.daemon.server import _find_free_port, create_app


class _StubProvider(AIProvider):
    def __init__(self, name: str, reply: str = "stub-reply", fail: bool = False):
        self.name = name
        self._reply = reply
        self._fail = fail

    async def chat(self, prompt: str, **kwargs):  # noqa: ARG002
        if self._fail:
            raise ProviderCallError(f"{self.name}-fail", provider=self.name)
        return f"{self._reply}:{prompt}"

    async def health(self) -> bool:
        return not self._fail


def _make_router(primary_fail: bool = False):
    primary = _StubProvider("cli", reply="cli-reply", fail=primary_fail)
    fallback = _StubProvider("api", reply="api-reply")
    return ProviderRouter(primary=primary, fallback=fallback, log_stream=io.StringIO())


class TestHealthEndpoint:
    def test_health_returns_ok(self):
        """【W2】健康 router (StubProvider 都 alive) → status=ok, available=True, active_provider=cli."""
        app = create_app(_make_router())
        with TestClient(app) as client:
            r = client.get("/v1/health")
            assert r.status_code == 200
            data = r.json()
            assert data["status"] == "ok"
            assert data["available"] is True
            assert data["active_provider"] == "cli"  # 【W2 新增】effective_name
            assert "cli" in data["providers"]
            assert "api" in data["providers"]

    def test_health_returns_degraded_when_no_provider(self, monkeypatch):
        """【W2 新增】没 API key + 没 CLI → status=degraded, available=False, active_provider=unavailable."""
        monkeypatch.delenv("MiniMax_API_KEY", raising=False)
        monkeypatch.delenv("MINIMAX_API_KEY", raising=False)
        monkeypatch.delenv("minimax_API_KEY", raising=False)
        monkeypatch.setenv("LINGXI_API_PROVIDER_ALLOW_PS_TOKEN", "0")
        monkeypatch.delenv("LINGXI_API_PROVIDER_ALLOW_MOCK", raising=False)
        # 用真 router (cli 找不到 + api 无 key)
        from backend.daemon.server import build_router
        app = create_app(build_router())
        with TestClient(app) as client:
            r = client.get("/v1/health")
            assert r.status_code == 200
            data = r.json()
            assert data["status"] == "degraded", data
            assert data["available"] is False
            assert data["active_provider"] == "unavailable"


class TestProvidersEndpoint:
    def test_providers_lists_active(self):
        """【W2】健康 router → active=cli (effective_name, 不是死值)."""
        app = create_app(_make_router())
        with TestClient(app) as client:
            r = client.get("/v1/providers")
            assert r.status_code == 200
            data = r.json()
            assert data["active"] == "cli"
            assert set(data["available"]) == {"cli", "api"}

    def test_providers_active_unavailable_when_no_provider(self, monkeypatch):
        """【W2】没 key + 没 CLI → active=unavailable."""
        monkeypatch.delenv("MiniMax_API_KEY", raising=False)
        monkeypatch.delenv("MINIMAX_API_KEY", raising=False)
        monkeypatch.delenv("minimax_API_KEY", raising=False)
        monkeypatch.setenv("LINGXI_API_PROVIDER_ALLOW_PS_TOKEN", "0")
        monkeypatch.delenv("LINGXI_API_PROVIDER_ALLOW_MOCK", raising=False)
        from backend.daemon.server import build_router
        app = create_app(build_router())
        with TestClient(app) as client:
            r = client.get("/v1/providers")
            assert r.status_code == 200
            data = r.json()
            assert data["active"] == "unavailable"


class TestChatEndpoint:
    def test_chat_happy_path(self):
        app = create_app(_make_router(primary_fail=False))
        with TestClient(app) as client:
            r = client.post("/v1/chat", json={"prompt": "hello"})
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["content"] == "cli-reply:hello"
            assert data["provider"] == "cli"
            assert data["fell_back"] is False
            # 【W2 新增】provider_status 字段
            assert data.get("provider_status") == "live"

    def test_chat_falls_back_to_api(self):
        app = create_app(_make_router(primary_fail=True))
        with TestClient(app) as client:
            r = client.post("/v1/chat", json={"prompt": "hello"})
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["content"] == "api-reply:hello"
            assert data["provider"] == "api"
            assert data["fell_back"] is True
            # 【W2 新增】provider_status 字段
            assert data.get("provider_status") == "degraded"  # 真活 fallback 走 degraded (不是 mock)

    def test_chat_validates_empty_prompt(self):
        app = create_app(_make_router())
        with TestClient(app) as client:
            r = client.post("/v1/chat", json={"prompt": ""})
            assert r.status_code == 422

    def test_chat_validates_missing_prompt(self):
        app = create_app(_make_router())
        with TestClient(app) as client:
            r = client.post("/v1/chat", json={})
            assert r.status_code == 422

    def test_chat_with_temperature(self):
        app = create_app(_make_router())
        with TestClient(app) as client:
            r = client.post(
                "/v1/chat",
                json={"prompt": "hi", "temperature": 0.7, "max_tokens": 100},
            )
            assert r.status_code == 200

    def test_chat_temperature_out_of_range(self):
        app = create_app(_make_router())
        with TestClient(app) as client:
            r = client.post("/v1/chat", json={"prompt": "hi", "temperature": 5.0})
            assert r.status_code == 422


class TestChatForceEndpoint:
    def test_force_primary(self):
        app = create_app(_make_router())
        with TestClient(app) as client:
            r = client.post("/v1/chat/force?provider=cli", json={"prompt": "x"})
            assert r.status_code == 200
            data = r.json()
            assert data["provider"] == "cli"

    def test_force_fallback(self):
        app = create_app(_make_router())
        with TestClient(app) as client:
            r = client.post("/v1/chat/force?provider=api", json={"prompt": "x"})
            assert r.status_code == 200
            data = r.json()
            assert data["provider"] == "api"

    def test_force_alias_primary(self):
        app = create_app(_make_router())
        with TestClient(app) as client:
            r = client.post("/v1/chat/force?provider=primary", json={"prompt": "x"})
            assert r.status_code == 200
            assert r.json()["provider"] == "cli"

    def test_force_unknown_provider_400(self):
        app = create_app(_make_router())
        with TestClient(app) as client:
            r = client.post("/v1/chat/force?provider=nope", json={"prompt": "x"})
            assert r.status_code == 400


class TestPortRandom:
    """验证 _find_free_port 真的随机（每次端口不一样）。"""

    def test_free_ports_are_different(self):
        ports = {_find_free_port() for _ in range(5)}
        assert len(ports) == 5, f"ports not random: {ports}"


class TestServerRealBoot:
    """真启 uvicorn server 在随机端口，curl-style 通过 httpx 验证。

    用子进程方式跑 server（避免 TestClient 与真实端口混用）。
    """

    async def test_real_server_health(self):
        """【W2 更新】显式 LINGXI_API_PROVIDER_ALLOW_MOCK=1 让 mock 可用 (smoke test)。

        W1 行为: silent mock 返 "hello (mock)" + provider=api
        W2 行为 (显式允许 mock): 返 "hello (mock)" + provider=mock + provider_status=mock
        W2 行为 (默认): 返 503 E_NO_PROVIDER (在 test_real_server_fail_closed_no_key 测)
        """
        import os
        import signal
        import subprocess
        import sys
        import time

        env = os.environ.copy()
        # 【W2】显式允许 mock 模式
        env["LINGXI_API_PROVIDER_ALLOW_MOCK"] = "1"
        env["LINGXI_API_PROVIDER_ALLOW_PS_TOKEN"] = "0"
        env.pop("MiniMax_API_KEY", None)
        env.pop("MINIMAX_API_KEY", None)
        env.pop("minimax_API_KEY", None)
        env.pop("__MAVIS_PARENT_ACCESS_TOKEN", None)

        # 起 server
        proc = subprocess.Popen(
            [sys.executable, "-m", "backend.daemon.server"],
            cwd="/Users/njx/Project/wt-mvp-recovery-w2",
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        try:
            # 读 PID + port
            pid_line = proc.stdout.readline().strip()
            port_line = proc.stdout.readline().strip()
            assert pid_line.isdigit(), f"bad PID line: {pid_line!r}"
            assert port_line.isdigit(), f"bad port line: {port_line!r}"
            port = int(port_line)

            # 等 server ready
            base = f"http://127.0.0.1:{port}"
            for _ in range(20):
                try:
                    r = httpx.get(f"{base}/v1/health", timeout=0.5)
                    if r.status_code == 200:
                        break
                except Exception:
                    pass
                time.sleep(0.1)
            else:
                pytest.fail("server didn't become ready in 2s")

            # 1. health
            r = httpx.get(f"{base}/v1/health")
            assert r.status_code == 200
            data = r.json()
            # 【W2】smoke test 模式: status="ok" (允许 mock 也算 ok)
            assert data["status"] == "ok", data
            assert data["available"] is True
            # 【W2】active_provider 报 "mock" (effective_name), 因为允许 mock
            assert data["active_provider"] == "mock"

            # 2. providers
            r = httpx.get(f"{base}/v1/providers")
            assert r.status_code == 200
            assert r.json()["active"] == "mock"  # 【W2】effective_name

            # 3. chat (CLI 找不到 → fallback mock → 显式允许)
            r = httpx.post(f"{base}/v1/chat", json={"prompt": "hi"})
            assert r.status_code == 200
            data = r.json()
            assert data["fell_back"] is True
            # 【W2】provider 字段保持 "api" (router 内部名), 但 provider_status 显式标 "mock"
            assert data["provider"] == "api"
            assert data["provider_status"] == "mock"
            assert data["content"] == "hello (mock)"

            # 4. force
            r = httpx.post(f"{base}/v1/chat/force?provider=api", json={"prompt": "force"})
            assert r.status_code == 200
            data = r.json()
            assert data["provider"] == "api"
            assert data["provider_status"] == "mock"
        finally:
            proc.send_signal(signal.SIGTERM)
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()

    async def test_real_server_fail_closed_no_key(self):
        """【W2 fail-closed 关键测试】无 key + 默认 → /v1/chat 返 503 E_NO_PROVIDER, /v1/health 报 degraded.

        这是钉子 #46 false-green 的根因修复 — 之前 silent mock 返 200 OK, 现在 503.
        """
        import os
        import signal
        import subprocess
        import sys
        import time

        env = os.environ.copy()
        # 【W2 默认行为】不显式设 LINGXI_API_PROVIDER_ALLOW_MOCK → 默认 0 → fail-closed
        env.pop("LINGXI_API_PROVIDER_ALLOW_MOCK", None)
        env["LINGXI_API_PROVIDER_ALLOW_PS_TOKEN"] = "0"
        env.pop("MiniMax_API_KEY", None)
        env.pop("MINIMAX_API_KEY", None)
        env.pop("minimax_API_KEY", None)
        env.pop("__MAVIS_PARENT_ACCESS_TOKEN", None)

        proc = subprocess.Popen(
            [sys.executable, "-m", "backend.daemon.server"],
            cwd="/Users/njx/Project/wt-mvp-recovery-w2",
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        try:
            pid_line = proc.stdout.readline().strip()
            port_line = proc.stdout.readline().strip()
            port = int(port_line)

            base = f"http://127.0.0.1:{port}"
            for _ in range(20):
                try:
                    r = httpx.get(f"{base}/v1/health", timeout=0.5)
                    if r.status_code == 200:
                        break
                except Exception:
                    pass
                time.sleep(0.1)
            else:
                pytest.fail("server didn't become ready in 2s")

            # 1. /v1/health: degraded, available=False, active_provider=unavailable
            r = httpx.get(f"{base}/v1/health")
            assert r.status_code == 200
            data = r.json()
            assert data["status"] == "degraded", data
            assert data["available"] is False
            assert data["active_provider"] == "unavailable"

            # 2. /v1/providers: active=unavailable
            r = httpx.get(f"{base}/v1/providers")
            assert r.status_code == 200
            assert r.json()["active"] == "unavailable"

            # 3. /v1/chat: 503 E_NO_PROVIDER (NOT 200 + "hello (mock)")
            r = httpx.post(f"{base}/v1/chat", json={"prompt": "hi"})
            assert r.status_code == 503, f"Expected 503 (fail-closed), got {r.status_code}: {r.text}"
            data = r.json()
            assert data["detail"]["error"] == "no_provider_available"
            assert data["detail"]["error_code"] == "E_NO_PROVIDER"
            assert "api_key_missing" in data["detail"]["message"] or "fail-closed" in data["detail"]["message"]

            # 4. /v1/chat/force?provider=api: 503 (key missing, fail-closed)
            r = httpx.post(f"{base}/v1/chat/force?provider=api", json={"prompt": "force"})
            assert r.status_code == 503, f"Expected 503, got {r.status_code}: {r.text}"

            # 5. /v1/chat/force?provider=cli: 503 (CLI not found)
            r = httpx.post(f"{base}/v1/chat/force?provider=cli", json={"prompt": "force"})
            assert r.status_code == 503
        finally:
            proc.send_signal(signal.SIGTERM)
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()