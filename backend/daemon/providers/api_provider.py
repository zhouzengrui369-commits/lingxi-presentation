"""MiniMax API provider + Mock provider.

读 env $MiniMax_API_KEY 决定模式：
  - 有 key → 真实 HTTP 调用 MiniMax API（也允许测试里注入 mock transport）
  - 无 key → 降级为 MockProvider，返回固定 "hello" 串

注意：本任务是 daemon 抽象层 MVP，不实现 MiniMax API 完整协议（PRD T-1.0.a 不要求）。
Mock 路径保证无 key 时也能跑通 smoke test；真实 API 路径用 httpx + 可注入 transport 测试。
"""

from __future__ import annotations

import os
from typing import Any

import httpx

from ..ai_provider import AIProvider, ProviderCallError


class MockProvider(AIProvider):
    """无 key 时降级使用，纯本地返回 "hello"。

    用作 default fallback + smoke test 用。
    """

    name = "mock"

    def __init__(self, *, reply: str = "hello (mock)") -> None:
        self._reply = reply

    async def chat(self, prompt: str, **kwargs: Any) -> str:
        return self._reply

    async def health(self) -> bool:
        return True


class MiniMaxAPIProvider(AIProvider):
    """MiniMax API provider。

    - 有 MiniMax_API_KEY → 走真实 HTTP（默认 endpoint 可被 base_url / endpoint 覆盖）
    - 无 key → 实际是 MockProvider（保持接口一致）
    """

    name = "api"

    DEFAULT_BASE_URL = "https://api.MiniMax.com/v1"
    DEFAULT_ENDPOINT = "/chat/completions"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        endpoint: str | None = None,
        model: str = "MiniMax-chat",
        timeout: float = 30.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        # key 缺省从 env 读
        self._api_key = api_key if api_key is not None else os.environ.get("MiniMax_API_KEY")
        self._base_url = (base_url or self.DEFAULT_BASE_URL).rstrip("/")
        self._endpoint = endpoint or self.DEFAULT_ENDPOINT
        self._model = model
        self._timeout = timeout
        # 允许测试注入 httpx client（mock transport）
        self._external_client = client
        self._owns_client = client is None

    @property
    def is_mock(self) -> bool:
        """当前实例是否走 mock 路径（无 API key）。"""
        return not (self._api_key and self._api_key.strip())

    async def _get_client(self) -> httpx.AsyncClient:
        if self._external_client is not None:
            return self._external_client
        return httpx.AsyncClient(timeout=self._timeout)

    async def chat(self, prompt: str, **kwargs: Any) -> str:
        if self.is_mock:
            # 降级 mock：返回 hello
            return "hello (mock)"

        url = f"{self._base_url}{self._endpoint}"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self._model,
            "messages": [{"role": "user", "content": prompt}],
            **{k: v for k, v in kwargs.items() if v is not None},
        }

        client = await self._get_client()
        try:
            resp = await client.post(url, json=payload, headers=headers)
        except httpx.HTTPError as exc:
            raise ProviderCallError(
                f"HTTP request failed: {exc}",
                provider=self.name,
                cause=exc,
            ) from exc
        finally:
            if self._owns_client:
                await client.aclose()

        if resp.status_code >= 400:
            raise ProviderCallError(
                f"API returned {resp.status_code}: {resp.text[:200]}",
                provider=self.name,
            )

        try:
            data = resp.json()
        except Exception as exc:
            raise ProviderCallError(
                f"API response not JSON: {resp.text[:200]}",
                provider=self.name,
                cause=exc,
            ) from exc

        # 兼容 OpenAI / MiniMax 风格响应
        try:
            return str(data["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderCallError(
                f"Unexpected API response shape: {data}",
                provider=self.name,
                cause=exc,
            ) from exc

    async def health(self) -> bool:
        # mock 永远健康；真实路径只检查 key 是否存在（不真发请求，避免 cost）
        if self.is_mock:
            return True
        return bool(self._api_key)