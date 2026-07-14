"""MiniMax API provider + Mock provider.

读 env 解析 API key（优先级）+ baseURL + 协议风格：

Key 来源（按优先级）：
  1. 显式注入 api_key 参数
  2. env $MiniMax_API_KEY / $MINIMAX_API_KEY / $minimax_API_KEY (Wave 5a 大小写兼容)
  3. env $__MAVIS_PARENT_ACCESS_TOKEN (mavis daemon 内部继承的 JWT)
  4. ~~通过 `ps eww` 从 mavis daemon 进程抓（mac/linux, last resort)~~
     【W2 fail-closed】默认关闭 (`LINGXI_API_PROVIDER_ALLOW_PS_TOKEN` 默认 0)

协议风格（自动检测 baseURL）：
  - baseURL 含 "mavis/api/v1/llm" → Anthropic /v1/messages 风格
  - 其他 → OpenAI /chat/completions 风格（向后兼容现有测试）

【W2 fail-closed】`LINGXI_API_PROVIDER_ALLOW_MOCK` (默认 0):
  - 0 (默认, fail-closed 模式): 无 key → `is_mock=True` 但 `chat()` 抛 `ProviderCallError("api_key_missing")`,
    provider name 报 "unavailable"。这是为了把 "silent mock" 变成 "loud fail" —
    调用方 / 测试方一看就知道当前不是真活。
  - 1 (显式, smoke test 模式): 无 key → 返回 "hello (mock)", provider name 报 "mock" (不是 "api"，
    避免跟真活路径混淆)。

返回值 / 行为改动后，server.py / router / 测试会看到 `provider != "api"` 的字段。
"""

from __future__ import annotations

import json
import os
import subprocess
from typing import Any

import httpx

from ..ai_provider import AIProvider, ProviderCallError


# API key 环境变量名候选（大小写变体，Wave 5a 加 minimax_API_KEY 兜底）
_API_KEY_ENV_NAMES: tuple[str, ...] = (
    "MiniMax_API_KEY",
    "MINIMAX_API_KEY",
    "minimax_API_KEY",
)

# mavis daemon 内部用的 access token (MiniMax Code 父进程注入)
_MAVIS_PARENT_TOKEN_ENV = "__MAVIS_PARENT_ACCESS_TOKEN"

# mavis daemon 进程名（ps 抓 token 用）
# 选 "daemon.js" 因为：
# - MiniMax Code 主进程通常不继承完整 env（macOS launchd 启动）
# - mavis daemon 才是继承 __MAVIS_PARENT_ACCESS_TOKEN 的进程
# - 路径形如 ".../MiniMax Code.app/.../daemon/daemon.js --port 15321 --owner electron"
_MAVIS_DAEMON_PROCESS_HINT = "daemon.js"


# 【W2 fail-closed】是否允许通过 `ps` 从 mavis daemon 进程抓 token
# 【W2 改默认】从 1 改 0 — 之前默认 1 是因为 env 经常不带 key, 但生产 token 泄露风险高。
# 现在 default 0, 真要 ps 抓 token 显式开。
_PS_TOKEN_ALLOW_ENV = "LINGXI_API_PROVIDER_ALLOW_PS_TOKEN"


def _ps_token_allowed() -> bool:
    """是否启用 ps 抓 token。【W2 改默认】从 True 改 False.

    - 设 "0" / "false" → 禁用（默认行为，fail-closed）
    - 设 "1" / "true" → 显式启用
    - 未设 → 默认禁用（W2 行为变更）
    """
    val = os.environ.get(_PS_TOKEN_ALLOW_ENV, "0").strip().lower()
    return val in ("1", "true", "yes", "on")


# 【W2 fail-closed】是否允许 silent mock 降级
# 默认 0 → 无 key 直接抛错, 不返回 "hello (mock)"
# 设 1 → 显式允许 mock, 返回 "hello (mock)" + provider name "mock" (不是 "api")
_MOCK_ALLOW_ENV = "LINGXI_API_PROVIDER_ALLOW_MOCK"


