"""ProviderRouter 主备切换测试。

覆盖：
  - primary 成功 → 不触发 fallback
  - primary 失败 → 自动 fallback
  - primary + fallback 都失败 → 抛 fallback 错（链式 primary cause）
  - chat_forced 强制走 primary / fallback
  - chat_forced 传未知 provider → ValueError
  - stderr 日志包含 "FALLBACK" 字样
"""

from __future__ import annotations

import io

import pytest

from backend.daemon.ai_provider import AIProvider, ProviderCallError
from backend.daemon.providers.api_provider import MockProvider
from backend.daemon.providers.cli_provider import MiniMaxCLIProvider
from backend.daemon.providers.provider_router import ProviderRouter


class _AlwaysFailProvider(AIProvider):
    """测试用：永远失败。"""

    name = "always_fail"

    def __init__(self, msg: str = "boom"):
        self._msg = msg
        self.calls = 0

    async def chat(self, prompt: str, **kwargs):  # noqa: ARG002
        self.calls += 1
        raise ProviderCallError(self._msg, provider=self.name)

    async def health(self) -> bool:
        return False


class _CountingProvider(AIProvider):
    """测试用：记录调用次数，返回固定字符串。"""

    def __init__(self, name: str, reply: str = "ok"):
        self.name = name
        self._reply = reply
        self.calls = 0

    async def chat(self, prompt: str, **kwargs):  # noqa: ARG002
        self.calls += 1
        return self._reply

    async def health(self) -> bool:
        return True


class TestRouterFallback:
    async def test_primary_success_no_fallback(self):
        primary = _CountingProvider("primary_ok", reply="primary-reply")
        fallback = _CountingProvider("fallback_ok", reply="fallback-reply")
        router = ProviderRouter(primary=primary, fallback=fallback, log_stream=io.StringIO())

        result = await router.chat("hi")
        assert result.content == "primary-reply"
        assert result.provider == "primary_ok"
        assert result.fell_back is False
        assert primary.calls == 1
        assert fallback.calls == 0

    async def test_primary_fails_falls_back(self):
        primary = _AlwaysFailProvider("cli-dead")
        fallback = _CountingProvider("api_ok", reply="api-reply")
        log = io.StringIO()
        router = ProviderRouter(primary=primary, fallback=fallback, log_stream=log)

        result = await router.chat("hi")
        assert result.content == "api-reply"
        assert result.provider == "api_ok"
        assert result.fell_back is True
        assert result.fallback_reason is not None
        assert "cli-dead" in result.fallback_reason
        assert primary.calls == 1
        assert fallback.calls == 1

    async def test_both_fail_raises(self):
        primary = _AlwaysFailProvider("p-fail")
        fallback = _AlwaysFailProvider("f-fail")
        log = io.StringIO()
        router = ProviderRouter(primary=primary, fallback=fallback, log_stream=log)

        with pytest.raises(ProviderCallError) as exc_info:
            await router.chat("hi")
        # primary 是 __cause__（Python 3 raise X from Y）
        assert exc_info.value.__cause__ is not None
        assert isinstance(exc_info.value.__cause__, ProviderCallError)

    async def test_logs_fallback_event(self):
        primary = _AlwaysFailProvider("cli-dead")
        fallback = _CountingProvider("api_ok")
        log = io.StringIO()
        router = ProviderRouter(primary=primary, fallback=fallback, log_stream=log)

        await router.chat("hi")
        log_text = log.getvalue()
        assert "FAILED" in log_text or "fall" in log_text.lower()
        assert "api_ok" in log_text

    async def test_available_lists_both(self):
        router = ProviderRouter(
            primary=MockProvider(),
            fallback=MockProvider(),
            log_stream=io.StringIO(),
        )
        assert set(router.available) == {"mock"}


class TestRouterForced:
    async def test_force_primary_name(self):
        primary = _CountingProvider("primary", reply="from-p")
        fallback = _CountingProvider("fallback", reply="from-f")
        router = ProviderRouter(primary=primary, fallback=fallback, log_stream=io.StringIO())

        result = await router.chat_forced("primary", "hi")
        assert result.content == "from-p"
        assert result.provider == "primary"

    async def test_force_fallback_alias(self):
        primary = _CountingProvider("primary", reply="from-p")
        fallback = _CountingProvider("fallback", reply="from-f")
        router = ProviderRouter(primary=primary, fallback=fallback, log_stream=io.StringIO())

        result = await router.chat_forced("fallback", "hi")
        assert result.content == "from-f"
        assert result.provider == "fallback"

    async def test_force_unknown_provider_raises(self):
        router = ProviderRouter(
            primary=_CountingProvider("primary"),
            fallback=_CountingProvider("fallback"),
            log_stream=io.StringIO(),
        )
        with pytest.raises(ValueError):
            await router.chat_forced("nope", "hi")

    async def test_force_failure_propagates(self):
        primary = _AlwaysFailProvider("p-bad")
        fallback = _CountingProvider("f", reply="ok")
        router = ProviderRouter(primary=primary, fallback=fallback, log_stream=io.StringIO())

        with pytest.raises(ProviderCallError):
            await router.chat_forced("primary", "hi")

    async def test_router_with_real_providers(self, monkeypatch):
        """端到端：CLI primary + API fallback（mock 路径）。"""
        # 没 MiniMax CLI 在 PATH → CLI 必失败；API 没 key → API 走 mock → 成功
        monkeypatch.setenv("PATH", "/nonexistent")
        monkeypatch.delenv("MiniMax_CLI", raising=False)
        monkeypatch.delenv("MiniMax_API_KEY", raising=False)

        cli = MiniMaxCLIProvider(cli_path="/nonexistent/cli_xyz")
        api = MockProvider()
        router = ProviderRouter(primary=cli, fallback=api, log_stream=io.StringIO())

        result = await router.chat("hello world")
        assert result.fell_back is True
        assert result.provider == "mock"
        assert result.content == "hello (mock)"