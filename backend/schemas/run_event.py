"""
RunEvent 相关的 Pydantic DTO

取值约定：event_type / status 用枚举而非裸 str——它们经 openapi 生成前端
联合类型（run.ts 的 RunEventType / RunStatus re-export 自 enums.generated），
裸 str 会让契约退化成 string、失去编译期防漂移能力（SameShape 锚点会红）。
mode 例外：可空 str（路由决策前为 NULL，simple/complex 由决策写入）。
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from models.enums import RunEventType, RunStatus


class RunEventResponse(BaseModel):
    """运行事件响应"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    run_id: str
    event_type: RunEventType
    created_at: datetime
    event_data: dict[str, Any] | None = None
    thread_id: str | None = None
    execution_plan_id: str | None = None
    task_id: str | None = None
    note: str | None = None


class RunSummaryResponse(BaseModel):
    """运行实例摘要响应"""

    model_config = ConfigDict(from_attributes=True)

    id: str
    thread_id: str
    user_id: str
    entrypoint: str
    # 可空：run 出生时路由决策尚未发生（此前占位值 "router" 被契约拒收炸列表）
    mode: str | None
    status: RunStatus
    current_node: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    updated_at: datetime
    last_heartbeat_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
    timed_out_at: datetime | None = None
    deadline_at: datetime | None = None


class RunTimelineResponse(BaseModel):
    """运行时间线响应"""

    run_id: str
    events: list[RunEventResponse]
    total: int


class ThreadTimelineResponse(BaseModel):
    """线程时间线响应（包含所有运行的事件）"""

    thread_id: str
    events: list[RunEventResponse]
    total: int


class RunStatusResponse(BaseModel):
    """运行状态响应（轻量级，专供轮询使用）"""

    id: str
    status: RunStatus
    current_node: str | None = None
    completed_at: datetime | None = None


class RunPlanTask(BaseModel):
    """计划修订轮询用：单个任务快照"""

    id: str
    expert_type: str
    description: str
    sort_order: int
    depends_on: list[str] = []


class RunPlanResponse(BaseModel):
    """计划状态响应（HITL 修订轮询专供）

    revising 判定来自事件账本：最新修订事件为 started 即修订中；
    revision_error 只在最新事件为 revision_failed 时非空。
    """

    run_id: str
    plan_id: str | None = None
    plan_version: int
    status: str  # TaskStatus 枚举值
    revising: bool
    revision_error: str | None = None
    tasks: list[RunPlanTask] = []
