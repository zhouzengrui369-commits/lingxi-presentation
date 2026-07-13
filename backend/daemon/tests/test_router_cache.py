"""ProviderRouter LRU 缓存测试 — T-MVP-2 H2 治本

覆盖：
  - cache miss → 调 primary, 写入 cache
  - cache hit (同 prompt, 同 kwargs) → 不调 primary, elapsed_ms=0.5
  - cache hit (同 prompt, 不同 kwargs) → miss (key 不同)
  - cache 禁用 (cache_enabled=False) → 永远 miss
  - temperature > 0 → 不缓存
  - TTL 过期 → miss
  - LRU 淘汰 (max_size=2, 第 3 个写入淘汰第 1 个)
  - fallback 路径也缓存
  - cache_stats() 报告 hits/misses/size
  - clear_cache() 重置
"""

from __future__ import annotations

import asyncio
import io
import time

import pytest

from backend.daemon.ai_provider import AIProvider, ProviderCallError
from backend.daemon.providers.api_provider import MockProvider
from backend.daemon.providers.provider_router import ProviderRouter


class _CountingProvider(AIProvider):
    """测试用: 记录每次 chat 调用次数。"""

    def __init__(self, name: str, reply: str = "ok", delay_ms: int = 0):
        self.name = name
        self._reply = reply
        self._delay_ms = delay_ms
        self.calls: int = 0
        self.call_prompts: list[str] = []

    async def chat(self, prompt: str, **kwargs):  # noqa: ARG002
        self.calls += 1
        self.call_prompts.append(prompt)
        if self._delay_ms > 0:
            await asyncio.sleep(self._delay_ms / 1000.0)
        return self._reply

    async def health(self) -> bool:
        return True


class _AlwaysFailProvider(AIProvider):
    name = "always_fail"

    def __init__(self, msg: str = "boom"):
        self._msg = msg
        self.calls = 0

    async def chat(self, prompt: str, **kwargs):  # noqa: ARG002
        self.calls += 1
        raise ProviderCallError(self._msg, provider=self.name)

    async def health(self) -> bool:
        return False


