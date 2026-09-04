"""专家配置缓存仓储（P3-3 反模式收敛）。

问题：expert_manager 全局缓存之外，5 个模块各自持有本地 TTLCache，
refresh_cache 需要"手工点名"逐个清除——新增缓存忘记注册就产生失效链缺口
（历史上 dispatcher/aggregator 被漏过，aggregator 曾用旧 system_prompt 最长 5 分钟）。

方案：本地缓存统一向 ExpertRepository 注册（带名称），refresh 遍历注册表清空。
节点侧 API 不变（仍是模块级 TTLCache 对象），改造点集中在缓存定义处。
"""

from __future__ import annotations

import threading
from collections.abc import Iterator

from cachetools import TTLCache


class ExpertRepository:
    """专家配置缓存的注册与失效中心。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._local_caches: dict[str, TTLCache] = {}

    def register_local_cache(self, name: str, cache: TTLCache) -> TTLCache:
        """注册一个模块本地缓存（模块加载时调用，重复注册幂等）。"""
        with self._lock:
            self._local_caches[name] = cache
        return cache

    def clear_local(self, *names: str) -> int:
        """清除指定名称的本地缓存，返回实际清除数量。"""
        cleared = 0
        with self._lock:
            for name in names:
                cache = self._local_caches.get(name)
                if cache is not None:
                    cache.clear()
                    cleared += 1
        return cleared

    def clear_all_local(self) -> int:
        """清除全部已注册本地缓存。"""
        with self._lock:
            caches = list(self._local_caches.items())
        for _name, cache in caches:
            cache.clear()
        return len(caches)

    def names(self) -> list[str]:
        with self._lock:
            return sorted(self._local_caches)

    def __iter__(self) -> Iterator[tuple[str, TTLCache]]:
        with self._lock:
            return iter(sorted(self._local_caches.items()))


# 全局单例
expert_repository = ExpertRepository()


def register_expert_cache(name: str, cache: TTLCache) -> TTLCache:
    """模块级便捷注册：cache = register_expert_cache("commander_config", TTLCache(...))"""
    expert_repository.register_local_cache(name, cache)
    return cache
