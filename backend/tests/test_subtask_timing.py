"""任务时刻字段的落库行为（SubTask.started_at / completed_at / duration_ms）。

背景（2026-09-13 查实）：`completed_at` 与 `duration_ms` 一直有写（收尾时
`save_expert_execution_result`），但 **`started_at` 永远是 NULL**——执行期没有任何地方
写它，于是"这个任务跑了多久"只能靠事件账本反推，直接查库看不到。修法是在任务真正开始时
补一次 `await update_subtask_status(..., RUNNING)`。

要钉的性质：
1. RUNNING 写入会带上 started_at；
2. **重复 RUNNING 不重打时间戳**（工具循环会重入节点，重打就变成"最后一次重入的时刻"）；
3. 收尾写 COMPLETED 时 started_at 保持不变（否则前面那次白写）。
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel

from crud.execution_plan import update_subtask_status
from models import ExecutionPlan, SubTask, Thread
from models.enums import TaskStatus

_TEST_ENGINE_HOLDER = [None]


async def _init_tables(engine, tables=None):

    async with engine.begin() as conn:
        await conn.run_sync(
            lambda c: (
                SQLModel.metadata.create_all(c, tables=tables)
                if tables
                else SQLModel.metadata.create_all(c)
            )
        )


def _test_session() -> AsyncSession:
    from sqlmodel.ext.asyncio.session import AsyncSession as _AS

    return _AS(_TEST_ENGINE_HOLDER[0], expire_on_commit=False)


TABLES = [Thread.__table__, ExecutionPlan.__table__, SubTask.__table__]


async def _session() -> Session:
    _TEST_ENGINE_HOLDER[0] = engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    await _init_tables(engine, tables=TABLES)
    session = _test_session()
    session.add(Thread(id="t1", title="会话", user_id="u1"))
    session.add(ExecutionPlan(id="p1", thread_id="t1", user_query="问题", estimated_steps=1))
    session.add(
        SubTask(
            id="task_1",
            execution_plan_id="p1",
            sort_order=0,
            expert_type="search",
            description="查资料",
        )
    )
    await session.commit()
    return session


async def test_marking_running_records_started_at():
    db = await _session()

    updated = await update_subtask_status(db, "task_1", TaskStatus.RUNNING)

    assert updated is not None
    assert updated.status == TaskStatus.RUNNING
    assert updated.started_at is not None


async def test_repeated_running_keeps_first_timestamp():
    """工具循环会重入节点并再次标 RUNNING——第一次的时刻必须留住。"""
    db = await _session()

    first = await update_subtask_status(db, "task_1", TaskStatus.RUNNING)
    before = first.started_at
    second = await update_subtask_status(db, "task_1", TaskStatus.RUNNING)

    assert second.started_at == before


async def test_completion_preserves_started_at_and_records_duration():
    db = await _session()

    started = (await update_subtask_status(db, "task_1", TaskStatus.RUNNING)).started_at
    done = await update_subtask_status(db, "task_1", TaskStatus.COMPLETED, duration_ms=1234)

    assert done.started_at == started, "收尾不得抹掉开始时刻"
    assert done.completed_at is not None
    assert done.duration_ms == 1234


async def test_mark_running_end_to_end_and_silent_on_missing(monkeypatch):
    """走真实入口（后台线程用的那个函数）：存在则写成功，已被修订替换掉则安静失败。"""
    from utils.async_task_queue import async_mark_subtask_running

    db = await _session()

    # 会话注入缝（与 supervisor_tick 同款）：同库同连接，避免内存库双会话并发
    assert await async_mark_subtask_running("task_1", session=db) is True
    assert (await update_subtask_status(db, "task_1", TaskStatus.RUNNING)).started_at is not None

    assert await async_mark_subtask_running("not-exists", session=db) is False  # 不抛，只回 False
