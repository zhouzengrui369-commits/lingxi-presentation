"""API provider 测试。

覆盖：
  - 无 env key → 走 mock 路径
  - 有 key + httpx MockTransport → 真实 HTTP 路径跑通
  - 5xx → ProviderCallError
  - 异常响应 schema → ProviderCallError
"""

from __future__ import annotations

import json

import httpx
import pytest

from backend.daemon.ai_provider import ProviderCallError
from backend.daemon.providers.api_provider import MockProvider, MiniMaxAPIProvider


class TestApiProviderNoKey:
    async def test_no_env_key_uses_mock(self, monkeypatch):
        """【W2 fail-closed】env 没 MiniMax_API_KEY → is_mock=True, chat 抛 ProviderCallError (不返回 mock)。

        旧 W1 行为: silent mock 返 "hello (mock)", fail-open
        新 W2 行为: chat() 抛 ProviderCallError, fail-closed
        """
        monkeypatch.delenv("MiniMax_API_KEY", raising=False)
        monkeypatch.delenv("MINIMAX_API_KEY", raising=False)
        monkeypatch.delenv("minimax_API_KEY", raising=False)
        # 关闭 ps 抓 token（避免测试环境拉到 mavis daemon 的 token → is_mock=False）
        monkeypatch.setenv("LINGXI_API_PROVIDER_ALLOW_PS_TOKEN", "0")
        # 【W2 新增】默认 mock 也不允许
        monkeypatch.delenv("LINGXI_API_PROVIDER_ALLOW_MOCK", raising=False)
        p = MiniMaxAPIProvider()
        assert p.is_mock is True
        # 【W2】effective_name 报 "unavailable" 而非 "api" 或 "mock"
        assert p.effective_name == "unavailable"
        # 【W2】health 报 False (无真活 provider)
        assert await p.health() is False
        # 【W2】chat() 抛 ProviderCallError, 不返回 "hello (mock)"
        from backend.daemon.ai_provider import ProviderCallError
        with pytest.raises(ProviderCallError) as exc_info:
            await p.chat("anything")
        assert "api_key_missing" in str(exc_info.value) or "fail-closed" in str(exc_info.value)

    async def test_no_env_key_with_mock_allowed_returns_hello(self, monkeypatch):
        """【W2】显式 LINGXI_API_PROVIDER_ALLOW_MOCK=1 → is_mock=True, chat 返 mock (smoke test 模式)。"""
        monkeypatch.delenv("MiniMax_API_KEY", raising=False)
        monkeypatch.setenv("LINGXI_API_PROVIDER_ALLOW_PS_TOKEN", "0")
        monkeypatch.setenv("LINGXI_API_PROVIDER_ALLOW_MOCK", "1")
        p = MiniMaxAPIProvider()
        assert p.is_mock is True
        assert p.effective_name == "mock"  # 【W2】显式 mock 模式下 effective_name 是 "mock"
        # mock 模式下 health 可以 True (smoke test 期望)
        assert await p.health() is True
        assert await p.chat("anything") == "hello (mock)"

    async def test_empty_key_treated_as_missing(self, monkeypatch):
        """key 设成空串也算 mock。"""
        monkeypatch.setenv("MiniMax_API_KEY", "   ")
        monkeypatch.setenv("LINGXI_API_PROVIDER_ALLOW_PS_TOKEN", "0")
        monkeypatch.setenv("LINGXI_API_PROVIDER_ALLOW_MOCK", "1")
        p = MiniMaxAPIProvider()
        assert p.is_mock is True

    async def test_custom_mock_reply(self, monkeypatch):
        """直接显式传 api_key=None 强制 mock 路径。【W2】需显式 enable mock。"""
        monkeypatch.delenv("MiniMax_API_KEY", raising=False)
        monkeypatch.setenv("LINGXI_API_PROVIDER_ALLOW_PS_TOKEN", "0")
        monkeypatch.setenv("LINGXI_API_PROVIDER_ALLOW_MOCK", "1")
        p = MiniMaxAPIProvider(api_key=None)
        assert p.is_mock is True
        assert p.effective_name == "mock"


def _mock_transport_handler(content: str = "hello from api"):
    """生成一个 httpx MockTransport handler，模拟 MiniMax 风格 chat completion 响应。"""

    def handler(request: httpx.Request) -> httpx.Response:
        # 验证请求结构
        body = json.loads(request.content.decode("utf-8"))
        assert body["messages"][0]["role"] == "user"
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"role": "assistant", "content": content}}],
            },
        )

    return handler


class TestApiProviderWithKey:
    async def test_chat_with_injected_client(self, monkeypatch):
        """注入 httpx MockTransport，验证真实 HTTP 路径。"""
        monkeypatch.setenv("MiniMax_API_KEY", "sk-test-abc123")
        transport = httpx.MockTransport(_mock_transport_handler("hello api"))
        # base_url 显式给 OpenAI 风格（不含 mavis），同时给 httpx client（让 transport 命中）
        p = MiniMaxAPIProvider(
            base_url="https://api.example",
            client=httpx.AsyncClient(transport=transport, base_url="https://api.example"),
        )
        assert p.is_mock is False
        assert await p.health() is True
        out = await p.chat("hi")
        assert out == "hello api"

    async def test_chat_5xx_raises(self, monkeypatch):
        monkeypatch.setenv("MiniMax_API_KEY", "sk-test")

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text="internal error")

        transport = httpx.MockTransport(handler)
        p = MiniMaxAPIProvider(client=httpx.AsyncClient(transport=transport, base_url="https://api.example"))
        with pytest.raises(ProviderCallError) as exc_info:
            await p.chat("hi")
        assert "500" in str(exc_info.value)

    async def test_chat_bad_json_raises(self, monkeypatch):
        monkeypatch.setenv("MiniMax_API_KEY", "sk-test")

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, text="not json")

        transport = httpx.MockTransport(handler)
        p = MiniMaxAPIProvider(client=httpx.AsyncClient(transport=transport, base_url="https://api.example"))
        with pytest.raises(ProviderCallError):
            await p.chat("hi")

    async def test_chat_unexpected_shape_raises(self, monkeypatch):
        monkeypatch.setenv("MiniMax_API_KEY", "sk-test")

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"choices": []})  # empty choices

        transport = httpx.MockTransport(handler)
        p = MiniMaxAPIProvider(client=httpx.AsyncClient(transport=transport, base_url="https://api.example"))
        with pytest.raises(ProviderCallError) as exc_info:
            await p.chat("hi")
        assert "shape" in str(exc_info.value).lower()


class TestMockProviderDirect:
    async def test_mock_provider_health(self):
        m = MockProvider()
        assert await m.health() is True

    async def test_mock_provider_default_reply(self):
        m = MockProvider()
        assert await m.chat("anything") == "hello (mock)"

    async def test_mock_provider_custom_reply(self):
        m = MockProvider(reply="custom answer")
        assert await m.chat("x") == "custom answer"