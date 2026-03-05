"""
产物领域模型

包含：
- Artifact: 产物表
"""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, Relationship, SQLModel


class Artifact(SQLModel, table=True):
    """
    产物模型 - 支持一个专家生成多个产物
    """

    __tablename__ = "artifact"

    id: str = Field(
        default_factory=lambda: __import__("uuid").uuid4(),
        primary_key=True,
    )

    # 关联的子任务
    sub_task_id: str = Field(foreign_key="subtask.id", index=True, max_length=64)

    # 产物类型：code | html | markdown | json | text
    type: str = Field(index=True, max_length=32)

    # 产物标题
    title: str | None = Field(default=None, max_length=255)

    # 产物内容
    content: str

    # 代码语言（如果是代码类型）
    language: str | None = Field(default=None, max_length=64)

    # 排序顺序（同一专家的多产物排序）
    sort_order: int = Field(default=0)

    # 时间戳
    created_at: datetime = Field(default_factory=datetime.now)

    # 关联关系（使用字符串避免循环导入）
    sub_task: Optional["SubTask"] = Relationship(back_populates="artifacts")  # noqa: F821
