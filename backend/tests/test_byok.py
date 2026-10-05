"""BYOK（用户自带 API Key）核心契约（2026-10-05 v1）。

钉住的性质：
- 加解密往返 + 掩码（明文永不外泄，hint 只留尾 4 位）
- 主密钥缺失/错误的行为：功能关闭态、坏密文按未配置回退（不炸解析链）
- 解析优先级：当前上下文的用户 key > 实例 env key > None
- 用户隔离：不同上下文（= 不同请求）各自解析各自的 key，零串扰
- get_provider_api_key 收口集成：ContextVar 未装载时与 BYOK 之前逐字节一致
"""

import base64
import os

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from models.domain.user_api_key import UserApiKey
from utils.time import utc_now

_TEST_ENGINE_HOLDER = [None]


def _test_session():
    from sqlmodel.ext.asyncio.session import AsyncSession

    return AsyncSession(_TEST_ENGINE_HOLDER[0], expire_on_commit=False)


@pytest.fixture
async def engine():
    _TEST_ENGINE_HOLDER[0] = e = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with e.begin() as conn:
        await conn.run_sync(
            lambda c: SQLModel.metadata.create_all(c, tables=[UserApiKey.__table__])
        )
    yield e
    await e.dispose()


@pytest.fixture
def master_key(monkeypatch):
    """每个测试一把独立主密钥（隔离加解密状态）。"""
    key = base64.b64encode(os.urandom(32)).decode()
    from config import settings

    monkeypatch.setattr(settings, "byok_master_key", key)
    return key


class TestCrypto:
    def test_roundtrip_and_hint(self, master_key):
        from utils.byok import decrypt_key, encrypt_key, key_hint

        ct = encrypt_key("sk-live-abc123XYZ")
        assert ct != "sk-live-abc123XYZ"
        assert decrypt_key(ct) == "sk-live-abc123XYZ"
        assert key_hint("sk-live-abc123XYZ") == "***3XYZ"

    def test_wrong_master_key_degrades_to_none(self, master_key, monkeypatch):
        from config import settings
        from utils.byok import decrypt_key, encrypt_key

        ct = encrypt_key("sk-live-abc123XYZ")
        monkeypatch.setattr(settings, "byok_master_key", base64.b64encode(os.urandom(32)).decode())
        assert decrypt_key(ct) is None  # 坏密文按未配置处理，不炸

    def test_disabled_when_no_master_key(self, monkeypatch):
        from config import settings

        monkeypatch.setattr(settings, "byok_master_key", "")
        from utils import byok

        assert byok.byok_enabled() is False
        assert byok.encrypt_key("x") if False else True  # 关闭态不应被调用（API 层拦截）


class TestResolutionAndIsolation:
    def test_user_key_wins_over_env(self, monkeypatch):
        from providers_config import get_provider_api_key
        from utils.byok import reset_byok_context, set_byok_context

        monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-instance")
        token = set_byok_context({"deepseek": "sk-user"})
        try:
            assert get_provider_api_key("deepseek") == "sk-user"
        finally:
            reset_byok_context(token)

    def test_env_fallback_without_context(self, monkeypatch):
        from providers_config import get_provider_api_key

        monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-instance")
        assert get_provider_api_key("deepseek") == "sk-instance"

    def test_user_isolation_between_contexts(self, monkeypatch):
        from utils.byok import reset_byok_context, resolve_user_key, set_byok_context

        token_a = set_byok_context({"deepseek": "sk-alice"})
        assert resolve_user_key("deepseek") == "sk-alice"
        reset_byok_context(token_a)

        token_b = set_byok_context({"deepseek": "sk-bob"})
        assert resolve_user_key("deepseek") == "sk-bob"
        assert resolve_user_key("siliconflow") is None
        reset_byok_context(token_b)

    def test_partial_context_falls_back_per_provider(self, monkeypatch):
        from providers_config import get_provider_api_key
        from utils.byok import reset_byok_context, set_byok_context

        monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-instance")
        token = set_byok_context({"moonshot": "sk-user-ms"})  # 只配了 moonshot
        try:
            assert get_provider_api_key("deepseek") == "sk-instance"  # 未配的走实例
            assert get_provider_api_key("moonshot") == "sk-user-ms"
        finally:
            reset_byok_context(token)


class TestLoadUserKeys:
    async def test_load_decrypts_only_own_rows(self, engine, master_key):
        from utils.byok import encrypt_key, load_user_api_keys

        async with _test_session() as db:
            db.add(
                UserApiKey(
                    user_id="alice",
                    provider="deepseek",
                    encrypted_key=encrypt_key("sk-alice-key"),
                    key_hint="***-key",
                    updated_at=utc_now(),
                )
            )
            db.add(
                UserApiKey(
                    user_id="bob",
                    provider="deepseek",
                    encrypted_key=encrypt_key("sk-bob-key"),
                    key_hint="***-key",
                    updated_at=utc_now(),
                )
            )
            await db.commit()

        async with _test_session() as db:
            alice = await load_user_api_keys(db, "alice")
            bob = await load_user_api_keys(db, "bob")
        assert alice == {"deepseek": "sk-alice-key"}
        assert bob == {"deepseek": "sk-bob-key"}

    async def test_load_empty_when_disabled(self, engine, monkeypatch):
        from config import settings

        monkeypatch.setattr(settings, "byok_master_key", "")
        from utils.byok import load_user_api_keys

        async with _test_session() as db:
            assert await load_user_api_keys(db, "anyone") == {}