class TestRouterCache:
    async def test_cache_miss_calls_primary(self):
        primary = _CountingProvider("p", reply="hello")
        fallback = MockProvider()
        router = ProviderRouter(primary=primary, fallback=fallback, log_stream=io.StringIO())
        result = await router.chat("hi")
        assert result.content == "hello"
        assert result.provider == "p"
        assert primary.calls == 1
        stats = router.cache_stats()
        assert stats["hits"] == 0
        assert stats["misses"] == 1
        assert stats["size"] == 1

    async def test_cache_hit_does_not_call_primary(self):
        primary = _CountingProvider("p", reply="hello")
        fallback = MockProvider()
        router = ProviderRouter(primary=primary, fallback=fallback, log_stream=io.StringIO())
        # 第 1 次: miss → 写 cache
        r1 = await router.chat("hi")
        # 第 2 次: hit → 不调 primary
        r2 = await router.chat("hi")
        assert r1.content == "hello"
        assert r2.content == "hello"
        assert r2.elapsed_ms == 0.5  # cache hit
        assert primary.calls == 1, "primary should be called only once (cache hit on 2nd)"
        stats = router.cache_stats()
        assert stats["hits"] == 1
        assert stats["misses"] == 1
        assert stats["size"] == 1

    async def test_different_prompts_different_cache_keys(self):
        primary = _CountingProvider("p", reply="ok")
        fallback = MockProvider()
        router = ProviderRouter(primary=primary, fallback=fallback, log_stream=io.StringIO())
        await router.chat("prompt A")
        await router.chat("prompt B")
        await router.chat("prompt A")  # hit
        await router.chat("prompt B")  # hit
        assert primary.calls == 2, "should only call primary for A and B once each"
        stats = router.cache_stats()
        assert stats["hits"] == 2
        assert stats["misses"] == 2
        assert stats["size"] == 2

    async def test_different_kwargs_different_cache_keys(self):
        primary = _CountingProvider("p", reply="ok")
        fallback = MockProvider()
        router = ProviderRouter(primary=primary, fallback=fallback, log_stream=io.StringIO())
        await router.chat("hi", max_tokens=100)
        await router.chat("hi", max_tokens=200)  # miss, 不同 kwargs
        await router.chat("hi", max_tokens=100)  # hit
        assert primary.calls == 2
        stats = router.cache_stats()
        assert stats["hits"] == 1
        assert stats["misses"] == 2

    async def test_cache_disabled_always_miss(self):
        primary = _CountingProvider("p", reply="ok")
        fallback = MockProvider()
        router = ProviderRouter(
            primary=primary, fallback=fallback, log_stream=io.StringIO(),
            cache_enabled=False,
        )
        await router.chat("hi")
        await router.chat("hi")
        await router.chat("hi")
        assert primary.calls == 3
        stats = router.cache_stats()
        assert stats["hits"] == 0
        # 禁用时既不记 miss 也不记 hit (cache 完全不参与)
        assert stats["misses"] == 0
        assert stats["size"] == 0

    async def test_nonzero_temperature_skips_cache(self):
        primary = _CountingProvider("p", reply="ok")
        fallback = MockProvider()
        router = ProviderRouter(primary=primary, fallback=fallback, log_stream=io.StringIO())
        await router.chat("hi", temperature=0.7)  # not cacheable, not counted
        await router.chat("hi", temperature=0.7)  # not cacheable, not counted
        await router.chat("hi", temperature=0)    # miss + 缓存
        await router.chat("hi", temperature=0)    # hit
        assert primary.calls == 3  # 2 (temp=0.7) + 1 (temp=0 cold) + 0 (temp=0 hot)
        stats = router.cache_stats()
        assert stats["hits"] == 1
        # 温度 !=0 不参与 cache 计数, 只 temperature=0 算 miss
        assert stats["misses"] == 1

    async def test_ttl_expiry(self):
        primary = _CountingProvider("p", reply="ok")
        fallback = MockProvider()
        router = ProviderRouter(
            primary=primary, fallback=fallback, log_stream=io.StringIO(),
            cache_ttl_seconds=0.05,  # 50ms
        )
        await router.chat("hi")
        await asyncio.sleep(0.1)  # 等过期
        await router.chat("hi")  # 过期 → miss
        assert primary.calls == 2
        stats = router.cache_stats()
        assert stats["hits"] == 0
        assert stats["misses"] == 2

    async def test_lru_eviction(self):
        primary = _CountingProvider("p", reply="ok")
        fallback = MockProvider()
        router = ProviderRouter(
            primary=primary, fallback=fallback, log_stream=io.StringIO(),
            cache_max_size=2,
        )
        # max_size=2: 第 3 个 key 写入立即淘汰最旧, 后续全是 miss
        await router.chat("A")  # miss → [A]
        await router.chat("B")  # miss → [A, B]
        await router.chat("C")  # miss, evict A → [B, C]
        await router.chat("A")  # miss, evict B → [C, A]
        await router.chat("B")  # miss, evict C → [A, B]
        await router.chat("C")  # miss, evict A → [B, C]
        assert primary.calls == 6
        stats = router.cache_stats()
        assert stats["hits"] == 0
        # 6 次写里 4 次触发 LRU 淘汰 (3/4/5/6 都要 evict)
        assert stats["evictions"] == 4
        assert stats["size"] == 2

    async def test_lru_move_to_end(self):
        primary = _CountingProvider("p", reply="ok")
        fallback = MockProvider()
        router = ProviderRouter(
            primary=primary, fallback=fallback, log_stream=io.StringIO(),
            cache_max_size=2,
        )
        await router.chat("A")  # miss → [A]
        await router.chat("B")  # miss → [A, B]
        await router.chat("A")  # hit, A move to end → [B, A]
        await router.chat("C")  # miss, evict B (oldest) → [A, C]
        await router.chat("A")  # hit, A move to end → [C, A]
        await router.chat("C")  # hit, C move to end → [A, C]
        # calls: A, B, C (A hit 1, A hit 2, C hit 3) = 3 calls + 3 hits
        assert primary.calls == 3
        stats = router.cache_stats()
        assert stats["hits"] == 3
        assert stats["evictions"] == 1

    async def test_fallback_path_also_caches(self):
        primary = _AlwaysFailProvider("cli-dead")
        fallback = _CountingProvider("f", reply="from-fallback")
        router = ProviderRouter(primary=primary, fallback=fallback, log_stream=io.StringIO())
        r1 = await router.chat("hi")
        r2 = await router.chat("hi")
        assert r1.fell_back is True
        assert r2.fell_back is True
        assert fallback.calls == 1, "fallback should be called only once (cache hit on 2nd)"
        assert r2.elapsed_ms == 0.5
        stats = router.cache_stats()
        assert stats["hits"] == 1
        assert stats["misses"] == 1

    async def test_clear_cache_resets_state(self):
        primary = _CountingProvider("p", reply="ok")
        fallback = MockProvider()
        router = ProviderRouter(primary=primary, fallback=fallback, log_stream=io.StringIO())
        await router.chat("hi")
        await router.chat("hi")
        assert router.cache_stats()["hits"] == 1
        router.clear_cache()
        stats = router.cache_stats()
        assert stats["hits"] == 0
        assert stats["misses"] == 0
        assert stats["size"] == 0
        await router.chat("hi")  # miss
        assert primary.calls == 2

    async def test_cache_key_consistent_for_same_input(self):
        k1 = ProviderRouter._cache_key("hi", {"max_tokens": 100})
        k2 = ProviderRouter._cache_key("hi", {"max_tokens": 100})
        k3 = ProviderRouter._cache_key("hi", {"max_tokens": 200})
        k4 = ProviderRouter._cache_key("hello", {"max_tokens": 100})
        assert k1 == k2
        assert k1 != k3
        assert k1 != k4
        assert len(k1) == 16  # sha256 前 16 字节 hex

    async def test_is_deterministic(self):
        assert ProviderRouter._is_deterministic({}) is True
        assert ProviderRouter._is_deterministic({"temperature": 0}) is True
        assert ProviderRouter._is_deterministic({"temperature": 0.0}) is True
        assert ProviderRouter._is_deterministic({"temperature": 0.7}) is False
        assert ProviderRouter._is_deterministic({"temperature": 1}) is False
