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
# 命名约定（评审 M1 漂移对齐）
# ============================================================================
# 必须在**任何表模型定义之前**设置：Field(index=True) 的索引名在类创建时就按
# 此约定解析。模型默认约定是 ix_%(column_0_label)s，而迁移史（005 起）刻意
# 统一为 idx_ 前缀——两套约定并存导致 27 组「同列不同名」索引漂移。这里把
# 约定对齐到 idx_，使模型元数据与迁移库逐名一致（alembic check 归零的前提）。
# 约定块之后的 import 因此不在文件顶部（noqa: E402），属有意为之。
from sqlmodel import SQLModel

SQLModel.metadata.naming_convention = {
    "ix": "idx_%(column_0_label)s",
}

# 时间列说明（2026-09-22 aware 化）：sqlmodel 0.0.45 起普通 `datetime` 注解
# 默认映射 UTCDateTime（= DateTime(timezone=True)，见 sqlmodel/sql/sqltypes.py）；
# 写入统一 utils/time.utc_now()（aware UTC）。**新增时间列禁止用 NaiveDatetime
# 注解**（那会退回 naive 存储）；显式 sa_column/sa_type 声明绕过默认映射，
# 时间列不得绕过注解式声明。

# ============================================================================
# ORM 领域模型（数据库表）
# ============================================================================
from models.domain import (  # noqa: E402
    AgentRun,
    Artifact,
    AuditLog,
    ExecutionPlan,
    Message,
    RunEvent,
    RunStreamFrame,
    ShareToken,
    SkillTemplate,
    SubTask,
    SystemExpert,
    SystemSetting,
    Thread,
    ToolPolicy,
    User,
    UserSettings,
)
from models.enums import (  # noqa: E402
    ConversationType,
    ExecutionMode,
    ExpertType,
    RunEventType,
    RunStatus,
    TaskStatus,
    ThreadStatus,
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
# 注意：这里必须从 schemas 的**子模块**直导，不能用 `from schemas import X`
# （包级导入）。schemas/__init__ 会 re-export stats 等模块，而那些模块又
# `from models.enums import ...`——包级导入在 models 半初始化状态下取不到
# 名字，双向首导都会 ImportError。子模块直导则两个方向都安全。
from schemas.common import LangSmithConfig  # noqa: E402
from schemas.conversation import (  # noqa: E402
    MessageResponse,
    PaginatedThreadListResponse,
    ThreadDetailResponse,
    ThreadListResponse,
)
from schemas.run_event import (  # noqa: E402
    RunEventResponse,
    RunTimelineResponse,
    ThreadTimelineResponse,
)
from schemas.skill_template import (  # noqa: E402
    SkillTemplateCreate,
    SkillTemplateResponse,
    SkillTemplateUpdate,
)
from schemas.task import (  # noqa: E402
    ArtifactCreate,
    ArtifactResponse,
    ExecutionPlanCreate,
    ExecutionPlanResponse,
    ExecutionPlanUpdate,
    SubTaskCreate,
    SubTaskResponse,
    SubTaskUpdate,
)
from schemas.tool_policy import ToolPolicyResponse, ToolPolicyUpdate  # noqa: E402

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
    "RunStreamFrame",
    "ToolPolicy",
    "SkillTemplate",
    "Thread",
    "Message",
    "SystemExpert",
    "SystemSetting",
    "SubTask",
    "ExecutionPlan",
    "Artifact",
    "AuditLog",
    "UserMemory",
    "MCPServer",
    "UserSettings",
    # DTO - Conversation
    "MessageResponse",
    "ThreadListResponse",
    "ThreadDetailResponse",
    "PaginatedThreadListResponse",
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
    "ToolPolicyResponse",
    "ToolPolicyUpdate",
    "SkillTemplateCreate",
    "SkillTemplateUpdate",
    "SkillTemplateResponse",
    "ThreadTimelineResponse",
    # Common
    "LangSmithConfig",
]
