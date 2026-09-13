"""执行模式（execution_mode）贯通链路的特征测试（批次 B2）。

背景：`SubTask.execution_mode` 与 `ExecutionMode.PARALLEL` 早已在 DB/枚举层
定义，但 LLM 计划 schema 没有该字段、commander 三处硬编码 "sequential"，
导致「并行」从源头就断了——即使批次 C 做出分波扇出执行器，也没有数据喂给它。

B2 做的是**结构性预埋**（行为不变）：给 LLM schema 加该字段并让其贯通到
SubTaskCreate / SubTask / ExecutionPlan。LLM 未产出该字段时取默认值
sequential，与修复前的硬编码行为完全一致。

本组用例锁住这条链路，使批次 C 只需改提示词 + 执行器，无需再动数据模型。
"""

import json

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from agents.nodes.commander import ExecutionPlan, Task, derive_plan_execution_mode
from models import ExecutionPlan as ExecutionPlanRow
from models import SubTask, Thread
from models.enums import ExecutionMode
from schemas.task import SubTaskCreate

TABLES = [Thread.__table__, ExecutionPlanRow.__table__, SubTask.__table__]


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


def _llm_plan_json(*, modes: list[str | None]) -> str:
    """构造 LLM 返回的计划 JSON；mode 为 None 表示该任务不产出 execution_mode。"""
    tasks = []
    for idx, mode in enumerate(modes):
        item: dict[str, object] = {
            "id": f"task_{idx + 1}",
            "expert_type": "researcher",
            "description": f"任务 {idx + 1}",
        }
        if mode is not None:
            item["execution_mode"] = mode
        tasks.append(item)
    return json.dumps(
        {"strategy": "s", "estimated_steps": len(tasks), "tasks": tasks}, ensure_ascii=False
    )


class TestSchemaDefault:
    """LLM 未产出 execution_mode → 默认 sequential（行为不变的关键）。"""

    def test_missing_field_defaults_to_sequential(self):
        plan = ExecutionPlan.model_validate_json(_llm_plan_json(modes=[None, None]))
        assert all(t.execution_mode == ExecutionMode.SEQUENTIAL for t in plan.tasks)

    def test_explicit_parallel_is_accepted(self):
        plan = ExecutionPlan.model_validate_json(_llm_plan_json(modes=["parallel"]))
        assert plan.tasks[0].execution_mode == ExecutionMode.PARALLEL

    def test_direct_task_construction_defaults_to_sequential(self):
        task = Task(expert_type="writer", description="x")
        assert task.execution_mode == ExecutionMode.SEQUENTIAL


class TestPlanModeDerivation:
    """计划级模式由任务派生（任一 parallel → 计划级 parallel）。"""

    def test_all_sequential(self):
        tasks = [Task(expert_type="a", description="1"), Task(expert_type="b", description="2")]
        assert derive_plan_execution_mode(tasks) == ExecutionMode.SEQUENTIAL

    def test_any_parallel_escalates_plan(self):
        tasks = [
            Task(expert_type="a", description="1"),
            Task(expert_type="b", description="2", execution_mode=ExecutionMode.PARALLEL),
        ]
        assert derive_plan_execution_mode(tasks) == ExecutionMode.PARALLEL

    def test_empty_plan_stays_sequential(self):
        assert derive_plan_execution_mode([]) == ExecutionMode.SEQUENTIAL


class TestPersistenceChain:
    """执行模式真的能落到 SubTask 行上（批次 C 的数据来源）。"""

    def _persist(self, db: Session, *, mode: ExecutionMode) -> SubTask:
        db.add(Thread(id="t1", title="会话", user_id="u1"))
        db.add(
            ExecutionPlanRow(
                id="p1",
                thread_id="t1",
                user_query="q",
                run_id="r1",
                execution_mode=derive_plan_execution_mode(
                    [Task(expert_type="a", description="1", execution_mode=mode)]
                ),
            )
        )
        create_payload = SubTaskCreate(
            expert_type="researcher",
            task_description="任务",
            sort_order=0,
            execution_mode=mode,
        )
        subtask = SubTask(
            id="s1",
            execution_plan_id="p1",
            expert_type=create_payload.expert_type,
            task_description=create_payload.task_description,
            sort_order=create_payload.sort_order,
            execution_mode=create_payload.execution_mode,
        )
        db.add(subtask)
        db.commit()
        return subtask

    def test_parallel_survives_to_subtask_row(self, db):
        subtask = self._persist(db, mode=ExecutionMode.PARALLEL)
        db.refresh(subtask)
        assert subtask.execution_mode == ExecutionMode.PARALLEL

    def test_plan_level_mode_follows_task(self, db):
        self._persist(db, mode=ExecutionMode.PARALLEL)
        plan = db.get(ExecutionPlanRow, "p1")
        assert plan.execution_mode == ExecutionMode.PARALLEL
