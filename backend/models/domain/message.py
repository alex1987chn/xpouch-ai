"""
消息领域模型

包含：
- Message: 消息表
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Column, Index
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from models.domain.thread import Thread


class Message(SQLModel, table=True):
    """消息表"""

    __tablename__ = "message"

    id: int | None = Field(default=None, primary_key=True)
    thread_id: str = Field(
        foreign_key="thread.id", index=True, max_length=64
    )
    role: str = Field(max_length=20)
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)
    # extra_data 字段存储 thinking、reasoning 等额外信息
    extra_data: dict | None = Field(
        default=None, sa_column=Column(JSON)
    )

    thread: Thread = Relationship(back_populates="messages")

    # 复合索引：优化消息查询
    # 场景：加载对话历史时，查询 WHERE thread_id = ? ORDER BY timestamp DESC
    __table_args__ = (
        Index("idx_message_thread_timestamp", "thread_id", "timestamp"),
    )
