"""配置缓存的全局 epoch 失效（决定 7 的第一刀）。

**要解决的问题**（来自一次真实事故）：专家配置散在 5 个模块各自的模块级 TTLCache 里，
失效靠一个「按名字注册」的中心逐个清空——新增缓存忘了注册，管理员改了配置它却继续
用旧的（历史上 dispatcher/aggregator 被漏过，aggregator 用了旧 system_prompt 最长 5 分钟）。

**做法**：失效不再「逐个清空」，而是一个全局 epoch。缓存对象每次访问先比对 epoch，
不一致就自行清空——**任何用 `ConfigCache` 造的缓存都自动参与失效**，没有注册这一步，
也就没有「忘记注册」这回事。TTL 仍保留（兜住「压根没人调失效」的情况）。

**为什么不做依赖注入**：DI 要改所有节点的签名，而读取点在全仓最热的执行路径上（每次
工具调用/每次路由），收益主要是「便于测试替换」；真正造成事故的缺陷来源已经被 epoch
消掉了。等出现第二个配置存储或真的需要替换实现时再上 DI。

**边界（有意未纳入）**：
- `services/tool_policy_service.py` 的覆盖缓存：它有自己的 `invalidate()` 且管理面更新时
  会显式调用（`routers/tools.py`），不属于「忘记注册」这一类。
- `agents/graph_builder.py` 的 LLM 单例（`lru_cache`）：只在进程启动时构造一次，改模型配置
  要重启才生效——**这是否算缺陷取决于产品预期**，未在本次改动范围内（见
  docs/TARGET-ARCHITECTURE.md 决定 7）。
"""

from __future__ import annotations

import threading
from typing import Any

from cachetools import TTLCache

_epoch_lock = threading.Lock()
_epoch = 0


def _current_epoch() -> int:
    return _epoch


def invalidate_config_caches() -> None:
    """全局失效：此后每个 `ConfigCache` 在**下一次访问时**自行清空。

    不清空而是「标记过期 + 延迟到访问时清」，是为了不持有各缓存对象的引用——
    那正是旧注册表需要维护的东西，也是漏注册的来源。
    """
    global _epoch
    with _epoch_lock:
        _epoch += 1


class ConfigCache:
    """TTLCache + 全局 epoch 失效。

    只暴露各节点实际用到的操作（get/set/in/update/clear/len），避免变成一个
    「什么都能干」的通用容器。线程安全依赖两点：cachetools 自身加锁；epoch 是
    整数，读取在 GIL 下是原子的（读到旧值最多多留一次命中，下次访问即清）。
    """

    def __init__(self, maxsize: int, ttl: float, name: str = "") -> None:
        self.name = name or f"config-cache-{id(self)}"
        self._cache: TTLCache = TTLCache(maxsize=maxsize, ttl=ttl)
        self._seen_epoch = _current_epoch()

    def _sync_epoch(self) -> None:
        epoch = _current_epoch()
        if self._seen_epoch != epoch:
            self._cache.clear()
            self._seen_epoch = epoch

    def get(self, key: Any, default: Any = None) -> Any:
        self._sync_epoch()
        return self._cache.get(key, default)

    def __getitem__(self, key: Any) -> Any:
        self._sync_epoch()
        return self._cache[key]

    def __setitem__(self, key: Any, value: Any) -> None:
        self._sync_epoch()
        self._cache[key] = value

    def __contains__(self, key: Any) -> bool:
        self._sync_epoch()
        return key in self._cache

    def update(self, other: dict) -> None:
        self._sync_epoch()
        self._cache.update(other)

    def clear(self) -> None:
        self._cache.clear()

    def __len__(self) -> int:
        self._sync_epoch()
        return len(self._cache)
