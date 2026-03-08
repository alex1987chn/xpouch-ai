"""
Pydantic DTO (数据传输对象)

所有 API 请求/响应模型定义在这里，使用 BaseModel，不包含 table=True。

注意：
- 此模块只包含 DTO，不包含 ORM 模型
- ORM 模型定义在 models/domain/ 模块
- 统一导出在 models/__init__.py
"""

from schemas.common import LangSmithConfig
from schemas.conversation import (
    MessageResponse,
    PaginatedThreadListResponse,
    ThreadDetailResponse,
    ThreadListResponse,
)
from schemas.custom_agent import (
    CustomAgentCreate,
    CustomAgentResponse,
    CustomAgentUpdate,
)
from schemas.run_event import RunEventResponse, RunTimelineResponse, ThreadTimelineResponse
from schemas.task import (
    ArtifactCreate,
    ArtifactResponse,
    ExecutionPlanCreate,
    ExecutionPlanResponse,
    ExecutionPlanUpdate,
    SubTaskCreate,
    SubTaskResponse,
    SubTaskUpdate,
)

__all__ = [
    # Common
    "LangSmithConfig",
    # Conversation
    "MessageResponse",
    "ThreadListResponse",
    "ThreadDetailResponse",
    "PaginatedThreadListResponse",
    # Custom Agent
    "CustomAgentCreate",
    "CustomAgentUpdate",
    "CustomAgentResponse",
    # Task
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
]
