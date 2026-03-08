"""
RunEvent 领域模型

append-only 事件账本，用于追踪 AgentRun 的完整生命周期。
每个事件记录一个关键节点，包含时间戳和上下文元数据。
"""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, func
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, SQLModel

from models.enums import RunEventType, _enum_values


class RunEvent(SQLModel, table=True):
    """
    运行事件账本（append-only）

    记录 AgentRun 的关键生命周期事件，支持：
    - 可追溯的运行历史
    - 调试和排障
    - 运行时状态恢复
    - 审计和合规

    设计原则：
    - 只追加，不修改，不删除
    - 事件数据结构化存储
    - 支持按 run_id 查询完整时间线
    """

    __tablename__ = "runevent"

    id: int = Field(default=None, primary_key=True)
    run_id: str = Field(foreign_key="agentrun.id", index=True, max_length=64)

    event_type: RunEventType = Field(
        sa_column=Column(
            SAEnum(
                RunEventType,
                name="run_event_type_enum",
                native_enum=True,
                values_callable=_enum_values,
            ),
            index=True,
            nullable=False,
        ),
    )

    # 事件时间戳（服务器时间）
    timestamp: datetime = Field(
        default_factory=datetime.now,
        sa_column_kwargs={"server_default": func.now()},
    )

    # 事件上下文元数据（JSON）
    # 存储随事件产生的具体数据，如：
    # - router_decided: {"mode": "complex", "reason": "..."}
    # - task_started: {"task_id": "...", "expert_type": "search"}
    # - artifact_generated: {"artifact_id": "...", "type": "code"}
    event_data: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON, nullable=True))

    # 关联的线程 ID（冗余存储，便于按线程查询）
    thread_id: str | None = Field(default=None, foreign_key="thread.id", max_length=64, index=True)

    # 关联的计划 ID（计划相关事件）
    execution_plan_id: str | None = Field(
        default=None, foreign_key="executionplan.id", max_length=64, index=True
    )

    # 关联的任务 ID（任务相关事件）
    task_id: str | None = Field(default=None, max_length=64, index=True)

    # 备注（可选，用于人工标注或补充说明）
    note: str | None = Field(default=None, max_length=512)
