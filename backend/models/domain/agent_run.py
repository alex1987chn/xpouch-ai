"""
AgentRun 领域模型

统一表示一次真实执行实例，作为 runtime control plane 的核心对象。
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, String, func
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, Relationship, SQLModel

from models.enums import RunStatus, _enum_values


class AgentRun(SQLModel, table=True):
    """一次真实执行实例。"""

    __tablename__ = "agentrun"

    id: str = Field(
        default_factory=lambda: str(__import__("uuid").uuid4()),
        primary_key=True,
        max_length=64,
    )
    thread_id: str = Field(foreign_key="thread.id", index=True, max_length=64)
    user_id: str = Field(foreign_key="user.id", index=True, max_length=64)

    # 入口与模式描述
    entrypoint: str = Field(
        default="chat", sa_column=Column(String(32), nullable=False, index=True)
    )
    mode: str = Field(default="simple", sa_column=Column(String(32), nullable=False, index=True))

    status: RunStatus = Field(
        default=RunStatus.QUEUED,
        sa_column=Column(
            SAEnum(
                RunStatus,
                name="run_status_enum",
                native_enum=True,
                values_callable=_enum_values,
            ),
            index=True,
            nullable=False,
        ),
    )

    idempotency_key: str | None = Field(default=None, index=True, max_length=128)
    checkpoint_namespace: str | None = Field(default=None, max_length=128)
    current_node: str | None = Field(default=None, max_length=128)

    error_code: str | None = Field(default=None, max_length=64)
    error_message: str | None = Field(default=None)

    retry_of_run_id: str | None = Field(default=None, foreign_key="agentrun.id", max_length=64)

    created_at: datetime = Field(default_factory=datetime.now)
    started_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(
        default_factory=datetime.now,
        sa_column_kwargs={"onupdate": func.now()},
    )
    deadline_at: datetime | None = None
    last_heartbeat_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
    timed_out_at: datetime | None = None

    thread: Optional["Thread"] = Relationship(back_populates="runs")  # noqa: F821
    execution_plan: Optional["ExecutionPlan"] = Relationship(  # noqa: F821
        back_populates="agent_run"
    )
