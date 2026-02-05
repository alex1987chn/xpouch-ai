from typing import List, Optional
from sqlmodel import SQLModel, Field
from sqlalchemy import Column
from pgvector.sqlalchemy import Vector  # 必须确保数据库已开启 pgvector 插件


class UserMemory(SQLModel, table=True):
    """用户长期记忆表 - 存储向量化的用户偏好、习惯和重要信息"""
    __tablename__ = "user_memories"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True, description="用户ID")
    content: str = Field(description="记忆内容文本")

    # 🔥 BAAI/bge-m3 的维度是 1024
    embedding: List[float] = Field(sa_column=Column(Vector(1024)))

    created_at: str = Field(description="创建时间 ISO 格式")
    source: str = Field(default="conversation", description="记忆来源: conversation/user_profile/system")
    memory_type: str = Field(default="fact", description="记忆类型: fact/preference/habit/important")

    def __repr__(self):
        return f"<UserMemory(id={self.id}, user_id={self.user_id}, content={self.content[:50]}...)>"
