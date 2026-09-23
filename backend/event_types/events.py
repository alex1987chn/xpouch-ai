"""
SSE 事件类型定义
统一前后端事件协议
"""

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field

from models.enums import TaskStatus
from utils.time import utc_now


class EventType(StrEnum):
    """SSE 事件类型枚举"""

    # 规划阶段
    PLAN_CREATED = "plan.created"  # Planner 生成计划
    PLAN_STARTED = "plan.started"  # 🔥 新增：规划开始（设置标题）
    PLAN_THINKING = "plan.thinking"  # 🔥 新增：规划思考流式内容

    # 任务执行阶段
    TASK_STARTED = "task.started"  # 专家开始执行
    TASK_PROGRESS = "task.progress"  # 专家执行进度（可选）
    TASK_COMPLETED = "task.completed"  # 专家完成
    TASK_FAILED = "task.failed"  # 专家失败

    # 工具调用（任务执行期间的可见性：模型在调什么工具、多久、成败）
    TOOL_CALLING = "tool.calling"  # 单个 tool_call 开始（attempt 标注重试轮次）
    TOOL_RESULT = "tool.result"  # 单个 tool_call 结束（含耗时与成败）

    # 产物阶段
    ARTIFACT_GENERATED = "artifact.generated"  # 产物生成

    # 消息阶段
    MESSAGE_DELTA = "message.delta"  # 最终回复流式块
    MESSAGE_THINKING = "message.thinking"  # 模型思考过程流式块（reasoning_content）
    MESSAGE_DONE = "message.done"  # 最终回复完成

    # 🔥🔥🔥 v3.1.0 HITL: 人类审核中断事件
    HUMAN_INTERRUPT = "human.interrupt"  # 中断等待用户确认

    # 系统事件
    ROUTER_START = "router.start"  # 路由开始（意图分析）
    ROUTER_DECISION = "router.decision"  # 路由决策
    ERROR = "error"  # 全局错误


# ============================================================================
# 基础事件结构
# ============================================================================


class SSEEvent(BaseModel):
    """SSE 事件基础结构"""

    id: str = Field(description="事件唯一ID（用于去重和排序）")
    timestamp: str = Field(description="ISO 8601 格式时间戳")
    type: EventType = Field(description="事件类型")
    data: dict[str, Any] = Field(description="事件数据")


# ============================================================================
# 规划阶段事件
# ============================================================================


class TaskInfo(BaseModel):
    """任务信息"""

    id: str
    expert_type: str
    description: str
    sort_order: int
    status: TaskStatus
    # 2026-09-13：此前**没有这个字段**，而前端类型里一直声明着它 → plan.created
    # 从不发送依赖关系（前端读到 undefined）。是「前端手写类型 vs 后端模型」的
    # 一致性断言（frontend/src/types/events.ts）把它照出来的。
    depends_on: list[str] = []


class PlanCreatedData(BaseModel):
    """plan.created 事件数据"""

    execution_plan_id: str
    summary: str
    estimated_steps: int
    execution_mode: Literal["sequential", "parallel"]  # 见 models.enums.ExecutionMode
    tasks: list[TaskInfo]
    # 思考载体消息的库内 id：前端把本地占位消息改写成它，此后实时流与
    # 刷新回放共用同一条消息（顺序=插入顺序=因果顺序）。None=未落库兜底
    message_id: int | None = None


# 🔥 新增：Commander 流式思考事件数据模型


class PlanStartedData(BaseModel):
    """plan.started 事件数据 - 通知前端开始规划"""

    execution_plan_id: str
    title: str
    content: str
    status: Literal["running"]


class PlanThinkingData(BaseModel):
    """plan.thinking 事件数据 - 流式思考内容增量"""

    execution_plan_id: str
    delta: str  # 思考内容的增量


# ============================================================================
# 任务执行阶段事件
# ============================================================================


class TaskStartedData(BaseModel):
    """task.started 事件数据"""

    task_id: str
    expert_type: str
    description: str
    started_at: str
    # 专家执行消息（消息表=执行状态真相源）：前端据此外加/定位助手消息
    message_id: int | None = None
    sort_order: int | None = None
    total_steps: int | None = None


class TaskProgressData(BaseModel):
    """task.progress 事件数据（可选）"""

    task_id: str
    expert_type: str
    progress: float  # 0.0 - 1.0
    message: str | None = None  # 进度消息，如"正在搜索..."


class TaskCompletedData(BaseModel):
    """task.completed 事件数据"""

    task_id: str
    expert_type: str
    description: str
    status: Literal["completed"]
    output: str | None = None
    duration_ms: int
    completed_at: str
    artifact_count: int  # 产物数量（发射器一定传）
    # 专家执行消息的终态载荷：前端用它覆盖同 id 消息（与库一致）
    message_id: int | None = None
    artifact_ids: list[str] = []
    tool_stats: dict[str, int] | None = None  # {"count","total_ms","failed"}
    # 逐次工具调用明细（完成时刻快照，真相源=账本；None=未聚合/无调用）
    tool_calls: list[dict[str, Any]] | None = None
    # 产出标题（与 artifact.title / 消息 summary 同源）——前端实时覆盖时
    # 用它做横条标题，不得用 output 首行原文（可能是过渡句/长句）
    summary: str | None = None


