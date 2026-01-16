from typing import List, Optional
from datetime import datetime
from sqlmodel import Field, SQLModel, Relationship

class User(SQLModel, table=True):
    id: str = Field(primary_key=True) # 前端生成的 UUID
    username: str = Field(default="User")
    avatar: Optional[str] = None
    plan: str = Field(default="Free") # Free, Pilot, Maestro
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    conversations: List["Conversation"] = Relationship(back_populates="user")

class Conversation(SQLModel, table=True):
    id: Optional[str] = Field(default=None, primary_key=True)
    title: str
    agent_id: str = Field(default="assistant")
    user_id: str = Field(foreign_key="user.id", index=True) # 关联用户
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    user: Optional[User] = Relationship(back_populates="conversations")
    messages: List["Message"] = Relationship(back_populates="conversation", sa_relationship_kwargs={"cascade": "all, delete"})

class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: str = Field(foreign_key="conversation.id", index=True)
    role: str
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)
    
    conversation: Conversation = Relationship(back_populates="messages")
