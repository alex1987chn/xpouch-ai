"""计划修订基线快照的持久化契约（2026-10-04 修订基线持久化）。

回归背景：v(n-1)↔v(n) 对比只活在审批卡内存（前端 setPendingPlan 版本
跳变留档），修订后切会话/刷新，restore 只能从 subtask 重建最新版——
对比视图永久丢失。现在修订提交点把 v(n-1) 全量落在计划行上。

要钉死的性质：
- 成功修订：baseline_snapshot 记录修订前的任务全量（uuid 主键 + sort_order），
  version = 修订前版本号；任务行完成 v(n-1)→v(n) 的替换；
- 快照形状与 PlanBaseline（响应 schema）同构——这是 GET /runs/{id}/plan
  能直接带出的前提；
- 失败修订：不写基线、版本不动、原任务保留（退回"原计划待审"）。
"""

from types import SimpleNamespace

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from models import Artifact, ExecutionPlan, RunEvent, SubTask, Thread
from schemas.run_event import PlanBaseline
from services.chat.recovery_service import RecoveryService

_TEST_ENGINE_HOLDER = [None]


def _test_session():
    from sqlmodel.ext.asyncio.session import AsyncSession

    return AsyncSession(_TEST_ENGINE_HOLDER[0], expire_on_commit=False)


TABLES = [
    Thread.__table__,
    ExecutionPlan.__table__,
    SubTask.__table__,
    RunEvent.__table__,
    Artifact.__table__,
]


@pytest.fixture
async def db(monkeypatch):
    _TEST_ENGINE_HOLDER[0] = engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: SQLModel.metadata.create_all(c, tables=TABLES))

    # run_revision_job 自建私有会话（异步纪律），把工厂缝到测试引擎上
    monkeypatch.setattr("services.chat.recovery_service.SessionFactory", _test_session)

    async with _test_session() as session:
        session.add(Thread(id="t1", title="会话", user_id="u1"))
        session.add(
            ExecutionPlan(
                id="p1",
                thread_id="t1",
                run_id="r1",
                user_query="写点东西",
                strategy="s1",
                estimated_steps=2,
                plan_version=1,
            )
        )
        old_a = SubTask(
            id="uuid-old-a",
            execution_plan_id="p1",
            task_id="1",
            expert_type="search",
            description="旧任务A",
            sort_order=0,
        )
        old_b = SubTask(
            id="uuid-old-b",
            execution_plan_id="p1",
            task_id="2",
            expert_type="writer",
            description="旧任务B",
            sort_order=1,
            depends_on=["uuid-old-a"],
        )
        session.add(old_a)
        session.add(old_b)
        await session.commit()
        yield session
    await engine.dispose()


def _fake_revision(tasks, strategy="s2"):
    async def fake(*, user_query, previous_tasks, plan_version, feedback):  # noqa: ARG001
        return SimpleNamespace(tasks=[SimpleNamespace(**t) for t in tasks], strategy=strategy)

    return fake


async def test_revision_persists_baseline_snapshot(db, monkeypatch):
    monkeypatch.setattr(
        "agents.services.plan_revision.revise_plan_tasks",
        _fake_revision(
            [
                {
                    "id": "1",
                    "expert_type": "writer",
                    "description": "新任务",
                    "depends_on": [],
                    "input_data": {},
                    "execution_mode": "sequential",
                }
            ]
        ),
    )

    await RecoveryService(None).run_revision_job(
        run_id="r1", thread_id="t1", execution_plan_id="p1", feedback="合并成一个任务"
    )

    plan = await db.get(ExecutionPlan, "p1")
    assert plan.plan_version == 2

    # 基线 = 被替换的 v1 全量（uuid 主键原样保留，依赖线也是 uuid 口径）
    baseline = PlanBaseline.model_validate(plan.baseline_snapshot)
    assert baseline.version == 1
    assert [t.id for t in baseline.tasks] == ["uuid-old-a", "uuid-old-b"]
    assert baseline.tasks[0].description == "旧任务A"
    assert baseline.tasks[1].depends_on == ["uuid-old-a"]

    # 任务行完成替换：旧 uuid 消失，新任务落位
    from sqlmodel import select

    subtasks = (await db.exec(select(SubTask).where(SubTask.execution_plan_id == "p1"))).all()
    assert [st.id for st in subtasks] != ["uuid-old-a", "uuid-old-b"]
    assert [st.description for st in subtasks] == ["新任务"]


async def test_failed_revision_leaves_no_baseline(db, monkeypatch):
    async def boom(*, user_query, previous_tasks, plan_version, feedback):  # noqa: ARG001
        raise RuntimeError("LLM 炸了")

    monkeypatch.setattr("agents.services.plan_revision.revise_plan_tasks", boom)

    await RecoveryService(None).run_revision_job(
        run_id="r1", thread_id="t1", execution_plan_id="p1", feedback="再改改"
    )

    plan = await db.get(ExecutionPlan, "p1")
    assert plan.plan_version == 1
    assert plan.baseline_snapshot is None

    from sqlmodel import select

    subtasks = (await db.exec(select(SubTask).where(SubTask.execution_plan_id == "p1"))).all()
    assert [st.id for st in subtasks] == ["uuid-old-a", "uuid-old-b"]
