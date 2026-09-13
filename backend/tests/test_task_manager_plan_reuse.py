"""`get_or_create_execution_plan` 的复用/替换语义（批次 B1）。

背景：该函数原按 `thread_id` 单一键判定，命中即**删除全部旧 SubTasks 再重建**。
这与审批路径（`_apply_updated_plan` 显式保留已完成任务的 `output_result`/`task_id`）
语义冲突——任何让 commander 节点重执行的机制（重试、并行分支、未来重构）都会
静默抹掉已完成任务的记录。

修复后按 `(thread_id, run_id)` 二元组判定：
  - 同一 run → 复用，不触碰子任务（幂等，节点可安全重执行）
  - 不同 run → 替换计划内容（同会话中「新一次复杂任务」的原有意图，保留）
  - run_id 缺失 → 沿用替换语义（无法判定同源，保守取原有行为）

用真 SQLite 而非 fake session：本组用例要证明的正是「子任务行未被删除」，
假会话无法证明这一点。
"""

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from agents.services import task_manager
from models import Artifact, ExecutionPlan, SubTask, Thread
from schemas.task import SubTaskCreate

# Artifact 必须建表：SubTask.artifacts 配了 cascade="all, delete-orphan"，
# 删除子任务时 ORM 会连带删除其产物（delete 路径需要这张表才能执行）
TABLES = [
    Thread.__table__,
    ExecutionPlan.__table__,
    SubTask.__table__,
    Artifact.__table__,
]


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine, tables=TABLES)
    with Session(engine) as session:
        yield session


def _subtasks_data() -> list[SubTaskCreate]:
    return [
        SubTaskCreate(expert_type="researcher", task_description="新任务 A", sort_order=0),
        SubTaskCreate(expert_type="writer", task_description="新任务 B", sort_order=1),
    ]


def _seed_plan(db: Session, *, plan_id: str, run_id: str, with_completed_subtask: bool = True):
    """建一个属于 run_id 的计划；可选地放入一条**已完成**的子任务（带一份产物）。"""
    db.add(Thread(id="t1", title="会话", user_id="u1"))
    db.add(
        ExecutionPlan(
            id=plan_id, thread_id="t1", user_query="原查询", run_id=run_id, plan_version=1
        )
    )
    if with_completed_subtask:
        db.add(
            SubTask(
                id="s-old",
                execution_plan_id=plan_id,
                expert_type="researcher",
                task_description="已完成的任务",
                sort_order=0,
                status="completed",
                output_result="珍贵的历史产出，不可丢失",
            )
        )
        db.add(
            Artifact(
                id="a-old",
                sub_task_id="s-old",
                thread_id="t1",
                type="markdown",
                title="历史产物",
                content="内容",
            )
        )
    db.commit()


def _all_artifacts(db: Session) -> list[Artifact]:
    return list(db.exec(select(Artifact)).all())


def _call(db: Session, *, run_id, thread_id: str = "t1"):
    return task_manager.get_or_create_execution_plan(
        db=db,
        thread_id=thread_id,
        run_id=run_id,
        user_query="新查询",
        plan_summary="策略",
        estimated_steps=2,
        subtasks_data=_subtasks_data(),
    )


def _all_subtasks(db: Session, plan_id: str) -> list[SubTask]:
    return list(db.exec(select(SubTask).where(SubTask.execution_plan_id == plan_id)).all())


class TestSameRunReuse:
    """同一 run 内节点重执行 → 幂等，不得动子任务。"""

    def test_reuses_plan_without_deleting_subtasks(self, db):
        _seed_plan(db, plan_id="p1", run_id="r1")

        plan, is_reused = _call(db, run_id="r1")

        assert is_reused is True
        assert plan.id == "p1"
        subtasks = _all_subtasks(db, "p1")
        assert len(subtasks) == 1, "同一 run 重执行不得重建子任务"
        assert subtasks[0].id == "s-old"

    def test_preserves_completed_subtask_state(self, db):
        """核心不变量：已完成任务的产出与状态必须原样保留。

        注：SubTask 没有存放 Commander 语义 task_id（如 "task_0"）的字段——
        该 ID 目前只活在图状态与 expert_results 中，靠 db_uuid 双保险匹配。
        这是 B2（决定 4 · Plan 单真相）要收掉的双身份问题之一。
        """
        _seed_plan(db, plan_id="p1", run_id="r1")

        _call(db, run_id="r1")

        subtask = _all_subtasks(db, "p1")[0]
        assert subtask.status == "completed"
        assert subtask.output_result == "珍贵的历史产出，不可丢失"

    def test_repeated_calls_are_stable(self, db):
        _seed_plan(db, plan_id="p1", run_id="r1")

        first, _ = _call(db, run_id="r1")
        second, _ = _call(db, run_id="r1")

        assert first.id == second.id == "p1"
        assert len(_all_subtasks(db, "p1")) == 1

    def test_preserves_artifacts(self, db):
        """同 run 复用不删子任务 → 其产物也必须留存（对比下方 replace 路径）。"""
        _seed_plan(db, plan_id="p1", run_id="r1")

        _call(db, run_id="r1")

        assert [a.id for a in _all_artifacts(db)] == ["a-old"]


class TestDifferentRunReplaces:
    """同会话中的新一次复杂任务 → 保持原有替换语义。"""

    def test_replaces_plan_content(self, db):
        _seed_plan(db, plan_id="p1", run_id="r1")

        plan, is_reused = _call(db, run_id="r2")

        assert is_reused is True
        assert plan.id == "p1", "复用同一 ExecutionPlan 行（thread 级单计划）"
        subtasks = _all_subtasks(db, "p1")
        assert len(subtasks) == 2, "新 run 应以其自身任务替换旧任务"
        assert all(s.id != "s-old" for s in subtasks)

    def test_rebind_run_id(self, db):
        _seed_plan(db, plan_id="p1", run_id="r1")

        plan, _ = _call(db, run_id="r2")

        assert plan.run_id == "r2"

    def test_replace_cascades_to_artifacts(self, db):
        """⚠️ 特征测试：替换路径会**连带删除旧计划子任务的产物**。

        成因：SubTask.artifacts 配了 cascade="all, delete-orphan"，
        `db.delete(old_subtask)` → ORM 连带删除其 Artifact 行。

        这里只**记录既有行为**、不判定对错：它是否合理取决于产品语义
        （「同会话新任务是否应清理上一任务的产物」）。若要改，属于数据/产品
        决策，需与画廊、分享链接、审计的语义一起考虑——故不在 B1 内擅改。
        """
        _seed_plan(db, plan_id="p1", run_id="r1")

        _call(db, run_id="r2")

        assert _all_artifacts(db) == [], "当前行为：替换计划会级联删除旧产物"


class TestMissingRunIdKeepsLegacyBehavior:
    """run_id 缺失时无法判定同源，保守沿用替换语义（与修复前一致）。"""

    def test_replaces_when_run_id_is_none(self, db):
        _seed_plan(db, plan_id="p1", run_id="r1")

        plan, is_reused = _call(db, run_id=None)

        assert is_reused is True
        subtasks = _all_subtasks(db, plan.id)
        assert len(subtasks) == 2
        assert all(s.id != "s-old" for s in subtasks)
