"""「当前计划」唯一访问入口的口径契约（2026-10-04 脑裂审计收敛）。

三条历史选取路径（thread 指针 / created_at 最新 / 按 run 定位）收敛为一个
crud 访问器，本文件钉死它的判定语义：
- 指针优先：thread.execution_plan_id 指哪份就是哪份（显式真相压过排序启发式）
- 指针为空（清理置空/历史缺失）：退化 created_at 最新
- 指针悬挂（指向不存在的行，无 FK 硬约束时的可能态）：同样退化，不给空
- 无任何计划：None
"""

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from crud.execution_plan import get_current_execution_plan_by_thread
from models import ExecutionPlan, Thread
from utils.time import utc_now

_TEST_ENGINE_HOLDER = [None]

TABLES = [Thread.__table__, ExecutionPlan.__table__]


def _test_session():
    from sqlmodel.ext.asyncio.session import AsyncSession

    return AsyncSession(_TEST_ENGINE_HOLDER[0], expire_on_commit=False)


@pytest.fixture
async def db():
    _TEST_ENGINE_HOLDER[0] = engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: SQLModel.metadata.create_all(c, tables=TABLES))
    async with _test_session() as session:
        yield session
    await engine.dispose()


async def _seed_two_plans(session, pointer_to_first: bool):
    """t1 有两份计划（旧→新）；指针按参数指向旧的或置空。"""
    old = ExecutionPlan(
        id="plan-old",
        thread_id="t1",
        run_id="r-old",
        user_query="q-old",
        created_at=utc_now(),
    )
    import asyncio

    await asyncio.sleep(0.01)  # 保证 created_at 严格可分
    new = ExecutionPlan(
        id="plan-new",
        thread_id="t1",
        run_id="r-new",
        user_query="q-new",
        created_at=utc_now(),
    )
    session.add(
        Thread(
            id="t1",
            title="会话",
            user_id="u1",
            execution_plan_id="plan-old" if pointer_to_first else None,
        )
    )
    session.add(old)
    session.add(new)
    await session.commit()


async def test_pointer_wins_over_newer_row(db):
    """指针指向旧计划时返回旧计划——显式真相压过 created_at 启发式。"""
    await _seed_two_plans(db, pointer_to_first=True)
    plan = await get_current_execution_plan_by_thread(db, "t1")
    assert plan is not None and plan.id == "plan-old"


async def test_null_pointer_falls_back_to_latest(db):
    await _seed_two_plans(db, pointer_to_first=False)
    plan = await get_current_execution_plan_by_thread(db, "t1")
    assert plan is not None and plan.id == "plan-new"


async def test_dangling_pointer_falls_back_to_latest(db):
    """指针悬挂（指向不存在的行）不给 None，退化兜底。"""
    session = db
    session.add(Thread(id="t1", title="会话", user_id="u1", execution_plan_id="plan-gone"))
    session.add(
        ExecutionPlan(
            id="plan-new", thread_id="t1", run_id="r", user_query="q", created_at=utc_now()
        )
    )
    await session.commit()
    plan = await get_current_execution_plan_by_thread(db, "t1")
    assert plan is not None and plan.id == "plan-new"


async def test_thread_without_plans_returns_none(db):
    session = db
    session.add(Thread(id="t1", title="会话", user_id="u1"))
    await session.commit()
    assert await get_current_execution_plan_by_thread(db, "t1") is None


async def test_missing_thread_returns_none(db):
    assert await get_current_execution_plan_by_thread(db, "no-such-thread") is None
