"""
任务会话领域模型

包含：
- TaskSession: 任务会话表（复杂模式）
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Column, func
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, Relationship, SQLModel

from models.enums import ExecutionMode, TaskStatus, _enum_values

if TYPE_CHECKING:
    from models.domain.subtask import SubTask
    from models.domain.thread import Thread


class TaskSession(SQLModel, table=True):
    """
    任务会话模型 - 记录一次完整的多专家协作过程（仅复杂模式）
    """

    __tablename__ = "tasksession"

    session_id: str = Field(
        default_factory=lambda: __import__("uuid").uuid4(),
        primary_key=True,
    )

    # 关联的会话ID（核心！用于从历史记录加载）
    thread_id: str = Field(
        foreign_key="thread.id", index=True, max_length=64
    )

    # 用户查询：原始用户输入
    user_query: str = Field(index=True)

    # 规划摘要：Commander 生成的策略概述
    plan_summary: str | None = Field(default=None)

    # 预计步骤数
    estimated_steps: int = Field(default=0)

    # 执行模式：串行或并行
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
    )  # DB-12: 使用 PostgreSQL ENUM

    # 关联的子任务列表
    sub_tasks: list[SubTask] = Relationship(
        back_populates="task_session",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "order_by": "SubTask.sort_order",
        },
    )

    # 最终响应：整合所有子任务结果的最终答案
    final_response: str | None = Field(default=None)

    # 会话状态：pending | running | completed | failed
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
    )  # DB-12: 使用 PostgreSQL ENUM

    # 乐观锁版本号：用于 HITL 计划更新冲突检测
    # 每次用户确认/更新计划时递增
    plan_version: int = Field(default=1)

    # 时间戳
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(
        default_factory=datetime.now,
        sa_column_kwargs={"onupdate": func.now},
    )
    completed_at: datetime | None = None

    # 关联关系
    thread: Thread | None = Relationship(back_populates="task_session")
