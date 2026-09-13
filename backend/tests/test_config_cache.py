"""ConfigCache（全局 epoch 失效）测试 —— 决定 7 的第一刀。

要钉死的性质：**失效不需要「注册」这一步**。旧机制里每个模块级 TTLCache 都得
手动 `register_expert_cache(...)`，漏了就是一次静默的配置不生效（真实事故：
aggregator 用过旧 system_prompt 最长 5 分钟）。现在任何 `ConfigCache` 都自动
参与失效——新增缓存天然纳入，这一类缺陷从结构上不可能再出现。
"""

import time

from utils import config_cache
from utils.config_cache import ConfigCache, invalidate_config_caches


def test_invalidate_is_lazy_but_effective():
    """失效是「标记 + 访问时自清」：不持有缓存引用，但下一次访问一定看不到旧值。"""
    cache = ConfigCache(maxsize=10, ttl=300)
    cache["k"] = "old"

    invalidate_config_caches()

    assert cache.get("k") is None
    assert "k" not in cache
    assert len(cache) == 0


def test_every_instance_participates_without_registration():
    """两个互不相关的缓存实例都会被失效（无需注册表点名）。"""
    a = ConfigCache(maxsize=10, ttl=300, name="a")
    b = ConfigCache(maxsize=10, ttl=300, name="b")
    a["k"], b["k"] = 1, 2

    invalidate_config_caches()

    assert a.get("k") is None
    assert b.get("k") is None


def test_cache_created_after_invalidate_is_in_sync():
    """迟到的缓存（失效之后才创建）不该被上一次 epoch 误清——它的起点就是当前 epoch。"""
    invalidate_config_caches()
    late = ConfigCache(maxsize=10, ttl=300, name="late")
    late["k"] = "v"

    assert late.get("k") == "v"


def test_repeated_invalidate_is_idempotent_for_readers():
    first = ConfigCache(maxsize=10, ttl=300)
    first["k"] = 1
    invalidate_config_caches()
    assert first.get("k") is None

    # 再失效一次（期间没有写入）→ 仍然是空，且不抛
    invalidate_config_caches()
    assert first.get("k") is None


def test_ttl_still_expires():
    """epoch 只是新增一条失效路径，TTL 仍兜住「压根没人调失效」的情况。"""
    cache = ConfigCache(maxsize=10, ttl=0.05)
    cache["k"] = "v"
    assert cache.get("k") == "v"

    time.sleep(0.1)

    assert cache.get("k") is None


def test_maxsize_is_enforced():
    cache = ConfigCache(maxsize=2, ttl=300)
    cache["a"], cache["b"], cache["c"] = 1, 2, 3

    assert len(cache) == 2


def test_update_and_clear_work_like_a_mapping():
    cache = ConfigCache(maxsize=10, ttl=300)
    cache.update({"a": 1, "b": 2})
    assert cache["a"] == 1 and cache.get("b") == 2

    cache.clear()
    assert len(cache) == 0


def test_expert_refresh_invalidates_node_local_caches():
    """回归真实事故：管理员改配置后，节点本地缓存必须也失效（旧机制靠注册表，
    漏注册就静默用旧值）。这里直接读节点模块里那两个缓存对象。"""
    from agents.nodes.generic import _generic_expert_cache
    from agents.services.expert_manager import refresh_cache

    _generic_expert_cache["coder"] = {"system_prompt": "旧提示词"}
    assert _generic_expert_cache.get("coder") is not None

    refresh_cache(session=None)

    assert _generic_expert_cache.get("coder") is None, "节点本地缓存未被失效"


def test_epoch_is_module_level_and_monotonic():
    """直接钉住 epoch 的单调性（配置失效只能向前，不因任何代码路径回退）。"""
    before = config_cache._current_epoch()
    invalidate_config_caches()
    invalidate_config_caches()
    assert config_cache._current_epoch() >= before + 2
