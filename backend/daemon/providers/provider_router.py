"""ProviderRouter — 主备切换逻辑。

CLI 主调用（primary），失败 → API 兜底（fallback）。
每次切换 / fallback 写 stderr 日志，方便排错。

切换触发条件（任一）：
  - ProviderCallError（CLI 退出码非零 / 异常 / 超时 / API 4xx 5xx）
  - asyncio.TimeoutError
  - 任何 Exception（兜底）

可通过 `force` 指定走某一路（server /v1/chat/force 用）。
"""

from __future__ import annotations

import asyncio
import sys
import time
from dataclasses import dataclass, field
from typing import Any

from ..ai_provider import AIProvider, ProviderCallError


@dataclass
class RouterResult:
    """单次 chat 调用结果。

    Attributes:
        content: 模型输出文本。
        provider: 实际生效的 provider 名字（cli / api / mock）。
        fell_back: 是否触发了 fallback。
        fallback_reason: 触发 fallback 的原因（无 fallback 时为 None）。
        elapsed_ms: 实际耗时（毫秒）。
    """

    content: str
    provider: str
    fell_back: bool = False
    fallback_reason: str | None = None
    elapsed_ms: float = 0.0


class ProviderRouter:
    """主备 provider 路由器。

    构造时传 primary + fallback 两个 AIProvider。
    chat() 优先 primary，失败时走 fallback。
    """

    def __init__(
        self,
        primary: AIProvider,
        fallback: AIProvider,
        *,
        primary_name: str | None = None,
        fallback_name: str | None = None,
        log_stream=sys.stderr,
    ) -> None:
        self._primary = primary
        self._fallback = fallback
        self._primary_name = primary_name or primary.name
        self._fallback_name = fallback_name or fallback.name
        self._log = log_stream

    @property
    def primary(self) -> AIProvider:
        return self._primary

    @property
    def fallback(self) -> AIProvider:
        return self._fallback

    @property
    def available(self) -> list[str]:
        """列出当前 router 已知的所有 provider 名字。"""
        return [self._primary_name, self._fallback_name]

    @property
    def active(self) -> str:
        """默认对外报 active 的是 primary。"""
        return self._primary_name

    def _log_line(self, msg: str) -> None:
        """单行 stderr 日志（带时间戳）。"""
        ts = time.strftime("%H:%M:%S")
        self._log.write(f"[{ts}] [router] {msg}\n")
        self._log.flush()

    async def chat(self, prompt: str, **kwargs: Any) -> RouterResult:
        """优先 primary，失败 → fallback。

        任意 Exception 都会被吞并触发 fallback（保留 last_error 供日志）。
        返回 RouterResult 永远不抛异常（除非 fallback 也失败——这种情况下抛最后那个错）。
        """
        # 1. primary
        t0 = time.perf_counter()
        try:
            content = await self._primary.chat(prompt, **kwargs)
            elapsed = (time.perf_counter() - t0) * 1000
            self._log_line(
                f"primary={self._primary_name} ok ({elapsed:.1f}ms) prompt_len={len(prompt)}"
            )
            return RouterResult(
                content=content,
                provider=self._primary_name,
                fell_back=False,
                elapsed_ms=elapsed,
            )
        except Exception as primary_exc:
            primary_err = primary_exc
            reason = self._format_reason(primary_exc)

        # 2. fallback
        self._log_line(
            f"primary={self._primary_name} FAILED ({reason}); falling back to {self._fallback_name}"
        )
        t0 = time.perf_counter()
        try:
            content = await self._fallback.chat(prompt, **kwargs)
            elapsed = (time.perf_counter() - t0) * 1000
            self._log_line(
                f"fallback={self._fallback_name} ok ({elapsed:.1f}ms) after {self._primary_name} failure"
            )
            return RouterResult(
                content=content,
                provider=self._fallback_name,
                fell_back=True,
                fallback_reason=reason,
                elapsed_ms=elapsed,
            )
        except Exception as fallback_exc:
            # 两个都失败：抛 fallback 的（更新过的）
            elapsed = (time.perf_counter() - t0) * 1000
            self._log_line(
                f"fallback={self._fallback_name} ALSO FAILED ({fallback_exc!r}); raising"
            )
            # 链式异常保留 primary 错因
            raise fallback_exc from primary_err

    async def chat_forced(self, provider: str, prompt: str, **kwargs: Any) -> RouterResult:
        """强制走某一路（用于 /v1/chat/force 测试）。

        Args:
            provider: "primary" / "fallback" / 实际名字
            prompt: 提示词
            **kwargs: 透传

        Raises:
            ValueError: provider 名字不识别。
            ProviderCallError: 选中的 provider 调用失败。
        """
        # 名字映射
        if provider in (self._primary_name, "primary"):
            chosen = self._primary
            chosen_name = self._primary_name
            is_fallback = False
        elif provider in (self._fallback_name, "fallback"):
            chosen = self._fallback
            chosen_name = self._fallback_name
            is_fallback = True
        else:
            raise ValueError(
                f"unknown provider {provider!r}; available: {self.available}"
            )

        self._log_line(f"force={chosen_name} prompt_len={len(prompt)}")

        t0 = time.perf_counter()
        try:
            content = await chosen.chat(prompt, **kwargs)
            elapsed = (time.perf_counter() - t0) * 1000
            return RouterResult(
                content=content,
                provider=chosen_name,
                fell_back=is_fallback,
                elapsed_ms=elapsed,
            )
        except ProviderCallError:
            raise

    @staticmethod
    def _format_reason(exc: BaseException) -> str:
        """把异常压成短字符串给日志。"""
        if isinstance(exc, ProviderCallError):
            return str(exc)
        return f"{type(exc).__name__}: {exc}"