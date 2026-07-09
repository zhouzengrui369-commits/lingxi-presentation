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
        app = create_app(_make_router())
        with TestClient(app) as client:
            r = client.get("/v1/health")
            assert r.status_code == 200
            data = r.json()
            assert data["status"] == "ok"
            assert "cli" in data["providers"]
            assert "api" in data["providers"]


class TestProvidersEndpoint:
    def test_providers_lists_active(self):
        app = create_app(_make_router())
        with TestClient(app) as client:
            r = client.get("/v1/providers")
            assert r.status_code == 200
            data = r.json()
            assert data["active"] == "cli"
            assert set(data["available"]) == {"cli", "api"}


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

    def test_chat_falls_back_to_api(self):
        app = create_app(_make_router(primary_fail=True))
        with TestClient(app) as client:
            r = client.post("/v1/chat", json={"prompt": "hello"})
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["content"] == "api-reply:hello"
            assert data["provider"] == "api"
            assert data["fell_back"] is True

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
        """起真 server + httpx async client 验证 4 endpoints。"""
        import os
        import signal
        import subprocess
        import sys
        import time

        env = os.environ.copy()
        # 让 fallback 用 mock（避免任何真实网络调用）
        env["MiniMax_API_KEY"] = ""
        env.pop("MiniMax_API_KEY", None)

        # 起 server
        proc = subprocess.Popen(
            [sys.executable, "-m", "backend.daemon.server"],
            cwd="/Users/njx/Project/wt-daemon",
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
            assert r.json()["status"] == "ok"

            # 2. providers
            r = httpx.get(f"{base}/v1/providers")
            assert r.status_code == 200
            assert r.json()["active"] == "cli"

            # 3. chat（CLI 找不到 → fallback mock）
            r = httpx.post(f"{base}/v1/chat", json={"prompt": "hi"})
            assert r.status_code == 200
            data = r.json()
            # 因为 PATH 没有 MiniMax CLI → CLI 会失败 → fallback mock
            assert data["fell_back"] is True
            assert data["provider"] == "api"  # mock 在 API provider 里
            assert data["content"] == "hello (mock)"

            # 4. force
            r = httpx.post(f"{base}/v1/chat/force?provider=api", json={"prompt": "force"})
            assert r.status_code == 200
            assert r.json()["provider"] == "api"
        finally:
            proc.send_signal(signal.SIGTERM)
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()