"""
复杂模式执行计划领域模型

`ExecutionPlan` 负责承载复杂模式下的计划摘要、执行状态、
版本控制与子任务明细。
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Column, Index, func
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, Relationship, SQLModel

from models.enums import ExecutionMode, TaskStatus, _enum_values
from utils.time import utc_now


class ExecutionPlan(SQLModel, table=True):
    """复杂模式下的一次任务编排计划。"""

    __tablename__ = "executionplan"

    id: str = Field(
        default_factory=lambda: str(__import__("uuid").uuid4()),
        primary_key=True,
        max_length=64,
    )
    thread_id: str = Field(foreign_key="thread.id", index=True, max_length=64, ondelete="CASCADE")
    run_id: str | None = Field(
        default=None, foreign_key="agentrun.id", index=True, max_length=64, ondelete="CASCADE"
    )

    user_query: str = Field(index=True)
    strategy: str | None = Field(default=None)
    estimated_steps: int = Field(default=0)

    execution_mode: ExecutionMode = Field(
        default=ExecutionMode.SEQUENTIAL,
        sa_column=Column(
            SAEnum(
                ExecutionMode,
                name="execution_mode_enum",
                native_enum=True,
                values_callable=_enum_values,
            )
        ),
    )

    sub_tasks: list["SubTask"] = Relationship(  # noqa: F821
        back_populates="execution_plan",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "order_by": "SubTask.sort_order",
        },
    )

    final_response: str | None = Field(default=None)
    status: TaskStatus = Field(
        default=TaskStatus.PENDING,
        sa_column=Column(
            SAEnum(
                TaskStatus,
                name="task_status_enum",
                native_enum=True,
                values_callable=_enum_values,
            ),
            nullable=False,
            index=True,
        ),
    )
    plan_version: int = Field(default=1)

    # 修订基线快照：{"version": n-1, "tasks": [RunPlanTask 形状]}
    # v(n-1)↔v(n) 对比此前只活在审批卡内存（setPendingPlan 版本跳变留档），
    # 切会话/刷新后 restore 只剩最新版，对比视图永久丢失——基线随计划行
    # 持久化，GET /runs/{id}/plan 带出。整份赋值、从不原地改（JSON 列无
    # mutable 追踪，原地改不会落库）。none_as_null：未修订的行存 SQL NULL
    # 而非 json null（JSON 类型默认把 None 序列化成 json null，IS NULL 查询
    # 会漏行——数据口径统一成 SQL NULL）。
    baseline_snapshot: dict | None = Field(
        default=None, sa_column=Column(JSON(none_as_null=True), nullable=True)
    )

    __table_args__ = (Index("idx_executionplan_thread_created", "thread_id", "created_at"),)

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(
        default_factory=utc_now,
        sa_column_kwargs={"onupdate": func.now()},
    )
    completed_at: datetime | None = None

    thread: Optional["Thread"] = Relationship(  # noqa: F821
        back_populates="execution_plan",
        sa_relationship_kwargs={"foreign_keys": "ExecutionPlan.thread_id"},
    )
    agent_run: Optional["AgentRun"] = Relationship(  # noqa: F821
        back_populates="execution_plan"
    )
