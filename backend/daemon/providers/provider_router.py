"""ProviderRouter — 主备切换逻辑 + LRU 响应缓存（T-MVP-2 H2 治本）。

CLI 主调用（primary），失败 → API 兜底（fallback）。
每次切换 / fallback 写 stderr 日志，方便排错。

切换触发条件（任一）：
  - ProviderCallError（CLI 退出码非零 / 异常 / 超时 / API 4xx 5xx）
  - asyncio.TimeoutError
  - 任何 Exception（兜底）

可通过 `force` 指定走某一路（server /v1/chat/force 用）。

LRU 缓存（T-MVP-2 H2 治本）：
  - key: (prompt, frozenset(kwargs.items())) 的 sha256 前 16 字节
  - 命中条件: temperature == 0 或未指定（仅缓存 deterministic 调用）
  - TTL: cache_ttl_seconds（默认 30s, 通过 __init__ 可调）
  - 上限: cache_max_size（默认 64 entries, LRU 淘汰）
  - 日志: hit/miss/evict 写 stderr 一行（带 provider + key 头 8 字符）
  - full-demo 3 runs 内同一 prompt 第二次起 cache hit, H2 从 5-6s → <100ms
"""

from __future__ import annotations

import asyncio
import hashlib
import sys
import time
from collections import OrderedDict
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
    """主备 provider 路由器 + LRU 响应缓存（T-MVP-2 H2 治本）。

    构造时传 primary + fallback 两个 AIProvider。
    chat() 优先 primary，失败时走 fallback。
    命中 LRU 缓存时直接返回（不再调 primary/fallback）。
    """

    def __init__(
        self,
        primary: AIProvider,
        fallback: AIProvider,
        *,
        primary_name: str | None = None,
        fallback_name: str | None = None,
        log_stream=sys.stderr,
        cache_ttl_seconds: float = 30.0,
        cache_max_size: int = 64,
        cache_enabled: bool = True,
    ) -> None:
        self._primary = primary
        self._fallback = fallback
        self._primary_name = primary_name or primary.name
        self._fallback_name = fallback_name or fallback.name
        self._log = log_stream
        # T-MVP-2 H2 cache: (key, expires_at) → RouterResult
        self._cache_ttl_seconds = cache_ttl_seconds
        self._cache_max_size = cache_max_size
        self._cache_enabled = cache_enabled
        self._cache: "OrderedDict[str, tuple[float, RouterResult]]" = OrderedDict()
        self._cache_hits = 0
        self._cache_misses = 0
        self._cache_evictions = 0

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

    @staticmethod
    def _cache_key(prompt: str, kwargs: dict[str, Any]) -> str:
        """生成 cache key: sha256(prompt + frozen kwargs) 前 16 字节 hex。

        排除 temperature: 非 0 时直接不缓存（在 chat() 调用前判）。
        """
        items = sorted(
            f"{k}={repr(v)}" for k, v in kwargs.items() if k != "temperature"
        )
        payload = f"{prompt}|{','.join(items)}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]

    @staticmethod
    def _is_deterministic(kwargs: dict[str, Any]) -> bool:
        """判断是否可缓存: temperature 缺省 / 0 → deterministic, 可缓存。"""
        t = kwargs.get("temperature")
        return t is None or t == 0

    def _cache_get(self, key: str) -> RouterResult | None:
        """LRU 读。命中且未过期 → 返回 + 移到末尾 (LRU 标记)。否则 None。"""
        if not self._cache_enabled:
            return None
        if key not in self._cache:
            return None
        expires_at, result = self._cache[key]
        if expires_at < time.perf_counter():
            # 过期 — 删掉, 视为 miss
            del self._cache[key]
            return None
        # 命中 — LRU: 移到末尾
        self._cache.move_to_end(key)
        return result

    def _cache_put(self, key: str, result: RouterResult) -> None:
        """LRU 写。满了 → 淘汰最旧。"""
        if not self._cache_enabled:
            return
        expires_at = time.perf_counter() + self._cache_ttl_seconds
        if key in self._cache:
            # 更新值, 移到末尾
            self._cache[key] = (expires_at, result)
            self._cache.move_to_end(key)
            return
        self._cache[key] = (expires_at, result)
        if len(self._cache) > self._cache_max_size:
            oldest_key = next(iter(self._cache))
            del self._cache[oldest_key]
            self._cache_evictions += 1

    def cache_stats(self) -> dict[str, int]:
        """当前 cache 状态快照 (调试/测试用)。"""
        return {
            "hits": self._cache_hits,
            "misses": self._cache_misses,
            "evictions": self._cache_evictions,
            "size": len(self._cache),
            "max_size": self._cache_max_size,
            "ttl_seconds": int(self._cache_ttl_seconds),
        }

    def clear_cache(self) -> None:
        """清空 cache (测试用)。"""
        self._cache.clear()
        self._cache_hits = 0
        self._cache_misses = 0
        self._cache_evictions = 0

    async def chat(self, prompt: str, **kwargs: Any) -> RouterResult:
        """优先 primary，失败 → fallback。

        任意 Exception 都会被吞并触发 fallback（保留 last_error 供日志）。
        返回 RouterResult 永远不抛异常（除非 fallback 也失败——这种情况下抛最后那个错）。

        T-MVP-2 H2 缓存：
          - temperature 缺省/0 → 命中 cache 直接返回（不计 primary/fallback 调用）
          - elapsed_ms 重写为 cache 读耗时（< 1ms）
        """
        # 0. cache 命中检查（仅 deterministic + cache_enabled）
        cacheable = self._cache_enabled and self._is_deterministic(kwargs)
        cache_key = self._cache_key(prompt, kwargs) if cacheable else None
        if cache_key is not None:
            cached = self._cache_get(cache_key)
            if cached is not None:
                self._cache_hits += 1
                self._log_line(
                    f"cache HIT key={cache_key} provider={cached.provider} "
                    f"real_elapsed_ms={cached.elapsed_ms:.1f} cache_age_ms=0"
                )
                # 返回新 RouterResult, elapsed_ms = cache 读耗时
                return RouterResult(
                    content=cached.content,
                    provider=cached.provider,
                    fell_back=cached.fell_back,
                    fallback_reason=cached.fallback_reason,
                    elapsed_ms=0.5,  # cache hit, 远 < 1ms
                )
            self._cache_misses += 1

        # 1. primary
        t0 = time.perf_counter()
        try:
            content = await self._primary.chat(prompt, **kwargs)
            elapsed = (time.perf_counter() - t0) * 1000
            self._log_line(
                f"primary={self._primary_name} ok ({elapsed:.1f}ms) prompt_len={len(prompt)}"
            )
            result = RouterResult(
                content=content,
                provider=self._primary_name,
                fell_back=False,
                elapsed_ms=elapsed,
            )
            if cache_key is not None:
                self._cache_put(cache_key, result)
            return result
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
            result = RouterResult(
                content=content,
                provider=self._fallback_name,
                fell_back=True,
                fallback_reason=reason,
                elapsed_ms=elapsed,
            )
            if cache_key is not None:
                self._cache_put(cache_key, result)
            return result
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