class TaskFailedData(BaseModel):
    """task.failed 事件数据"""

    task_id: str
    expert_type: str
    description: str
    error: str
    failed_at: str
    message_id: int | None = None


# ============================================================================
# 工具调用事件（任务执行期间）
# ============================================================================


class ToolCallingData(BaseModel):
    """tool.calling 事件数据（单个 tool_call 开始）"""

    task_id: str
    expert_type: str
    tool: str
    source: Literal["builtin", "mcp"]
    args_summary: str  # 参数摘要（截断），执行可见性用
    attempt: int  # 第几次尝试（1=首次；重试可见性）


class ToolResultData(BaseModel):
    """tool.result 事件数据（单个 tool_call 结束）"""

    task_id: str
    expert_type: str
    tool: str
    source: Literal["builtin", "mcp"]
    success: bool
    duration_ms: int
    error: str | None = None  # 失败时的用户友好错误（成功为 None）


# ============================================================================
# 产物阶段事件
# ============================================================================


class ArtifactInfo(BaseModel):
    """产物信息"""

    id: str
    type: str  # code | html | markdown | json | text
    title: str | None = None
    content: str
    language: str | None = None
    sort_order: int


class ArtifactGeneratedData(BaseModel):
    """artifact.generated 事件数据"""

    task_id: str
    expert_type: str
    artifact: ArtifactInfo


class ThinkingData(BaseModel):
    """message.done 里附带的思考过程数据（与前端 ThinkingData 同一形状）。

    `steps` 有意保持宽松（dict）：步骤的结构由前端定义（thinking 面板的渲染模型），
    后端只透传。
    """

    text: str | None = None
    steps: list[dict[str, Any]] | None = None


# ============================================================================
# 消息阶段事件
# ============================================================================


class MessageDeltaData(BaseModel):
    """message.delta 事件数据"""

    message_id: str
    content: str  # 增量内容
    is_final: bool = False


class MessageThinkingData(BaseModel):
    """message.thinking 事件数据（模型思考过程增量，如 DeepSeek reasoning_content）"""

    message_id: str
    content: str  # 思考增量内容


class MessageDoneData(BaseModel):
    """message.done 事件数据"""

    message_id: str
    full_content: str
    total_tokens: int | None = None
    thinking: ThinkingData | None = None  # 思考过程数据（前端 = 手写类型的同一形状）


# ============================================================================
# 系统事件
# ============================================================================


class RouterStartData(BaseModel):
    """router.start 事件数据"""

    query: str  # 用户查询内容
    timestamp: str


class RouterDecisionData(BaseModel):
    """router.decision 事件数据"""

    decision: Literal["simple", "complex"]
    reason: str | None = None


class ErrorData(BaseModel):
    """error 事件数据"""

    code: str
    message: str
    details: dict[str, Any] | None = None


class PlanTaskPayload(BaseModel):
    """human.interrupt 的 current_plan 条目（审批卡直接渲染它）。

    与 `TaskInfo`（plan.created 的任务）字段基本一致，但 `id` 用**子任务 UUID**
    且不从属于落库 DTO —— 所以单独一个模型，避免两处语义被一个模型糊在一起。
    """

    id: str
    expert_type: str
    description: str
    sort_order: int
    status: TaskStatus
    depends_on: list[str] = []


# ============================================================================
# 🔥🔥🔥 v3.1.0 HITL: 人类审核中断事件
# ============================================================================


class HumanInterruptData(BaseModel):
    """human.interrupt 事件数据 - HITL 中断等待用户确认"""

    type: Literal["plan_review"]  # 中断类型，目前仅支持 plan_review
    run_id: str | None = None
    execution_plan_id: str | None = None
    current_plan: list[PlanTaskPayload]  # 当前计划任务列表
    plan_version: int  # 计划版本号（乐观锁）


# ============================================================================
# 事件构建工具函数
# ============================================================================


def build_sse_event(
    event_type: EventType, data: BaseModel, event_id: str | None = None
) -> SSEEvent:
    """
    构建标准化 SSE 事件

    Args:
        event_type: 事件类型
        data: 事件数据（Pydantic 模型）
        event_id: 事件ID（可选，自动生成）

    Returns:
        SSEEvent 对象
    """
    import uuid

    return SSEEvent(
        id=event_id or str(uuid.uuid4()),
        timestamp=utc_now().isoformat(),
        type=event_type,
        data=data.model_dump(),
    )


def sse_event_to_string(event: SSEEvent) -> str:
    """
    将 SSE 事件转换为 SSE 格式的字符串

    格式：
        id: <id>
        event: <type>
        data: <json>

    """
    import json

    lines = [
        f"id: {event.id}",
        f"event: {event.type.value}",
        f"data: {json.dumps(event.data, ensure_ascii=False)}",
    ]
    return "\n".join(lines) + "\n\n"
