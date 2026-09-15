"""
AgentRun 领域模型

统一表示一次真实执行实例，作为 runtime control plane 的核心对象。
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, Relationship, SQLModel

from models.enums import RunStatus, _enum_values
from utils.time import utc_now_naive


class AgentRun(SQLModel, table=True):
    """一次真实执行实例。"""

    __tablename__ = "agentrun"

    id: str = Field(
        default_factory=lambda: str(__import__("uuid").uuid4()),
        primary_key=True,
        max_length=64,
    )
    thread_id: str = Field(foreign_key="thread.id", index=True, max_length=64, ondelete="CASCADE")
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
    error_message: str | None = Field(default=None, sa_type=Text)

    # Token 用量记账（B5）：各专家任务 ainvoke 的 usage_metadata 增量累加；
    # router/aggregator 的小额调用暂不统计（文档注明为近似值）
    prompt_tokens: int = Field(default=0)
    completion_tokens: int = Field(default=0)
    total_tokens: int = Field(default=0)

    retry_of_run_id: str | None = Field(
        default=None, foreign_key="agentrun.id", max_length=64, ondelete="SET NULL"
    )

    created_at: datetime = Field(default_factory=utc_now_naive)
    started_at: datetime = Field(default_factory=utc_now_naive)
    updated_at: datetime = Field(
        default_factory=utc_now_naive,
        sa_column_kwargs={"onupdate": func.now()},
    )
    deadline_at: datetime | None = None
    last_heartbeat_at: datetime | None = None

    # ---- run 租约（决定 2）：存活判定的唯一权威 ----
    # 语义与读写点见 utils/run_lease.py 与 services/run_lease_service.py。
    # 与 `last_heartbeat_at` 的分工：心跳 = 「最后一次见到进展」的诊断记录；
    # 租约 = 「谁、到什么时候」的持有声明 —— 只有租约能判定一个 run 是死是活。
    owner: str | None = Field(default=None, max_length=128)
    lease_expires_at: datetime | None = Field(default=None, index=True)
    attempt: int = Field(default=0)

    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
    timed_out_at: datetime | None = None

    thread: Optional["Thread"] = Relationship(back_populates="runs")  # noqa: F821
    execution_plan: Optional["ExecutionPlan"] = Relationship(  # noqa: F821
        back_populates="agent_run"
    )
