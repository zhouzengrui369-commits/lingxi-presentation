"""AIProvider 抽象基类测试。

验证：
  - 基类不能直接实例化（abstract methods 未实现）
  - 具体子类继承后能实例化
"""

from __future__ import annotations

import pytest

from backend.daemon.ai_provider import AIProvider, ProviderCallError
from backend.daemon.providers.api_provider import MockProvider


class TestAIProviderAbstract:
    def test_base_cannot_instantiate(self):
        """AIProvider 基类是抽象类，不能直接实例化。"""
        with pytest.raises(TypeError) as exc_info:
            AIProvider()  # type: ignore[abstract]
        msg = str(exc_info.value).lower()
        # Python 抽象类报错信息包含 "abstract" 字样
        assert "abstract" in msg or "instantiate" in msg

    def test_subclass_must_implement_chat_and_health(self):
        """只实现一个方法不够。"""

        class HalfBaked(AIProvider):
            name = "half"

            async def chat(self, prompt: str, **kwargs):  # noqa: ARG002
                return "ok"

            # 没实现 health

        with pytest.raises(TypeError):
            HalfBaked()  # type: ignore[abstract]

    def test_concrete_subclass_works(self):
        """MockProvider 是完整实现，可实例化。"""
        p = MockProvider(reply="hi")
        assert p.name == "mock"

        import asyncio
        result = asyncio.run(p.chat("hello"))
        assert result == "hi"
        assert asyncio.run(p.health()) is True

    def test_provider_call_error_chains_cause(self):
        """ProviderCallError 可链式保留 cause。"""
        original = OSError("boom")
        err = ProviderCallError("call failed", provider="cli", cause=original)
        s = str(err)
        assert "cli" in s
        assert "boom" in s
        assert "OSError" in s
        assert err.cause is original
        assert err.provider == "cli"