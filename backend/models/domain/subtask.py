"""
子任务领域模型

包含：
- SubTask: 子任务表
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Column, Index, func
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, Relationship, SQLModel

from models.enums import ExecutionMode, TaskStatus, _enum_values

if TYPE_CHECKING:
    from models.domain.artifact import Artifact
    from models.domain.task_session import TaskSession


class SubTask(SQLModel, table=True):
    """
    子任务模型 - 专家执行的具体任务

    每个专家任务产生一个或多个交付物（Artifacts）
    支持串行和并行执行模式
    """

    __tablename__ = "subtask"

    id: str = Field(
        default_factory=lambda: __import__("uuid").uuid4(),
        primary_key=True,
    )

    # 关联的任务会话
    task_session_id: str = Field(
        foreign_key="tasksession.session_id", index=True, max_length=64
    )

    # 排序顺序：用于前端展示和串行执行顺序
    sort_order: int = Field(default=0, index=True)

    # 专家类型：指定由哪个专家执行
    expert_type: str = Field(
        index=True, max_length=64
    )  # 存储 ExpertType 枚举值

    # 任务描述：自然语言描述的任务内容
    task_description: str = Field(index=True)

    # 输入数据：JSON 格式的任务参数
    input_data: dict | None = Field(default=None, sa_column=Column(JSON))

    # 任务状态
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

    # 依赖任务：并行模式下可能依赖其他任务（可选）
    depends_on: list[str] | None = Field(
        default=None, sa_column=Column(JSON)
    )

    # 输出结果：JSON 格式的执行结果
    output_result: dict | None = Field(
        default=None, sa_column=Column(JSON)
    )

    # 错误信息
    error_message: str | None = None

    # 执行耗时（毫秒）
    duration_ms: int | None = None

    # 时间戳
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(
        default_factory=datetime.now,
        sa_column_kwargs={"onupdate": func.now},
    )
    started_at: datetime | None = None
    completed_at: datetime | None = None

    # 关联关系
    task_session: TaskSession = Relationship(
        back_populates="sub_tasks"
    )

    # 关联的 Artifacts（多产物支持）
    artifacts: list[Artifact] = Relationship(
        back_populates="sub_task",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

    # 复合索引：优化高频查询场景
    # 场景：每次加载会话时，查询 WHERE task_session_id = ? AND status = ?
    __table_args__ = (
        Index("idx_subtask_session_status", "task_session_id", "status"),
    )
