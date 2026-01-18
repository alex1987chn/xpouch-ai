from typing import List, Optional, Literal
from datetime import datetime
from uuid import uuid4
from sqlmodel import Field, SQLModel, Relationship, JSON
from pydantic import BaseModel


# ============================================================================
# 现有模型：用户、会话、消息
# ============================================================================

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


# ============================================================================
# 新增模型：超智能体基础设施
# ============================================================================

# 专家类型枚举
ExpertType = Literal["search", "coder", "researcher", "analyzer", "writer", "planner"]

# 子任务状态枚举
TaskStatus = Literal["pending", "running", "completed", "failed"]


class SubTask(SQLModel, table=True):
    """
    子任务模型 - 由"指挥官"分发给专家的具体任务
    """
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    
    # 专家类型：指定由哪个专家执行
    expert_type: ExpertType = Field(index=True)
    
    # 任务描述：自然语言描述的任务内容
    description: str = Field(index=True)
    
    # 输入数据：JSON 格式的任务参数
    input_data: Optional[dict] = Field(default=None, sa_type=JSON)
    
    # 任务状态
    status: TaskStatus = Field(default="pending", index=True)
    
    # 输出结果：JSON 格式的执行结果
    output_result: Optional[dict] = Field(default=None, sa_type=JSON)
    
    # 时间戳
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # 关联的会话
    task_session_id: Optional[str] = Field(foreign_key="tasksession.session_id", index=True)
    task_session: Optional["TaskSession"] = Relationship(back_populates="sub_tasks")


class TaskSession(SQLModel, table=True):
    """
    任务会话模型 - 记录一次完整的多专家协作过程
    """
    session_id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    
    # 用户查询：原始用户输入
    user_query: str = Field(index=True)
    
    # 关联的子任务列表
    sub_tasks: List[SubTask] = Relationship(back_populates="task_session", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    
    # 最终响应：整合所有子任务结果的最终答案
    final_response: Optional[str] = Field(default=None)
    
    # 会话状态
    status: TaskStatus = Field(default="pending", index=True)
    
    # 时间戳
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None


# ============================================================================
# Pydantic DTO (数据传输对象) - 用于 API 请求/响应
# ============================================================================

class SubTaskCreate(BaseModel):
    """创建子任务的 DTO"""
    expert_type: ExpertType
    description: str
    input_data: Optional[dict] = None


class SubTaskUpdate(BaseModel):
    """更新子任务的 DTO"""
    status: Optional[TaskStatus] = None
    output_result: Optional[dict] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class TaskSessionCreate(BaseModel):
    """创建任务会话的 DTO"""
    user_query: str


class TaskSessionResponse(BaseModel):
    """任务会话响应 DTO"""
    session_id: str
    user_query: str
    sub_tasks: List[SubTask]
    final_response: Optional[str]
    status: TaskStatus
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


# ============================================================================
# LangSmith 追踪配置
# ============================================================================

class LangSmithConfig(BaseModel):
    """LangSmith 追踪配置"""
    enabled: bool = False
    api_key: Optional[str] = None
    project_name: str = "xpouch-ai"
    tracing_v2: bool = False
    
    @classmethod
    def from_env(cls) -> "LangSmithConfig":
        """从环境变量加载配置"""
        from .config import get_langsmith_config
        return get_langsmith_config()
