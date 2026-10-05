"""llm_factory 凭据缓存回归（2026-10-05「删 key 后仍计费」事故）。

事故机制：key 焊在 ChatOpenAI 实例里，而缓存键只有 (provider, model, 参数)——
① 删除个人 key 后旧条目继续被命中，请求仍带着已删除的 key 计费；
② 缓存跨用户共享，A 的个人 key 会被发给没有 key 的 B（归属串户）。

修复契约：key 先于缓存查找解析，其摘要纳入缓存键。由此——不同 key 天然
隔离、key 生命周期变化必然落在新条目、无 key 在查缓存前就报错。

归因部分：凭据类失败（401/402/403/429）要能把错误指向用户自己的 key
（utils.byok.byok_error_hint）。
"""

import pytest

import providers_config
from utils import llm_factory
from utils.byok import byok_error_hint, reset_byok_context, set_byok_context

PROVIDER = "faketest"
ENV_KEY = "FAKETEST_API_KEY"
BASE_URL = "https://faketest.invalid/v1"


@pytest.fixture(autouse=True)
def fake_provider(monkeypatch):
    """走真实解析链（get_provider_api_key > resolve_user_key > env），只伪造 provider 配置。"""
    config: dict = {
        "name": "FakeTest",
        "base_url": BASE_URL,
        "enabled": True,
        "default_model": "fake-model",
        "env_key": ENV_KEY,
    }

    def _lookup(provider: str):
        return config if provider == PROVIDER else None

    # 两个命名空间都要补：providers_config（get_provider_api_key 解析用）
    # 与 llm_factory（_create/_build 的配置读取用）
    monkeypatch.setattr(providers_config, "get_provider_config", _lookup)
    monkeypatch.setattr(llm_factory, "get_provider_config", _lookup)
    monkeypatch.delenv(ENV_KEY, raising=False)


@pytest.fixture(autouse=True)
def drain_llm_cache():
    """测试构造的实例持有 httpx.Client，结束时显式关闭并清缓存。"""
    yield
    with llm_factory._llm_cache_lock:
        instances = list(llm_factory._llm_instance_cache.values())
        llm_factory._llm_instance_cache.clear()
    for instance in instances:
        llm_factory._close_llm_instance(instance)


def _get_instance():
    return llm_factory.get_llm_instance(
        provider=PROVIDER, model="fake-model", streaming=False, temperature=0.3
    )


def _instance_key(instance) -> str:
    """实例上实际生效的凭据（langchain 以 SecretStr 存储，版本差异双取）。"""
    secret = getattr(instance, "openai_api_key", None) or getattr(instance, "api_key", None)
    return secret.get_secret_value() if hasattr(secret, "get_secret_value") else secret


def test_different_user_keys_get_isolated_instances():
    """两个用户的 key 必须落在不同实例——跨用户串 key 的构造性防线。"""
    token = set_byok_context({PROVIDER: "sk-user-aaa"})
    try:
        inst_a = _get_instance()
    finally:
        reset_byok_context(token)

    token = set_byok_context({PROVIDER: "sk-user-bbb"})
    try:
        inst_b = _get_instance()
    finally:
        reset_byok_context(token)

    assert inst_a is not inst_b
    assert _instance_key(inst_a) == "sk-user-aaa"
    assert _instance_key(inst_b) == "sk-user-bbb"


def test_same_key_reuses_cached_instance():
    token = set_byok_context({PROVIDER: "sk-user-aaa"})
    try:
        assert _get_instance() is _get_instance()
    finally:
        reset_byok_context(token)


def test_key_delete_falls_to_env_not_stale_user_instance(monkeypatch):
    """事故场景：删除个人 key 后，同参数调用必须落到 env 条目，
    而不是继续命中持有已删除用户 key 的旧实例。"""
    monkeypatch.setenv(ENV_KEY, "sk-env-ccc")

    token = set_byok_context({PROVIDER: "sk-user-aaa"})
    try:
        user_inst = _get_instance()
    finally:
        reset_byok_context(token)  # 「删除 key」＝上下文里不再有该行

    env_inst = _get_instance()
    assert env_inst is not user_inst
    assert _instance_key(env_inst) == "sk-env-ccc"


def test_env_instance_shared_across_keyless_users(monkeypatch):
    """无个人 key 的用户彼此共享 env 实例（缓存命中率不因 BYOK受损）。"""
    monkeypatch.setenv(ENV_KEY, "sk-env-ccc")
    assert _get_instance() is _get_instance()


def test_other_provider_user_key_does_not_leak(monkeypatch):
    """快照里只有别的 provider 的 key 时，本 provider 走 env（按 provider 隔离）。"""
    monkeypatch.setenv(ENV_KEY, "sk-env-ccc")
    token = set_byok_context({"unrelated-provider": "sk-user-aaa"})
    try:
        assert _instance_key(_get_instance()) == "sk-env-ccc"
    finally:
        reset_byok_context(token)


def test_no_key_at_all_raises_before_cache_lookup():
    """个人 key 与 env key 均缺失：报错文案指引两条配置路径，且旧缓存不许掩盖缺 key。"""
    with pytest.raises(ValueError, match="未配置"):
        _get_instance()


# ── 凭据类错误归因（utils.byok.byok_error_hint）───────────────────────


class _FakeResponse:
    def __init__(self, url: str):
        self.url = url


class _FakeCredentialError(Exception):
    def __init__(self, url: str | None = None):
        super().__init__("Error code: 401 - invalid api key")
        self.status_code = 401
        if url:
            self.response = _FakeResponse(url)


def test_hint_attributes_via_url():
    token = set_byok_context({PROVIDER: "sk-user-aaa"})
    try:
        hint = byok_error_hint(_FakeCredentialError(f"{BASE_URL}/chat/completions"))
    finally:
        reset_byok_context(token)
    assert hint is not None and PROVIDER in hint and "API Keys" in hint


def test_hint_single_provider_without_url_still_attributes():
    token = set_byok_context({PROVIDER: "sk-user-aaa"})
    try:
        hint = byok_error_hint(_FakeCredentialError())
    finally:
        reset_byok_context(token)
    assert hint is not None and PROVIDER in hint


def test_hint_multiple_keys_without_url_lists_candidates():
    token = set_byok_context({PROVIDER: "sk-user-aaa", "another": "sk-user-bbb"})
    try:
        hint = byok_error_hint(_FakeCredentialError())
    finally:
        reset_byok_context(token)
    assert hint is not None and PROVIDER in hint and "another" in hint


def test_hint_ignores_non_credential_status():
    class _ServerError(Exception):
        status_code = 500

    token = set_byok_context({PROVIDER: "sk-user-aaa"})
    try:
        assert byok_error_hint(_ServerError()) is None
    finally:
        reset_byok_context(token)


def test_hint_without_context_returns_none():
    assert byok_error_hint(_FakeCredentialError()) is None