def _mock_allowed() -> bool:
    """是否允许 silent mock 降级。【W2 新增】默认 False (fail-closed).

    - 设 "0" / "false" → 禁用 silent mock（默认，fail-closed）
    - 设 "1" / "true" / "yes" / "on" → 显式启用（仅 smoke test 用）
    - 未设 → 默认禁用
    """
    val = os.environ.get(_MOCK_ALLOW_ENV, "0").strip().lower()
    return val in ("1", "true", "yes", "on")


def _read_mavis_access_token_from_ps() -> str | None:
    """通过 `ps -eEww` 从 mavis daemon 进程抓 __MAVIS_PARENT_ACCESS_TOKEN。

    适用场景：
      - 用户从 shell 启动 lingxi daemon（env 没有 token）
      - 但 MiniMax Code 启动的 mavis daemon 在跑，里面有这个 token

    Returns:
        token 字符串；找不到返回 None。任意异常都返回 None（fail-safe，不阻塞调用方）。

    Note:
        macOS 用 `ps -eEww` 取 env（-E = environment，-ww = 完整 args）。
        输出形如：" 1144 /Applications/MiniMax Code.app/... KEY1=val1 KEY2=val2"
    """
    if not _ps_token_allowed():
        return None
    try:
        result = subprocess.run(
            ["ps", "-eEww"],
            capture_output=True,
            timeout=3,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None

    if result.returncode != 0 or not result.stdout:
        return None

    # 容忍非 UTF-8 字符（ps 输出可能含路径里的特殊字符）
    try:
        text = result.stdout.decode("utf-8", errors="replace")
    except Exception:
        return None

    # 1. 找到 mavis daemon 那一行
    daemon_line: str | None = None
    for line in text.splitlines():
        if _MAVIS_DAEMON_PROCESS_HINT in line:
            daemon_line = line
            break
    if daemon_line is None:
        return None

    # 2. 从那行的 env 部分提取 token
    # 形如: "PID COMMAND ARGS __MAVIS_PARENT_ACCESS_TOKEN=eyJ... OTHER=val"
    for token in daemon_line.split():
        if token.startswith(f"{_MAVIS_PARENT_TOKEN_ENV}="):
            value = token.split("=", 1)[1]
            if value and value.strip():
                return value.strip()
    return None


def _resolve_api_key() -> str | None:
    """从 env / mavis daemon 进程解析 API key。

    优先级：
      1. 显式大小写兼容的 MiniMax_API_KEY 系列
      2. __MAVIS_PARENT_ACCESS_TOKEN env
      3. ps 抓 mavis daemon 进程（【W2】默认禁用）
    """
    for env_name in _API_KEY_ENV_NAMES:
        val = os.environ.get(env_name)
        if val and val.strip():
            return val.strip()

    mavis_token = os.environ.get(_MAVIS_PARENT_TOKEN_ENV)
    if mavis_token and mavis_token.strip():
        return mavis_token.strip()

    ps_token = _read_mavis_access_token_from_ps()
    if ps_token and ps_token.strip():
        return ps_token.strip()

    return None


def _detect_protocol(base_url: str) -> str:
    """根据 baseURL 检测协议风格。

    - mavis MiniMax 端点 → 'anthropic' (/v1/messages)
    - 其他 → 'openai' (/chat/completions)
    """
    if "mavis/api/v1/llm" in base_url:
        return "anthropic"
    return "openai"


class MockProvider(AIProvider):
    """无 key 时的显式 mock 路径（【W2】只允许 `LINGXI_API_PROVIDER_ALLOW_MOCK=1` 时用）。

    与 MiniMaxAPIProvider.is_mock=True 区分:
    - MockProvider 是独立类, name = "mock", 用于显式 mock 场景
    - MiniMaxAPIProvider.is_mock=True 是"假装有 provider 但其实走 mock 内部"，
      【W2】默认会抛错, 不再 silent 返回 mock
    """

    name = "mock"

    def __init__(self, *, reply: str = "hello (mock)") -> None:
        self._reply = reply

    async def chat(self, prompt: str, **kwargs: Any) -> str:
        return self._reply

    async def health(self) -> bool:
        return True


class UnavailableProvider(AIProvider):
    """【W2 新增】无可用 provider 时占位用, name = "unavailable"。

    chat() 永远抛 ProviderCallError("no_provider_available")。
    用于 router.fallback 也没找到时, 让 server 返回 503 而不是 silent mock。
    """

    name = "unavailable"

    def __init__(self, reason: str = "no_provider_available") -> None:
        self._reason = reason

    async def chat(self, prompt: str, **kwargs: Any) -> str:
        raise ProviderCallError(
            f"[W2 fail-closed] {self._reason}: 无可用 provider (无 MiniMax_API_KEY, CLI 也不可达). "
            f"显式启用 mock: 设 LINGXI_API_PROVIDER_ALLOW_MOCK=1",
            provider=self.name,
        )

    async def health(self) -> bool:
        return False


class MiniMaxAPIProvider(AIProvider):
    """MiniMax API provider。

    支持 OpenAI (/chat/completions) 和 Anthropic (/v1/messages) 两种风格，
    根据 baseURL 自动检测。

    【W2 fail-closed】无 key 且 `LINGXI_API_PROVIDER_ALLOW_MOCK != 1` 时:
      - `is_mock` 仍为 True (兼容现有代码)
      - `chat()` 抛 `ProviderCallError("api_key_missing")` (不返回 "hello (mock)")
      - 调用方 (router / server) 看到异常, 会回 503/502

    有 key 时: 真 LLM 路径, 行为与 W1 一致。
    """

    # 【W2 注意】name 仍是 "api" 以保持向后兼容
    # 但当 is_mock=True 且 mock 不允许时, 上层应改报 "unavailable"
    name = "api"

    DEFAULT_BASE_URL = "https://api.minimaxi.com/v1"
    DEFAULT_OPENAI_BASE_URL = "https://api.minimaxi.com/v1"
    DEFAULT_ENDPOINT_OPENAI = "/chat/completions"
    DEFAULT_ENDPOINT_ANTHROPIC = "/messages"
    DEFAULT_MODEL = "MiniMax-M3"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        endpoint: str | None = None,
        model: str | None = None,
        timeout: float = 30.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        # key 缺省从 env 读（大小写兜底 + mavis token 兜底）
        self._api_key = api_key if api_key is not None else _resolve_api_key()
        # base_url：未传 → 用 mavis 默认（真 LLM 端点）
        # 已传 → 用传入的（兼容 OpenAI 测试场景）
        if base_url is None:
            self._base_url = self.DEFAULT_BASE_URL
        else:
            self._base_url = base_url.rstrip("/")
        # 协议风格由 baseURL 决定
        self._protocol = _detect_protocol(self._base_url)
        # endpoint：未传 → 按协议选默认
        if endpoint is None:
            self._endpoint = (
                self.DEFAULT_ENDPOINT_ANTHROPIC
                if self._protocol == "anthropic"
                else self.DEFAULT_ENDPOINT_OPENAI
            )
        else:
            self._endpoint = endpoint
        # model：未传 → 按协议选默认（mavis 用 MiniMax-M3，OpenAI 用 MiniMax-chat）
        if model is None:
            self._model = self.DEFAULT_MODEL
        else:
            self._model = model
        self._timeout = timeout
        # 允许测试注入 httpx client（mock transport）
        self._external_client = client
        self._owns_client = client is None

    @property
    def is_mock(self) -> bool:
        """当前实例是否走 mock 路径（无 API key）。"""
        return not (self._api_key and self._api_key.strip())

    @property
    def mock_allowed(self) -> bool:
        """当前是否允许 silent mock 降级。【W2 新增】"""
        return _mock_allowed()

    @property
    def effective_name(self) -> str:
        """【W2 新增】根据 is_mock + mock_allowed 返回对外报告的名字:
        - 有 key → "api"
        - 无 key + mock 允许 → "mock"
        - 无 key + mock 不允许 → "unavailable"
        """
        if not self.is_mock:
            return "api"
        if self.mock_allowed:
            return "mock"
        return "unavailable"

    @property
    def protocol(self) -> str:
        """当前实例使用的协议风格（'openai' / 'anthropic'）。"""
        return self._protocol

    async def _get_client(self) -> httpx.AsyncClient:
        if self._external_client is not None:
            return self._external_client
        return httpx.AsyncClient(timeout=self._timeout)

    def _build_payload(self, prompt: str, kwargs: dict[str, Any]) -> dict[str, Any]:
        """构造请求 body（按协议风格）。"""
        if self._protocol == "anthropic":
            payload: dict[str, Any] = {
                "model": self._model,
                "max_tokens": kwargs.get("max_tokens", 1024),
                "messages": [{"role": "user", "content": prompt}],
            }
            if kwargs.get("temperature") is not None:
                payload["temperature"] = kwargs["temperature"]
        else:
            payload = {
                "model": self._model,
                "messages": [{"role": "user", "content": prompt}],
            }
            if kwargs.get("temperature") is not None:
                payload["temperature"] = kwargs["temperature"]
            if kwargs.get("max_tokens") is not None:
                payload["max_tokens"] = kwargs["max_tokens"]
        return payload

    def _extract_content(self, data: dict[str, Any]) -> str:
        """从响应 JSON 提取 content 文本（按协议风格）。"""
        if self._protocol == "anthropic":
            # Anthropic 格式：{"content": [{"type": "text", "text": "..."}, ...]}
            try:
                content_blocks = data["content"]
            except KeyError as exc:
                raise ProviderCallError(
                    f"Unexpected API response shape (no 'content'): {data}",
                    provider=self.name,
                    cause=exc,
                ) from exc
            texts: list[str] = []
            for block in content_blocks:
                if isinstance(block, dict) and block.get("type") == "text":
                    texts.append(str(block.get("text", "")))
            if not texts:
                raise ProviderCallError(
                    f"Unexpected API response (no text blocks): {data}",
                    provider=self.name,
                )
            return "".join(texts)
        # OpenAI 格式
        try:
            return str(data["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderCallError(
                f"Unexpected API response shape: {data}",
                provider=self.name,
                cause=exc,
            ) from exc

    async def chat(self, prompt: str, **kwargs: Any) -> str:
        # 【W2 fail-closed】无 key 时, 如果 mock 允许才返回 mock, 否则抛错
        if self.is_mock:
            if self.mock_allowed:
                # 显式允许 mock 模式 (LINGXI_API_PROVIDER_ALLOW_MOCK=1)
                return "hello (mock)"
            # 【W2 fail-closed】默认: 抛 ProviderCallError, 让上层 (router/server) 知道真没 provider
            raise ProviderCallError(
                "[W2 fail-closed] api_key_missing: 无 MiniMax_API_KEY, "
                "LINGXI_API_PROVIDER_ALLOW_PS_TOKEN 默认 0 禁用 ps 抓 token. "
                "显式启用 mock: 设 LINGXI_API_PROVIDER_ALLOW_MOCK=1",
                provider="unavailable",  # 【W2】上报的名字, 跟 effective_name 一致
            )

        url = f"{self._base_url}{self._endpoint}"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        if self._protocol == "anthropic":
            headers["anthropic-version"] = "2023-06-01"

        payload = self._build_payload(prompt, kwargs)

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
        except json.JSONDecodeError as exc:
            raise ProviderCallError(
                f"API response not JSON: {resp.text[:200]}",
                provider=self.name,
                cause=exc,
            ) from exc

        return self._extract_content(data)

    async def health(self) -> bool:
        # 【W2 fail-closed】
        # - 无 key + 默认 (mock 不允许) → False (无真活)
        # - 无 key + mock 允许 → True (smoke test 模式)
        # - 有 key → True
        if self.is_mock:
            return self.mock_allowed
        return bool(self._api_key)
