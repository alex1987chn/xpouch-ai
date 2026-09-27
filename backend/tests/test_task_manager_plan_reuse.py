"""`get_or_create_execution_plan` 的「一 run 一计划」语义。

背景（为什么必须这样）：产物是**会话级交付物**。同一个会话里先生成网页、
再写小游戏，用户要的是**两个产物都在**。原实现按 `thread_id` 单键判定，
命中即删除全部旧 SubTasks 并重建；而 `SubTask.artifacts` 配了
`cascade="all, delete-orphan"`，于是网页产物会在第二次规划时被连带删除。

改为「一 run 一计划」后：
  - 同一 run 内节点重执行 → 复用，不触碰子任务（幂等）
  - 其余情况 → 新建一份计划，**不删除任何既有内容**
  - 运行时不再存在任何删除子任务的路径 → 级联自然失效，无需迁移

用真 SQLite 而非 fake session：本组用例要证明的正是「子任务与产物行仍在」，
假会话无法证明这一点。
"""

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, select

from agents.services import task_manager
from crud.execution_plan import get_latest_execution_plan_by_thread
from models import Artifact, ExecutionPlan, SubTask, Thread
from schemas.task import SubTaskCreate

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


def _test_session() -> "AsyncSession":
    from sqlmodel.ext.asyncio.session import AsyncSession as _AS

    return _AS(_TEST_ENGINE_HOLDER[0], expire_on_commit=False)


TABLES = [
    Thread.__table__,
    ExecutionPlan.__table__,
    SubTask.__table__,
    Artifact.__table__,
]


@pytest.fixture
async def db():
    _TEST_ENGINE_HOLDER[0] = engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    await _init_tables(engine, tables=TABLES)
    async with _test_session() as session:
        yield session


def _subtasks_data(prefix: str = "新任务") -> list[SubTaskCreate]:
    return [
        SubTaskCreate(expert_type="researcher", description=f"{prefix} A", sort_order=0),
        SubTaskCreate(expert_type="writer", description=f"{prefix} B", sort_order=1),
    ]


async def _seed_plan(
    db: Session,
    *,
    plan_id: str = "p1",
    run_id: str = "r1",
    subtask_id: str = "s-old",
    artifact_id: str | None = "a-old",
):
    """建一个属于 run_id 的计划 + 一条**已完成**的子任务（可选带一份产物）。"""
    db.add(Thread(id="t1", title="会话", user_id="u1"))
    db.add(
        ExecutionPlan(
            id=plan_id, thread_id="t1", user_query="原查询", run_id=run_id, plan_version=1
        )
    )
    db.add(
        SubTask(
            id=subtask_id,
            execution_plan_id=plan_id,
            expert_type="researcher",
            description="已完成的任务",
            sort_order=0,
            status="completed",
            output_result="珍贵的历史产出，不可丢失",
        )
    )
    if artifact_id:
        db.add(
            Artifact(
                id=artifact_id,
                sub_task_id=subtask_id,
                thread_id="t1",
                type="markdown",
                title="历史产物",
                content="内容",
            )
        )
    await db.commit()


async def _call(db: Session, *, run_id, thread_id: str = "t1"):
    return await task_manager.get_or_create_execution_plan(
        db=db,
        thread_id=thread_id,
        run_id=run_id,
        user_query="新查询",
        strategy="策略",
        estimated_steps=2,
        subtasks_data=_subtasks_data(),
    )


async def _all_subtasks(db: Session, plan_id: str) -> list[SubTask]:
    return list((await db.exec(select(SubTask).where(SubTask.execution_plan_id == plan_id))).all())


async def _all_artifacts(db: Session) -> list[Artifact]:
    return list((await db.exec(select(Artifact))).all())


