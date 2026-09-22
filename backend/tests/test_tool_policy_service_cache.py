"""工具策略服务的缓存时间基准（时区回归测试）。

回归背景：`_cache_expire_at` 曾初始化为 `datetime.min.replace(tzinfo=UTC)`
（**aware**），而比较用的 `utc_now()` 返回 **naive** —— 比较直接抛
`TypeError: can't compare offset-naive and offset-aware datetimes`。
后果不止是缓存失效：`get_overrides()` 被 `generic` 的宽 except 吞掉、记成
「工具绑定失败」，于是 **所有专家的工具调用静默失效**（搜索/时间/计算器/MCP），
且因文案指向「模型不支持工具调用」而长期无人发现。

本文件锁住时间基准的一致性：缓存命中、TTL 过期、invalidate 三条路径都不许
出现 naive/aware 混用。
"""

import asyncio
from datetime import timedelta

from services.tool_policy_service import ToolPolicyService


def _service_with_stub_load(loaded: dict | None = None) -> tuple[ToolPolicyService, dict]:
    """构造服务并把 DB 加载替换为计数桩（不触碰数据库）。"""
    service = ToolPolicyService()
    calls = {"n": 0}

    def _fake_load() -> dict:
        calls["n"] += 1
        return dict(loaded or {})

    service._load_overrides_sync = _fake_load  # type: ignore[method-assign]
    return service, calls


class TestCacheTimeBase:
    def test_first_call_does_not_raise_type_error(self):
        """核心回归：首次调用不得因 naive/aware 混用抛 TypeError。"""
        service, calls = _service_with_stub_load()

        result = asyncio.run(service.get_overrides())

        assert result == {}
        assert calls["n"] == 1, "首次调用应真正加载"

    def test_second_call_hits_cache(self):
        service, calls = _service_with_stub_load()

        asyncio.run(service.get_overrides())
        asyncio.run(service.get_overrides())

        assert calls["n"] == 1, "TTL 内应命中缓存，不再查库"

    def test_cache_expires_after_ttl(self):
        service, calls = _service_with_stub_load()
        asyncio.run(service.get_overrides())

        # 把过期时刻推到过去（用同一时间基准，模拟 TTL 到期）
        service._cache_expire_at = service._cache_expire_at - timedelta(seconds=60)
        asyncio.run(service.get_overrides())

        assert calls["n"] == 2, "TTL 过期后应重新加载"

    def test_invalidate_forces_reload(self):
        service, calls = _service_with_stub_load()
        asyncio.run(service.get_overrides())

        asyncio.run(service.invalidate())
        asyncio.run(service.get_overrides())

        assert calls["n"] == 2, "invalidate 之后必须重新加载"

    def test_expire_marker_is_aware(self):
        """过期标记必须与 utc_now() 同为 aware UTC——这条防止 naive/aware 混用回归。"""
        service = ToolPolicyService()
        assert service._cache_expire_at.tzinfo is not None
