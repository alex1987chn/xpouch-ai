"""子任务创建与依赖接线（批次 B4 下半）。

要钉死的性质：**传进来的依赖是 Commander 语义 ID，落库的必须是子任务 UUID**
（前端的计划视图与执行期 `expert_results.db_uuid` 匹配都用后者）。

这条转换此前只在「新建计划」路径里做，修订路径自己建行、没做——于是驳回修订后的
依赖存成了 LLM 写的 `"1"/"2"`，执行期谁都匹配不到，下游任务静默失去上游上下文。
现在两条路径共用 `create_subtasks`，本文件锁住它的行为。
"""

from __future__ import annotations

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from crud.execution_plan import create_subtasks
from models import ExecutionPlan, SubTask, Thread
from schemas.task import SubTaskCreate

TABLES = [Thread.__table__, ExecutionPlan.__table__, SubTask.__table__]


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine, tables=TABLES)
    with Session(engine) as session:
        session.add(Thread(id="t1", title="会话", user_id="u1"))
        session.add(
            ExecutionPlan(
                id="p1", thread_id="t1", user_query="q", plan_summary="s", estimated_steps=2
            )
        )
        session.commit()
        yield session


def _dto(task_id: str | None, desc: str, depends_on=None, sort_order: int = 0) -> SubTaskCreate:
    return SubTaskCreate(
        expert_type="search",
        task_description=desc,
        sort_order=sort_order,
        depends_on=depends_on,
        task_id=task_id,
    )


class TestDependencyWiring:
    def test_semantic_ids_are_resolved_to_subtask_uuids(self, db):
        rows = create_subtasks(
            db,
            "p1",
            [
                _dto("task_1", "检索"),
                _dto("task_2", "分析", depends_on=["task_1"]),
                _dto("task_3", "写作", depends_on=["task_1", "task_2"]),
            ],
        )

        by_semantic = {"task_1": rows[0], "task_2": rows[1], "task_3": rows[2]}
        assert rows[1].depends_on == [str(by_semantic["task_1"].id)]
        assert rows[2].depends_on == [str(by_semantic["task_1"].id), str(by_semantic["task_2"].id)]
        # 关键：落库的不是语义 ID
        assert "task_1" not in (rows[1].depends_on or [])

    def test_unknown_dependency_is_kept_verbatim(self, db):
        """指向不存在任务的依赖原样保留 —— 交给下游的依赖清理判断，不静默丢弃。"""
        rows = create_subtasks(db, "p1", [_dto("task_1", "检索", depends_on=["ghost"])])

        assert rows[0].depends_on == ["ghost"]

    def test_tasks_without_dependencies_stay_null(self, db):
        rows = create_subtasks(db, "p1", [_dto("task_1", "检索")])

        assert rows[0].depends_on is None

    def test_revision_flow_with_idless_tasks_wires_the_right_upstream(self, db):
        """修订路径的真实形态：LLM 常**不带 id**，依赖却写 "1"（1 基）。

        实测踩过的坑：留空交给位置兜底（0 基的 `task_{idx}`）时，LLM 写的 "1" 会被解析成
        第二个任务 —— writer 的依赖接成了它自己。所以修订路径先把 id 写成 1 基连续号。
        """
        from agents.plan_tasks import build_plan_tasks

        class _RevisedTask:
            def __init__(self, description: str, depends_on=None):
                self.id = ""  # LLM 没给 id
                self.expert_type = "search"
                self.description = description
                self.depends_on = depends_on or []
                self.input_data = {}
                self.execution_mode = "sequential"

        revised = [_RevisedTask("检索"), _RevisedTask("写作", depends_on=["1"])]
        for index, task in enumerate(revised, start=1):
            task.id = str(index)  # 与修订提示词一致：id 从 1 连续编号

        plan_tasks = build_plan_tasks(list(revised))
        rows = create_subtasks(db, "p1", [t.to_subtask_create() for t in plan_tasks])

        assert rows[1].depends_on == [str(rows[0].id)], "writer 的依赖必须指向检索任务"
        assert rows[1].depends_on != [str(rows[1].id)], "绝不能接成自己（实测踩过）"

    def test_sort_order_is_taken_from_the_dto(self, db):
        """sort_order 由调用方给（DTO 上是必填 int；commander 传的就是位置索引）。

        注意 `create_subtasks` 里那个 `else idx` 分支对 DTO 而言不可达（int 不可为 None），
        保留它只是防御历史调用方——不要为它写测试假装有这条路径。
        """
        rows = create_subtasks(
            db, "p1", [_dto("task_1", "a", sort_order=0), _dto("task_2", "b", sort_order=7)]
        )

        assert [r.sort_order for r in rows] == [0, 7]
