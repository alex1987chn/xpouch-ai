"""
复杂模式执行计划领域模型

`ExecutionPlan` 负责承载复杂模式下的计划摘要、执行状态、
版本控制与子任务明细。
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, func
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, Relationship, SQLModel

from models.enums import ExecutionMode, TaskStatus, _enum_values


class ExecutionPlan(SQLModel, table=True):
    """复杂模式下的一次任务编排计划。"""

    __tablename__ = "executionplan"

    id: str = Field(
        default_factory=lambda: str(__import__("uuid").uuid4()),
        primary_key=True,
        max_length=64,
    )
    thread_id: str = Field(foreign_key="thread.id", index=True, max_length=64)
    run_id: str | None = Field(default=None, foreign_key="agentrun.id", index=True, max_length=64)

    user_query: str = Field(index=True)
    plan_summary: str | None = Field(default=None)
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
            index=True,
        ),
    )
    plan_version: int = Field(default=1)

    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(
        default_factory=datetime.now,
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
