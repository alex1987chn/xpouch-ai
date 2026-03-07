"""
会话领域模型

包含：
- Thread: 会话表
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, String, func
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, Relationship, SQLModel

from models.enums import ConversationType, _enum_values


class Thread(SQLModel, table=True):
    """
    会话模型

    - 简单模式（DEFAULT, CUSTOM）：仅存储消息
    - 复杂模式（AI）：额外关联 ExecutionPlan，存储专家执行记录
    """

    __tablename__ = "thread"  # 显式指定表名为 thread（单数形式）

    id: str | None = Field(default=None, primary_key=True)
    title: str = Field(max_length=512)

    # 会话类型：明确区分三种模式
    agent_type: ConversationType = Field(
        default=ConversationType.DEFAULT,
        sa_column=Column(
            SAEnum(
                ConversationType,
                name="conversation_type_enum",
                native_enum=True,
                values_callable=_enum_values,
            ),
            index=True,
        ),
    )

    # 智能体ID
    # - agent_type='default' 时，存储默认助手的UUID
    # - agent_type='custom' 时，存储自定义智能体的UUID
    # - agent_type='ai' 时，存储固定的'ai-assistant'标识
    agent_id: str = Field(index=True, default="sys-default-chat", max_length=128)

    # 用户ID
    user_id: str = Field(foreign_key="user.id", index=True, max_length=64)

    # 关联的复杂执行计划（仅复杂模式有值）
    execution_plan_id: str | None = Field(
        default=None,
        foreign_key="executionplan.id",
        index=True,
        max_length=64,
    )

    # 线程状态（记录线程的执行状态）
    # - idle: 空闲/完成状态
    # - running: 正在运行
    # - paused: 暂停
    status: str = Field(
        default="idle",
        sa_column=Column(String(32), nullable=False, index=True),
    )

    # 线程模式（记录路由模式）
    # - simple: 普通对话模式（不自动展开面板）
    # - complex: 复杂协作模式（自动展开面板）
    thread_mode: str = Field(
        default="simple",
        sa_column=Column(String(16), nullable=False, index=True),
    )

    # 时间戳
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(
        default_factory=datetime.now,
        sa_column_kwargs={"onupdate": func.now()},
    )

    # 关联关系（使用字符串避免循环导入）
    user: Optional["User"] = Relationship(back_populates="threads")  # noqa: F821
    messages: list["Message"] = Relationship(  # noqa: F821
        back_populates="thread",
        sa_relationship_kwargs={"cascade": "all, delete"},
    )
    runs: list["AgentRun"] = Relationship(back_populates="thread")  # noqa: F821
    execution_plan: Optional["ExecutionPlan"] = Relationship(  # noqa: F821
        back_populates="thread",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "foreign_keys": "ExecutionPlan.thread_id",
        },
    )
