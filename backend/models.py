import os
from typing import List, Optional
from datetime import datetime
from uuid import uuid4
from sqlmodel import Field, SQLModel, Relationship, JSON, Session, select, Column
from sqlalchemy import String, Index
from pydantic import BaseModel, Field as PydanticField
from enum import Enum


# ============================================================================
# 枚举类型
# ============================================================================

class UserRole(str, Enum):
    """用户角色枚举"""
    USER = "user"              # 普通用户
    ADMIN = "admin"            # 完全管理员
    VIEW_ADMIN = "view_admin"    # 查看管理员（只读专家配置）
    EDIT_ADMIN = "edit_admin"    # 编辑管理员（可修改专家配置）


class ConversationType(str, Enum):
    """会话类型枚举"""
    DEFAULT = "default"      # 默认助手（简单模式）
    CUSTOM = "custom"        # 自定义智能体（简单模式）
    AI = "ai"               # AI助手（复杂模式）


# ============================================================================
# 现有模型：用户、会话、消息
# ============================================================================


# ============================================================================
# 新增模型：系统专家管理表
# ============================================================================

class SystemExpert(SQLModel, table=True):
    """
    系统专家表：存储 LangGraph 专家的 Prompt 和配置

    管理员可以通过前端动态修改专家的 system_prompt，
    LangGraph 执行任务时从数据库读取最新配置。
    """
    id: int = Field(default=None, primary_key=True)
    expert_key: str = Field(
        unique=True,
        index=True,
        description="专家类型标识（对应 ExpertType 枚举，如 'coder', 'search'）"
    )
    name: str = Field(description="专家显示名称")
    description: Optional[str] = Field(
        default=None,
        description="专家能力描述，用于 Planner 决定任务分配"
    )
    system_prompt: str = Field(
        description="专家系统提示词（核心字段，管理员可修改）"
    )
    model: str = Field(default_factory=lambda: os.getenv("MODEL_NAME", "deepseek-chat"), description="使用的模型")
    temperature: float = Field(default=0.5, description="温度参数（0.0-2.0）")
    is_dynamic: bool = Field(default=True, description="是否为动态专家，false=系统内置，true=用户创建")
    updated_at: datetime = Field(default_factory=datetime.now, description="最后更新时间")


class User(SQLModel, table=True):
    id: str = Field(primary_key=True) # 前端生成的 UUID
    username: str = Field(default="User")
    avatar: Optional[str] = None
    plan: str = Field(default="Free") # Free, Pilot, Maestro
    role: UserRole = Field(
        default=UserRole.USER,
        sa_column=Column(String(10))  # 使用 String 类型映射，保持数据库列为 VARCHAR
    )
    phone_number: Optional[str] = Field(default=None, unique=True, index=True)
    email: Optional[str] = Field(default=None, unique=True, index=True)
    password_hash: Optional[str] = Field(default=None)
    verification_code: Optional[str] = Field(default=None)
    verification_code_expires_at: Optional[datetime] = Field(default=None)
    auth_provider: Optional[str] = Field(default=None)  # 'phone', 'email', 'github', 'google', 'wechat'
    provider_id: Optional[str] = Field(default=None, index=True)
    access_token: Optional[str] = Field(default=None)
    refresh_token: Optional[str] = Field(default=None)
    token_expires_at: Optional[datetime] = Field(default=None)
    is_verified: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    threads: List["Thread"] = Relationship(back_populates="user")
    custom_agents: List["CustomAgent"] = Relationship(back_populates="user")

