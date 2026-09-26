"""用户日 token 配额：KV 读写往返、脏数据防御、超限判定。

⚠️ 超限判定的桩测试（下方 MagicMock 版）测不出「语句形态」回归——
2026-09-18 的真实事故：sqlmodel select 单列聚合经 Session.exec 返回标量，
`used[0]` TypeError，桩的可下标返回值把这条完全遮住（475 测试全绿但用户
设配额后第一条消息即炸）。故文件末尾用真实 sqlite 引擎补了真语句测试。
"""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from sqlalchemy.pool import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import Session, SQLModel, SQLModel

from models import AgentRun, SystemSetting
from services.run_quota import (
    load_daily_token_quota,
    save_daily_token_quota,
    today_token_usage_exceeds_quota,
)
from utils.time import utc_now


_TEST_ENGINE_HOLDER = [None]



async def _init_tables(engine, tables=None):
    from sqlmodel import SQLModel

    async with engine.begin() as conn:
        await conn.run_sync(
            lambda c: SQLModel.metadata.create_all(c, tables=tables) if tables else SQLModel.metadata.create_all(c)
        )


def _test_session() -> "AsyncSession":
    from sqlmodel.ext.asyncio.session import AsyncSession as _AS

    return _AS(_TEST_ENGINE_HOLDER[0], expire_on_commit=False)




class _KVStubSession:
    """支持 get/add/commit/delete 的最小会话桩（单键）"""

    def __init__(self, value: str | None = None):
        self._key = "user_daily_token_quota"
        self._value = value

    async def get(self, model, pk):  # noqa: ANN001
        if pk == self._key and self._value is not None:
            return SimpleNamespace(key=self._key, value=self._value)
        return None

    def add(self, instance):  # noqa: ANN001
        self._value = instance.value

    async def delete(self, instance):  # noqa: ANN001
        self._value = None

    async def commit(self):
        pass


class _OneResult:
    """聚合查询结果桩（提供 .one() 与下标取值）"""

    def __init__(self, value):
        self._value = value

    def one(self):
        return self

    def __getitem__(self, index):
        return self._value


def _usage_session(used: int):
    """exec 聚合结果为固定值的会话桩"""
    session = MagicMock()
    session.exec.return_value = _OneResult(used)
    return session


async def test_quota_unset_means_unlimited():
    assert await load_daily_token_quota(_KVStubSession(None)) is None
    assert await load_daily_token_quota(_KVStubSession("not-a-number")) is None
    assert await load_daily_token_quota(_KVStubSession("0")) is None


async def test_quota_save_then_load_roundtrip():
    session = _KVStubSession()
    assert await save_daily_token_quota(session, 50000) == 50000
    assert await load_daily_token_quota(session) == 50000
    await save_daily_token_quota(session, None)
    assert await load_daily_token_quota(session) is None


async def test_today_usage_exceeds_quota():
    assert await today_token_usage_exceeds_quota(_usage_session(50_000), "u1", 50_000) is True
    assert await today_token_usage_exceeds_quota(_usage_session(49_999), "u1", 50_000) is False


# ============================================================================
# 真实引擎版（桩测不出 select 语句形态差异，见文件头说明）
# ============================================================================

_TABLES = [AgentRun.__table__, SystemSetting.__table__]


@pytest.fixture
async def engine():
    _TEST_ENGINE_HOLDER[0] = engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    await _init_tables(engine, tables=_TABLES)
    yield engine
    engine.dispose()


async def _add_run(engine, run_id: str, total_tokens: int) -> None:
    async with _test_session() as session:
        session.add(
            AgentRun(
                id=run_id,
                thread_id="t1",
                user_id="u1",
                total_tokens=total_tokens,
                created_at=utc_now(),
                started_at=utc_now(),
                updated_at=utc_now(),
            )
        )
        await session.commit()


async def test_exceeds_quota_against_real_engine(engine):
    _add_run(engine, "r1", 300)

    async with _test_session() as session:
        assert await today_token_usage_exceeds_quota(session, "u1", 300) is True
        assert await today_token_usage_exceeds_quota(session, "u1", 301) is False
        assert await today_token_usage_exceeds_quota(session, "u2", 1) is False


async def test_quota_roundtrip_against_real_engine(engine):
    async with _test_session() as session:
        assert await load_daily_token_quota(session) is None  # 未配置 = 不限量
        assert await save_daily_token_quota(session, 1_000_000) == 1_000_000
        assert await load_daily_token_quota(session) == 1_000_000
        assert await save_daily_token_quota(session, 0) is None
        assert await load_daily_token_quota(session) is None
