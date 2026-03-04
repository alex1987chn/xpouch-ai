"""
任务相关 DTO
"""

from datetime import datetime

from pydantic import BaseModel


class SubTaskCreate(BaseModel):
    """创建子任务的 DTO"""

    expert_type: str  # ExpertType 枚举值
    task_description: str
    input_data: dict | None = None
    sort_order: int = 0
    execution_mode: str = "sequential"
    depends_on: list[str] | None = None
    task_id: str | None = None  # Commander 生成的 task ID（如 task_1）


class SubTaskUpdate(BaseModel):
    """更新子任务的 DTO"""

    status: str | None = None  # TaskStatus 枚举值
    output_result: dict | None = None
    error_message: str | None = None
    duration_ms: int | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class ArtifactCreate(BaseModel):
    """创建产物的 DTO"""

    id: str | None = None  # 可选：指定 artifact ID（用于前端编辑）
    type: str
    title: str | None = None
    content: str
    language: str | None = None
    sort_order: int = 0


class ArtifactResponse(BaseModel):
    """产物响应 DTO"""

    id: str
    type: str
    title: str | None
    content: str
    language: str | None
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
    depends_on: list[str] | None
    output_result: dict | None
    error_message: str | None
    duration_ms: int | None
    artifacts: list[ArtifactResponse]
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime


class TaskSessionCreate(BaseModel):
    """创建任务会话的 DTO"""

    user_query: str
    plan_summary: str | None = None
    estimated_steps: int = 0
    execution_mode: str = "sequential"


class TaskSessionUpdate(BaseModel):
    """更新任务会话的 DTO"""

    status: str | None = None
    final_response: str | None = None
    completed_at: datetime | None = None


class TaskSessionResponse(BaseModel):
    """任务会话响应 DTO"""

    session_id: str
    thread_id: str
    user_query: str
    plan_summary: str | None
    estimated_steps: int
    execution_mode: str
    sub_tasks: list[SubTaskResponse]
    final_response: str | None
    status: str
    plan_version: int
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