class Thread(SQLModel, table=True):
    """
    会话模型

    - 简单模式（DEFAULT, CUSTOM）：仅存储消息
    - 复杂模式（AI）：额外关联TaskSession，存储专家执行记录
    """
    __tablename__ = 'thread'  # 👈 显式指定表名为 thread（单数形式，符合数据库实际命名）

    id: Optional[str] = Field(default=None, primary_key=True)
    title: str

    # 会话类型：明确区分三种模式
    agent_type: str = Field(index=True, default=ConversationType.DEFAULT.value)

    # 智能体ID
    # - agent_type='default' 时，存储默认助手的UUID
    # - agent_type='custom' 时，存储自定义智能体的UUID
    # - agent_type='ai' 时，存储固定的'ai-assistant'标识
    agent_id: str = Field(index=True, default='sys-default-chat')

    # 用户ID
    user_id: str = Field(foreign_key="user.id", index=True)

    # 关联的任务会话（仅复杂模式有值）
    task_session_id: Optional[str] = Field(default=None, index=True)

    # 新增：线程状态（记录线程的执行状态）
    # - idle: 空闲/完成状态
    # - running: 正在运行
    # - paused: 暂停
    status: str = Field(default="idle", index=True)

    # 新增：线程模式（记录路由模式）
    # - simple: 普通对话模式（不自动展开面板）
    # - complex: 复杂协作模式（自动展开面板）
    thread_mode: str = Field(default="simple", index=True)

    # 时间戳
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    # 关联关系
    user: Optional[User] = Relationship(back_populates="threads")
    messages: List["Message"] = Relationship(back_populates="thread", sa_relationship_kwargs={"cascade": "all, delete"})
    task_session: Optional["TaskSession"] = Relationship(
        back_populates="thread",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    thread_id: str = Field(foreign_key="thread.id", index=True)
    role: str
    content: str
    timestamp: datetime = Field(default_factory=datetime.now)
    # 👈 新增：extra_data 字段存储 thinking、reasoning 等额外信息（metadata 是 SQLAlchemy 保留字）
    extra_data: Optional[dict] = Field(default=None, sa_column=Column(JSON))

    thread: Thread = Relationship(back_populates="messages")

    # 🔥 复合索引：优化消息查询
    # 场景：加载对话历史时，查询 WHERE thread_id = ? ORDER BY timestamp DESC
    __table_args__ = (
        Index("idx_message_thread_timestamp", "thread_id", "timestamp"),
    )


# ============================================================================
# Pydantic 响应模型（用于API响应序列化）
# ============================================================================

class MessageResponse(BaseModel):
    """消息响应模型"""
    id: Optional[int] = None
    role: str
    content: str
    timestamp: Optional[datetime] = None
    extra_data: Optional[dict] = None  # 👈 新增：extra_data 字段（原 metadata，避免保留字冲突）

    class Config:
        from_attributes = True


class ThreadResponse(BaseModel):
    """会话响应模型（用于列表）"""
    id: Optional[str] = None
    title: str
    agent_type: str
    agent_id: str
    user_id: str
    task_session_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    messages: List[MessageResponse] = []

    class Config:
        from_attributes = True


# ============================================================================
# 新增模型：用户自定义智能体（简单对话模式）
# ============================================================================

class CustomAgent(SQLModel, table=True):
    """
    用户智能体（包括默认助手和自定义智能体）
    
    用于简单的对话场景，直接使用用户的 system_prompt 调用 LLM，
    不经过 LangGraph 的专家工作流。
    """
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    
    # 关联用户
    user_id: str = Field(foreign_key="user.id", index=True)
    
    # 基本信息
    name: str = Field(index=True)  # 智能体名称
    description: Optional[str] = None  # 描述
    
    # 核心配置
    system_prompt: str  # 用户自定义的系统提示词（关键！）
    model_id: str = Field(default="deepseek-chat")  # 使用的模型
    
    # 新增：是否为默认助手
    is_default: bool = Field(default=False, index=True)
    
    # 分类和统计
    category: str = Field(default="综合")  # 分类（写作、编程、创意等）
    is_public: bool = Field(default=False)  # 是否公开（未来扩展）
    conversation_count: int = Field(default=0)  # 使用次数
    
    # 时间戳
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    # 关联
    user: Optional[User] = Relationship(back_populates="custom_agents")


# 在 User 模型中添加关联
# 需要在第 21 行后添加：
# custom_agents: List["CustomAgent"] = Relationship(back_populates="user")


# ============================================================================
# Pydantic DTO - 自定义智能体 API
# ============================================================================

class CustomAgentCreate(BaseModel):
    """创建自定义智能体的 DTO"""
    name: str
    description: Optional[str] = None
    system_prompt: str = PydanticField(alias="systemPrompt")  # 必填，前端字段为 systemPrompt
    category: str = "综合"
    model_id: str = PydanticField(default="deepseek-chat", alias="modelId")


class CustomAgentUpdate(BaseModel):
    """更新自定义智能体的 DTO"""
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = PydanticField(default=None, alias="systemPrompt")
    category: Optional[str] = None
    model_id: Optional[str] = PydanticField(default=None, alias="modelId")


class CustomAgentResponse(BaseModel):
    """自定义智能体响应 DTO"""
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    system_prompt: str
    model_id: str
    is_default: bool
    category: str
    is_public: bool
    conversation_count: int
    created_at: datetime
    updated_at: datetime


# ============================================================================
# 新增模型：超智能体基础设施
# ============================================================================

class ExpertType(str, Enum):
    """专家类型枚举"""
    SEARCH = "search"
    CODER = "coder"
    RESEARCHER = "researcher"
    ANALYZER = "analyzer"
    WRITER = "writer"
    PLANNER = "planner"
    IMAGE_ANALYZER = "image_analyzer"


class TaskStatus(str, Enum):
    """子任务状态枚举"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ExecutionMode(str, Enum):
    """任务执行模式"""
    SEQUENTIAL = "sequential"  # 串行执行
    PARALLEL = "parallel"      # 并行执行


class SubTask(SQLModel, table=True):
    """
    子任务模型 - 专家执行的具体任务
    
    每个专家任务产生一个或多个交付物（Artifacts）
    支持串行和并行执行模式
    """
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)

    # 关联的任务会话
    task_session_id: str = Field(foreign_key="tasksession.session_id", index=True)

    # 排序顺序：用于前端展示和串行执行顺序
    sort_order: int = Field(default=0, index=True)

    # 专家类型：指定由哪个专家执行
    expert_type: str = Field(index=True)  # 存储 ExpertType 枚举值

    # 任务描述：自然语言描述的任务内容
    task_description: str = Field(index=True)

    # 输入数据：JSON 格式的任务参数
    input_data: Optional[dict] = Field(default=None, sa_type=JSON)

    # 任务状态
    status: str = Field(default="pending", index=True)  # 存储 TaskStatus 枚举值

    # 执行模式：串行或并行
    execution_mode: str = Field(default="sequential")  # sequential | parallel

    # 依赖任务：并行模式下可能依赖其他任务（可选）
    depends_on: Optional[List[str]] = Field(default=None, sa_type=JSON)

    # 输出结果：JSON 格式的执行结果
    output_result: Optional[dict] = Field(default=None, sa_type=JSON)

    # 错误信息
    error_message: Optional[str] = None

    # 执行耗时（毫秒）
    duration_ms: Optional[int] = None

    # 时间戳
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # 关联关系
    task_session: Optional["TaskSession"] = Relationship(back_populates="sub_tasks")
    
    # 关联的 Artifacts（多产物支持）
    artifacts: List["Artifact"] = Relationship(
        back_populates="sub_task",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

    # 🔥 复合索引：优化高频查询场景
    # 场景：每次加载会话时，查询 WHERE task_session_id = ? AND status = ?
    __table_args__ = (
        Index("idx_subtask_session_status", "task_session_id", "status"),
    )


class TaskSession(SQLModel, table=True):
    """
    任务会话模型 - 记录一次完整的多专家协作过程（仅复杂模式）
    """
    session_id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)

    # 关联的会话ID（核心！用于从历史记录加载）
    thread_id: str = Field(foreign_key="thread.id", index=True)

    # 用户查询：原始用户输入
    user_query: str = Field(index=True)

    # 规划摘要：Commander 生成的策略概述
    plan_summary: Optional[str] = Field(default=None)

    # 预计步骤数
    estimated_steps: int = Field(default=0)

    # 执行模式：串行或并行
    execution_mode: str = Field(default="sequential")  # sequential | parallel

    # 关联的子任务列表
    sub_tasks: List[SubTask] = Relationship(
        back_populates="task_session",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "SubTask.sort_order"}
    )

    # 最终响应：整合所有子任务结果的最终答案
    final_response: Optional[str] = Field(default=None)

    # 会话状态：pending | running | completed | failed
    status: str = Field(default="pending", index=True)

    # 时间戳
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None

    # 关联关系
    thread: Optional[Thread] = Relationship(back_populates="task_session")


# ============================================================================
# Pydantic DTO (数据传输对象) - 用于 API 请求/响应
# ============================================================================

class Artifact(SQLModel, table=True):
    """
    产物模型 - 支持一个专家生成多个产物
    """
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    
    # 关联的子任务
    sub_task_id: str = Field(foreign_key="subtask.id", index=True)
    
    # 产物类型：code | html | markdown | json | text
    type: str = Field(index=True)
    
    # 产物标题
    title: Optional[str] = None
    
    # 产物内容
    content: str
    
    # 代码语言（如果是代码类型）
    language: Optional[str] = None
    
    # 排序顺序（同一专家的多产物排序）
    sort_order: int = Field(default=0)
    
    # 时间戳
    created_at: datetime = Field(default_factory=datetime.now)
    
    # 关联关系
    sub_task: Optional[SubTask] = Relationship(back_populates="artifacts")


class SubTaskCreate(BaseModel):
    """创建子任务的 DTO"""
    expert_type: str  # ExpertType 枚举值
    task_description: str
    input_data: Optional[dict] = None
    sort_order: int = 0
    execution_mode: str = "sequential"
    depends_on: Optional[List[str]] = None


class SubTaskUpdate(BaseModel):
    """更新子任务的 DTO"""
    status: Optional[str] = None  # TaskStatus 枚举值
    output_result: Optional[dict] = None
    error_message: Optional[str] = None
    duration_ms: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class ArtifactCreate(BaseModel):
    """创建产物的 DTO"""
    type: str
    title: Optional[str] = None
    content: str
    language: Optional[str] = None
    sort_order: int = 0


class ArtifactResponse(BaseModel):
    """产物响应 DTO"""
    id: str
    type: str
    title: Optional[str]
    content: str
    language: Optional[str]
    sort_order: int
    created_at: datetime


class SubTaskResponse(BaseModel):
    """子任务响应 DTO（包含产物列表）"""
    id: str
    expert_type: str
    task_description: str
    status: str
    sort_order: int
    execution_mode: str
    depends_on: Optional[List[str]]
    output_result: Optional[dict]
    error_message: Optional[str]
    duration_ms: Optional[int]
    artifacts: List[ArtifactResponse]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime


class TaskSessionCreate(BaseModel):
    """创建任务会话的 DTO"""
    user_query: str
    plan_summary: Optional[str] = None
    estimated_steps: int = 0
    execution_mode: str = "sequential"


class TaskSessionUpdate(BaseModel):
    """更新任务会话的 DTO"""
    status: Optional[str] = None
    final_response: Optional[str] = None
    completed_at: Optional[datetime] = None


class TaskSessionResponse(BaseModel):
    """任务会话响应 DTO"""
    session_id: str
    thread_id: str
    user_query: str
    plan_summary: Optional[str]
    estimated_steps: int
    execution_mode: str
    sub_tasks: List[SubTaskResponse]
    final_response: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]


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
