"""
SSE 事件类型定义
统一前后端事件协议
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from enum import Enum


class EventType(str, Enum):
    """SSE 事件类型枚举"""
    # 规划阶段
    PLAN_CREATED = "plan.created"           # Planner 生成计划
    PLAN_STARTED = "plan.started"           # 🔥 新增：规划开始（设置标题）
    PLAN_THINKING = "plan.thinking"         # 🔥 新增：规划思考流式内容
    
    # 任务执行阶段
    TASK_STARTED = "task.started"           # 专家开始执行
    TASK_PROGRESS = "task.progress"         # 专家执行进度（可选）
    TASK_COMPLETED = "task.completed"       # 专家完成
    TASK_FAILED = "task.failed"             # 专家失败
    
    # 产物阶段
    ARTIFACT_GENERATED = "artifact.generated"  # 产物生成
    
    # 🔥 新增：Artifact 流式事件（Real-time Streaming）
    ARTIFACT_START = "artifact.start"       # 开始生成 Artifact
    ARTIFACT_CHUNK = "artifact.chunk"       # 内容片段
    ARTIFACT_COMPLETED = "artifact.completed"  # 生成完成
    
    # 消息阶段
    MESSAGE_DELTA = "message.delta"         # 最终回复流式块
    MESSAGE_DONE = "message.done"           # 最终回复完成
    
    # 系统事件
    ROUTER_START = "router.start"           # 路由开始（意图分析）
    ROUTER_DECISION = "router.decision"     # 路由决策
    ERROR = "error"                         # 全局错误


# ============================================================================
# 基础事件结构
# ============================================================================

class SSEEvent(BaseModel):
    """SSE 事件基础结构"""
    id: str = Field(description="事件唯一ID（用于去重和排序）")
    timestamp: str = Field(description="ISO 8601 格式时间戳")
    type: EventType = Field(description="事件类型")
    data: Dict[str, Any] = Field(description="事件数据")


# ============================================================================
# 规划阶段事件
# ============================================================================

class TaskInfo(BaseModel):
    """任务信息"""
    id: str
    expert_type: str
    description: str
    sort_order: int
    status: str = "pending"


class PlanCreatedData(BaseModel):
    """plan.created 事件数据"""
    session_id: str
    summary: str
    estimated_steps: int
    execution_mode: str  # sequential | parallel
    tasks: List[TaskInfo]


# 🔥 新增：Commander 流式思考事件数据模型

class PlanStartedData(BaseModel):
    """plan.started 事件数据 - 通知前端开始规划"""
    session_id: str
    title: str = "任务规划"
    content: str = "正在分析需求..."
    status: str = "running"


class PlanThinkingData(BaseModel):
    """plan.thinking 事件数据 - 流式思考内容增量"""
    session_id: str
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


class TaskProgressData(BaseModel):
    """task.progress 事件数据（可选）"""
    task_id: str
    expert_type: str
    progress: float  # 0.0 - 1.0
    message: Optional[str] = None  # 进度消息，如"正在搜索..."


class TaskCompletedData(BaseModel):
    """task.completed 事件数据"""
    task_id: str
    expert_type: str
    description: str
    status: str = "completed"
    output: Optional[str] = None
    duration_ms: int
    completed_at: str
    artifact_count: int = 0  # 产物数量


class TaskFailedData(BaseModel):
    """task.failed 事件数据"""
    task_id: str
    expert_type: str
    description: str
    error: str
    failed_at: str


# ============================================================================
# 产物阶段事件
# ============================================================================

class ArtifactInfo(BaseModel):
    """产物信息"""
    id: str
    type: str  # code | html | markdown | json | text
    title: Optional[str]
    content: str
    language: Optional[str]
    sort_order: int


class ArtifactGeneratedData(BaseModel):
    """artifact.generated 事件数据"""
    task_id: str
    expert_type: str
    artifact: ArtifactInfo


# 🔥 新增：Artifact 流式事件数据模型（Real-time Streaming）

class ArtifactStartData(BaseModel):
    """artifact.start 事件数据 - 通知前端开始流式生成"""
    task_id: str
    expert_type: str
    artifact_id: str
    title: str
    type: str  # markdown | html | code | json | text


class ArtifactChunkData(BaseModel):
    """artifact.chunk 事件数据 - 传输内容片段"""
    artifact_id: str
    delta: str  # 增量内容


class ArtifactCompletedData(BaseModel):
    """artifact.completed 事件数据 - 流式生成完成"""
    artifact_id: str
    task_id: str
    expert_type: str
    full_content: str  # 完整内容（用于最终确认）


# ============================================================================
# 消息阶段事件
# ============================================================================

class MessageDeltaData(BaseModel):
    """message.delta 事件数据"""
    message_id: str
    content: str  # 增量内容
    is_final: bool = False


class MessageDoneData(BaseModel):
    """message.done 事件数据"""
    message_id: str
    full_content: str
    total_tokens: Optional[int] = None
    thinking: Optional[Dict[str, Any]] = None  # 思考过程数据（类似 DeepSeek Chat）


# ============================================================================
# 系统事件
# ============================================================================

class RouterStartData(BaseModel):
    """router.start 事件数据"""
    query: str  # 用户查询内容
    timestamp: str


class RouterDecisionData(BaseModel):
    """router.decision 事件数据"""
    decision: str  # simple | complex
    reason: Optional[str] = None


class ErrorData(BaseModel):
    """error 事件数据"""
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


# ============================================================================
# 事件构建工具函数
# ============================================================================

def build_sse_event(
    event_type: EventType,
    data: BaseModel,
    event_id: Optional[str] = None
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
    from uuid import uuid4
    
    return SSEEvent(
        id=event_id or str(uuid4()),
        timestamp=datetime.now().isoformat(),
        type=event_type,
        data=data.model_dump()
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
        f"data: {json.dumps(event.data, ensure_ascii=False)}"
    ]
    return "\n".join(lines) + "\n\n"
