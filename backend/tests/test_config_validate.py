"""config.Settings.validate() —— 生产启动闸门的语义与回归。

回归背景：该函数把「至少有一个可用 LLM」写成了 deepseek / openai / anthropic / minimax
四个 key 的硬编码名单，而 provider 名单的真相源是 `providers.yaml`——**第二份拷贝漏掉了
moonshot**。main.py lifespan 在生产环境 `validate()` 为 False 时直接 RuntimeError，
因此「只配 Moonshot 的生产实例起不来」，而且名单里已停用的 minimax 反而算数。

现改为向 providers.yaml 查询（`enabled: true` 且对应 env_key 已设置），名单不再有副本。
本测试锁住这条语义，防止名单被重新抄回 config.py。
"""

import os
from collections.abc import Iterator
from contextlib import contextmanager
from unittest.mock import patch

from config import Settings
from providers_config import (
    get_all_providers,
    get_default_embedding_provider,
    get_embedding_provider_config,
)


def _provider_env_keys() -> list[str]:
    """providers 段 + embeddings 段声明的全部环境变量名（含已停用的）。

    embeddings 是 providers.yaml 的独立顶层段（siliconflow 在其中），而闸门对
    "LLM 或向量模型至少其一"都放行，所以隔离环境时必须把两段的 key 都清掉。
    """
    keys = [cfg["env_key"] for cfg in get_all_providers().values() if cfg.get("env_key")]
    embedding_cfg = get_embedding_provider_config(get_default_embedding_provider()) or {}
    if embedding_cfg.get("env_key"):
        keys.append(embedding_cfg["env_key"])
    return keys


PROVIDER_ENV_KEYS = _provider_env_keys()

# 生产环境下的合法配置骨架（显式传参优先于 .env / 进程环境）
PRODUCTION = {
    "environment": "production",
    "jwt_secret_key": "x" * 32,
    "database_url": "postgresql://user:pass@localhost:5432/xpouch",
}


@contextmanager
def _only(*env_keys: str) -> Iterator[None]:
    """清空 conftest 预置的假 key，只让给定的几个"已配置"。

    必须**删除**变量而不是置空串：providers_config.is_provider_configured 判的是
    `os.getenv(env_key) is not None`，空串也算已配置。patch.dict 会在退出时整体还原。
    """
    with patch.dict(os.environ, dict.fromkeys(env_keys, "sk-test-only")):
        for key in PROVIDER_ENV_KEYS:
            if key not in env_keys:
                os.environ.pop(key, None)
        yield


def test_moonshot_only_passes_production_gate() -> None:
    """只配 Moonshot 必须通过——这正是旧硬编码名单判死的场景。"""
    with _only("MOONSHOT_API_KEY"):
        assert Settings(**PRODUCTION).validate() is True


def test_embedding_only_provider_still_passes() -> None:
    """仅配向量模型（siliconflow）也放行：与旧的 has_llm or has_embedding 语义一致。"""
    with _only("SILICON_API_KEY"):
        assert Settings(**PRODUCTION).validate() is True


def test_disabled_provider_key_does_not_count() -> None:
    """已停用 provider 的 key 不算可用——enabled 开关（providers.yaml）才是真相。"""
    with _only("GOOGLE_API_KEY", "MINIMAX_API_KEY"):
        assert Settings(**PRODUCTION).validate() is False


def test_no_provider_key_rejects_production_start() -> None:
    """一个 key 都没有 → 生产拒绝启动（闸门本身不能消失）。"""
    with _only():
        assert Settings(**PRODUCTION).validate() is False
