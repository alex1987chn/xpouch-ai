"""
消息领域模型

包含：
- Message: 消息表
"""

from datetime import datetime

from sqlalchemy import JSON, Column, Index
from sqlmodel import Field, Relationship, SQLModel


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

    # 关联关系（使用字符串避免循环导入）
    thread: "Thread" = Relationship(back_populates="messages")  # noqa: F821

    # 复合索引：优化消息查询
    # 场景：加载对话历史时，查询 WHERE thread_id = ? ORDER BY timestamp DESC
    __table_args__ = (
        Index("idx_message_thread_timestamp", "thread_id", "timestamp"),
    )