class TestSameRunReuse:
    """同一 run 内节点重执行 → 幂等，不得动子任务与产物。"""

    async def test_reuses_plan_without_deleting_subtasks(self, db):
        await _seed_plan(db)

        plan, is_reused = await _call(db, run_id="r1")

        assert is_reused is True
        assert plan.id == "p1"
        assert [s.id for s in await _all_subtasks(db, "p1")] == ["s-old"]

    async def test_preserves_completed_subtask_state(self, db):
        await _seed_plan(db)

        await _call(db, run_id="r1")

        subtask = (await _all_subtasks(db, "p1"))[0]
        assert subtask.status == "completed"
        assert subtask.output_result == "珍贵的历史产出，不可丢失"

    async def test_preserves_artifacts(self, db):
        await _seed_plan(db)

        await _call(db, run_id="r1")

        assert [a.id for a in await _all_artifacts(db)] == ["a-old"]

    async def test_repeated_calls_are_stable(self, db):
        await _seed_plan(db)

        first, _ = await _call(db, run_id="r1")
        second, _ = await _call(db, run_id="r1")

        assert first.id == second.id == "p1"
        assert len(await _all_subtasks(db, "p1")) == 1


class TestNewRunCreatesNewPlan:
    """同会话中的新一次复杂任务 → 新建计划，旧计划/子任务/产物全部保留。"""

    async def test_creates_a_separate_plan(self, db):
        await _seed_plan(db)

        plan, is_reused = await _call(db, run_id="r2")

        assert is_reused is False
        assert plan.id != "p1", "新 run 应新建计划，而不是改写旧计划"
        assert plan.run_id == "r2"
        assert len(await _all_subtasks(db, plan.id)) == 2

    async def test_old_plan_and_subtasks_survive(self, db):
        await _seed_plan(db)

        await _call(db, run_id="r2")

        old = await db.get(ExecutionPlan, "p1")
        assert old is not None, "旧计划不得被删除"
        assert old.run_id == "r1", "旧计划仍归其原始 run"
        assert [s.id for s in await _all_subtasks(db, "p1")] == ["s-old"]
        assert (await _all_subtasks(db, "p1"))[0].output_result == "珍贵的历史产出，不可丢失"

    async def test_old_artifacts_survive(self, db):
        """核心回归：新任务不能抹掉上一任务的产物。"""
        await _seed_plan(db)

        await _call(db, run_id="r2")

        assert [a.id for a in await _all_artifacts(db)] == ["a-old"]

    async def test_two_sequential_tasks_keep_both_artifacts(self, db):
        """用户场景：同会话「先生成网页、再写小游戏」——两个产物都要在。"""
        await _seed_plan(db, plan_id="p1", run_id="r1", subtask_id="s-web", artifact_id="a-web")

        # 第二次复杂任务
        plan2, _ = await _call(db, run_id="r2")
        db.add(
            SubTask(
                id="s-game",
                execution_plan_id=plan2.id,
                expert_type="coder",
                description="写个小游戏",
                sort_order=0,
                status="completed",
            )
        )
        db.add(
            Artifact(
                id="a-game",
                sub_task_id="s-game",
                thread_id="t1",
                type="html",
                title="小游戏",
                content="<html/>",
            )
        )
        await db.commit()

        assert sorted(a.id for a in await _all_artifacts(db)) == ["a-game", "a-web"]
        assert await db.get(Artifact, "a-web") is not None, "网页产物必须留存"

    async def test_latest_plan_lookup_prefers_newest(self, db):
        """按 thread 取计划 → 最新那份（显式 created_at 排序，非无序 .first()）。"""
        await _seed_plan(db)
        plan2, _ = await _call(db, run_id="r2")

        latest = await get_latest_execution_plan_by_thread(db, "t1")

        assert latest is not None and latest.id == plan2.id


class TestMissingRunId:
    """run_id 缺失时无法做同源判定 → 一律新建，绝不删除既有内容。"""

    async def test_creates_new_plan_without_deleting(self, db):
        await _seed_plan(db)

        plan, is_reused = await _call(db, run_id=None)

        assert is_reused is False
        assert plan.id != "p1"
        assert await db.get(ExecutionPlan, "p1") is not None
        assert [s.id for s in await _all_subtasks(db, "p1")] == ["s-old"]
        assert [a.id for a in await _all_artifacts(db)] == ["a-old"]
