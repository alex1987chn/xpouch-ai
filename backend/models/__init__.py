"""
模型模块统一导出

分层结构：
- models/domain/: ORM 表模型（SQLModel, table=True）
- models/enums.py: 枚举定义
- schemas/: Pydantic DTO（BaseModel，API 请求/响应）

迁移说明：
- 从单一文件拆分为按领域组织的模块
- 保持向后兼容：所有导出保持不变
- 新增 models/domain/ 和 schemas/ 子模块

注意：
- 此文件只负责统一导出，不定义模型
- 具体模型定义在 domain/ 和 schemas/ 中
"""

# ============================================================================
# 枚举类型（集中定义，供全项目使用）
# ============================================================================
# ============================================================================
# ORM 领域模型（数据库表）
# ============================================================================
from models.domain import (
    AgentRun,
    Artifact,
    CustomAgent,
    ExecutionPlan,
    Message,
    RunEvent,
    SubTask,
    SystemExpert,
    Thread,
    User,
)
from models.enums import (
    ConversationType,
    ExecutionMode,
    ExpertType,
    RunEventType,
    RunStatus,
    TaskStatus,
    UserRole,
    _enum_values,
)

# ============================================================================
# 其他独立模型（保持原有位置）
# ============================================================================
# 这些模型已在独立文件中，直接导入
from models.mcp import MCPServer  # noqa: E402
from models.memory import UserMemory  # noqa: E402

# ============================================================================
# Pydantic DTO（API 请求/响应）
# ============================================================================
from schemas import (
    # Task
    ArtifactCreate,
    ArtifactResponse,
    # Custom Agent
    CustomAgentCreate,
    CustomAgentResponse,
    CustomAgentUpdate,
    ExecutionPlanCreate,
    ExecutionPlanResponse,
    ExecutionPlanUpdate,
    # Common
    LangSmithConfig,
    # Conversation
    MessageResponse,
    PaginatedThreadListResponse,
    # Run Event
    RunEventResponse,
    RunTimelineResponse,
    SubTaskCreate,
    SubTaskResponse,
    SubTaskUpdate,
    ThreadDetailResponse,
    ThreadListResponse,
    ThreadTimelineResponse,
)

# ============================================================================
# 统一导出列表
# ============================================================================
__all__ = [
    # 枚举
    "UserRole",
    "ConversationType",
    "ExpertType",
    "TaskStatus",
    "RunStatus",
    "RunEventType",
    "ExecutionMode",
    "_enum_values",
    # ORM 模型
    "User",
    "AgentRun",
    "RunEvent",
    "Thread",
    "Message",
    "SystemExpert",
    "CustomAgent",
    "SubTask",
    "ExecutionPlan",
    "Artifact",
    "UserMemory",
    "MCPServer",
    # DTO - Conversation
    "MessageResponse",
    "ThreadListResponse",
    "ThreadDetailResponse",
    "PaginatedThreadListResponse",
    # DTO - Custom Agent
    "CustomAgentCreate",
    "CustomAgentUpdate",
    "CustomAgentResponse",
    # DTO - Task
    "SubTaskCreate",
    "SubTaskUpdate",
    "SubTaskResponse",
    "ArtifactCreate",
    "ArtifactResponse",
    "ExecutionPlanCreate",
    "ExecutionPlanUpdate",
    "ExecutionPlanResponse",
    # Run Event
    "RunEventResponse",
    "RunTimelineResponse",
    "ThreadTimelineResponse",
    # Common
    "LangSmithConfig",
]
