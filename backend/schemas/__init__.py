"""
Pydantic DTO (数据传输对象)

所有 API 请求/响应模型定义在这里，使用 BaseModel，不包含 table=True。

注意：
- 此模块只包含 DTO，不包含 ORM 模型
- ORM 模型定义在 models/domain/ 模块
- 统一导出在 models/__init__.py；本包同样全量 re-export，
  `from schemas import X` 与 `from schemas.<子模块> import X` 皆可。
  models/__init__ 对本包**必须子模块直导**（包级导入在半初始化状态下
  会 ImportError），见 models/__init__ 的说明。
"""

from schemas.common import LangSmithConfig, RevokedResponse
from schemas.conversation import (
    AgentRunSummaryResponse,
    MessageResponse,
    PaginatedThreadListResponse,
    ThreadDetailResponse,
    ThreadListResponse,
)
from schemas.mcp import MCPServerCreate, MCPServerResponse, MCPServerUpdate
from schemas.run_event import (
    RunEventResponse,
    RunPlanResponse,
    RunPlanTask,
    RunStatusResponse,
    RunSummaryResponse,
    RunTimelineResponse,
    ThreadTimelineResponse,
)
from schemas.skill_template import SkillTemplateCreate, SkillTemplateResponse, SkillTemplateUpdate
from schemas.stats import (
    DailyTrend,
    RunListItem,
    RunMetrics,
    RunStatsResponse,
    TokensTodayResponse,
)
from schemas.task import (
    ArtifactCreate,
    ArtifactResponse,
    ArtifactSummaryResponse,
    ExecutionPlanCreate,
    ExecutionPlanResponse,
    ExecutionPlanUpdate,
    PaginatedArtifactListResponse,
    SubTaskCreate,
    SubTaskResponse,
    SubTaskUpdate,
)
from schemas.template_import_export import (
    TemplateConflictInfo,
    TemplateExportData,
    TemplateExportMeta,
    TemplateExportSchema,
    TemplateImportPreviewRequest,
    TemplateImportPreviewResponse,
    TemplateImportRequest,
    TemplateImportResponse,
    XpouchTemplateHeader,
)
from schemas.tool_policy import ToolPolicyResponse, ToolPolicyUpdate
from schemas.user_profile import UserProfileResponse

__all__ = [
    # Common
    "LangSmithConfig",
    "RevokedResponse",
    # Conversation
    "MessageResponse",
    "AgentRunSummaryResponse",
    "ThreadListResponse",
    "ThreadDetailResponse",
    "PaginatedThreadListResponse",
    # MCP
    "MCPServerCreate",
    "MCPServerUpdate",
    "MCPServerResponse",
    # Run Event
    "RunEventResponse",
    "RunSummaryResponse",
    "RunTimelineResponse",
    "ThreadTimelineResponse",
    "RunStatusResponse",
    "RunPlanTask",
    "RunPlanResponse",
    # Skill Template
    "SkillTemplateCreate",
    "SkillTemplateUpdate",
    "SkillTemplateResponse",
    # Template Import/Export
    "XpouchTemplateHeader",
    "TemplateExportMeta",
    "TemplateExportData",
    "TemplateExportSchema",
    "TemplateImportPreviewRequest",
    "TemplateConflictInfo",
    "TemplateImportPreviewResponse",
    "TemplateImportRequest",
    "TemplateImportResponse",
    # Stats
    "RunMetrics",
    "DailyTrend",
    "RunListItem",
    "RunStatsResponse",
    "TokensTodayResponse",
    # Task
    "SubTaskCreate",
    "SubTaskUpdate",
    "SubTaskResponse",
    "ArtifactCreate",
    "ArtifactResponse",
    "ArtifactSummaryResponse",
    "PaginatedArtifactListResponse",
    "ExecutionPlanCreate",
    "ExecutionPlanUpdate",
    "ExecutionPlanResponse",
    # Tool Policy
    "ToolPolicyUpdate",
    "ToolPolicyResponse",
    # User Profile
    "UserProfileResponse",
]
