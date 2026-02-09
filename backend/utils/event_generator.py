"""
SSE 事件生成器
提供标准化的事件生成和发送功能
"""

from typing import Optional, List, Dict, Any, AsyncGenerator
from datetime import datetime
from uuid import uuid4

from event_types.events import (
    EventType, SSEEvent,
    PlanCreatedData, PlanStartedData, PlanThinkingData,  # 🔥 新增
    TaskInfo,
    TaskStartedData, TaskProgressData, TaskCompletedData, TaskFailedData,
    ArtifactGeneratedData, ArtifactInfo,
    ArtifactStartData, ArtifactChunkData, ArtifactCompletedData,
    MessageDeltaData, MessageDoneData,
    RouterStartData, RouterDecisionData, ErrorData,
    build_sse_event, sse_event_to_string
)


class EventGenerator:
    """
    SSE 事件生成器
    
    用于在 LangGraph 工作流中生成标准化事件
    """
    
    def __init__(self):
        self._event_counter = 0
    
    def _next_event_id(self) -> str:
        """生成下一个事件ID"""
        self._event_counter += 1
        return f"evt_{self._event_counter}_{uuid4().hex[:8]}"
    
    # ========================================================================
    # 规划阶段事件
    # ========================================================================
    
    def plan_created(
        self,
        session_id: str,
        summary: str,
        estimated_steps: int,
        execution_mode: str,
        tasks: List[Dict[str, Any]]
    ) -> SSEEvent:
        """
        生成 plan.created 事件
        
        Args:
            session_id: 任务会话ID
            summary: 规划摘要
            estimated_steps: 预计步骤数
            execution_mode: 执行模式 (sequential/parallel)
            tasks: 任务列表，每项包含 id, expert_type, description, sort_order
        """
        task_infos = [
            TaskInfo(
                id=task["id"],
                expert_type=task["expert_type"],
                description=task["description"],
                sort_order=task.get("sort_order", 0),
                status=task.get("status", "pending")
            )
            for task in tasks
        ]
        
        data = PlanCreatedData(
            session_id=session_id,
            summary=summary,
            estimated_steps=estimated_steps,
            execution_mode=execution_mode,
            tasks=task_infos
        )
        
        return build_sse_event(EventType.PLAN_CREATED, data, self._next_event_id())
    
    # 🔥 新增：Commander 流式思考事件方法
    
    def plan_started(
        self,
        session_id: str,
        title: str = "任务规划",
        content: str = "正在分析需求...",
        status: str = "running"
    ) -> SSEEvent:
        """生成 plan.started 事件 - 通知前端开始规划"""
        data = PlanStartedData(
            session_id=session_id,
            title=title,
            content=content,
            status=status
        )
        return build_sse_event(EventType.PLAN_STARTED, data, self._next_event_id())
    
    def plan_thinking(
        self,
        session_id: str,
        delta: str
    ) -> SSEEvent:
        """生成 plan.thinking 事件 - 流式思考内容增量"""
        data = PlanThinkingData(
            session_id=session_id,
            delta=delta
        )
        return build_sse_event(EventType.PLAN_THINKING, data, self._next_event_id())
    
    # ========================================================================
    # 任务执行阶段事件
    # ========================================================================
    
    def task_started(
        self,
        task_id: str,
        expert_type: str,
        description: str
    ) -> SSEEvent:
        """生成 task.started 事件"""
        data = TaskStartedData(
            task_id=task_id,
            expert_type=expert_type,
            description=description,
            started_at=datetime.now().isoformat()
        )
        return build_sse_event(EventType.TASK_STARTED, data, self._next_event_id())
    
    def task_progress(
        self,
        task_id: str,
        expert_type: str,
        progress: float,
        message: Optional[str] = None
    ) -> SSEEvent:
        """生成 task.progress 事件"""
        data = TaskProgressData(
            task_id=task_id,
            expert_type=expert_type,
            progress=max(0.0, min(1.0, progress)),
            message=message
        )
        return build_sse_event(EventType.TASK_PROGRESS, data, self._next_event_id())
    
    def task_completed(
        self,
        task_id: str,
        expert_type: str,
        description: str,
        output: Optional[str],
        duration_ms: int,
        artifact_count: int = 0
    ) -> SSEEvent:
        """生成 task.completed 事件"""
        data = TaskCompletedData(
            task_id=task_id,
            expert_type=expert_type,
            description=description,
            status="completed",
            output=output,
            duration_ms=duration_ms,
            completed_at=datetime.now().isoformat(),
            artifact_count=artifact_count
        )
        return build_sse_event(EventType.TASK_COMPLETED, data, self._next_event_id())
    
    def task_failed(
        self,
        task_id: str,
        expert_type: str,
        description: str,
        error: str
    ) -> SSEEvent:
        """生成 task.failed 事件"""
        data = TaskFailedData(
            task_id=task_id,
            expert_type=expert_type,
            description=description,
            error=error,
            failed_at=datetime.now().isoformat()
        )
        return build_sse_event(EventType.TASK_FAILED, data, self._next_event_id())
    
    # ========================================================================
    # 产物阶段事件
    # ========================================================================
    
    def artifact_generated(
        self,
        task_id: str,
        expert_type: str,
        artifact_id: str,
        artifact_type: str,
        content: str,
        title: Optional[str] = None,
        language: Optional[str] = None,
        sort_order: int = 0
    ) -> SSEEvent:
        """生成 artifact.generated 事件"""
        artifact_info = ArtifactInfo(
            id=artifact_id,
            type=artifact_type,
            title=title,
            content=content,
            language=language,
            sort_order=sort_order
        )
        
        data = ArtifactGeneratedData(
            task_id=task_id,
            expert_type=expert_type,
            artifact=artifact_info
        )
        return build_sse_event(EventType.ARTIFACT_GENERATED, data, self._next_event_id())
    
    # 🔥 新增：Artifact 流式事件方法（Real-time Streaming）
    
    def artifact_start(
        self,
        task_id: str,
        expert_type: str,
        artifact_id: str,
        title: str,
        type: str
    ) -> SSEEvent:
        """生成 artifact.start 事件 - 通知前端开始流式生成"""
        data = ArtifactStartData(
            task_id=task_id,
            expert_type=expert_type,
            artifact_id=artifact_id,
            title=title,
            type=type
        )
        return build_sse_event(EventType.ARTIFACT_START, data, self._next_event_id())
    
    def artifact_chunk(
        self,
        artifact_id: str,
        delta: str
    ) -> SSEEvent:
        """生成 artifact.chunk 事件 - 传输内容片段"""
        data = ArtifactChunkData(
            artifact_id=artifact_id,
            delta=delta
        )
        return build_sse_event(EventType.ARTIFACT_CHUNK, data, self._next_event_id())
    
    def artifact_completed(
        self,
        artifact_id: str,
        task_id: str,
        expert_type: str,
        full_content: str
    ) -> SSEEvent:
        """生成 artifact.completed 事件 - 流式生成完成"""
        data = ArtifactCompletedData(
            artifact_id=artifact_id,
            task_id=task_id,
            expert_type=expert_type,
            full_content=full_content
        )
        return build_sse_event(EventType.ARTIFACT_COMPLETED, data, self._next_event_id())
    
    # ========================================================================
    # 消息阶段事件
    # ========================================================================
    
    def message_delta(
        self,
        message_id: str,
        content: str,
        is_final: bool = False
    ) -> SSEEvent:
        """生成 message.delta 事件"""
        data = MessageDeltaData(
            message_id=message_id,
            content=content,
            is_final=is_final
        )
        return build_sse_event(EventType.MESSAGE_DELTA, data, self._next_event_id())
    
    def message_done(
        self,
        message_id: str,
        full_content: str,
        total_tokens: Optional[int] = None
    ) -> SSEEvent:
        """生成 message.done 事件"""
        data = MessageDoneData(
            message_id=message_id,
            full_content=full_content,
            total_tokens=total_tokens
        )
        return build_sse_event(EventType.MESSAGE_DONE, data, self._next_event_id())
    
    # ========================================================================
    # 系统事件
    # ========================================================================

    def router_start(
        self,
        query: str
    ) -> SSEEvent:
        """生成 router.start 事件"""
        data = RouterStartData(
            query=query,
            timestamp=datetime.now().isoformat()
        )
        return build_sse_event(EventType.ROUTER_START, data, self._next_event_id())

    def router_decision(
        self,
        decision: str,
        reason: Optional[str] = None
    ) -> SSEEvent:
        """生成 router.decision 事件"""
        data = RouterDecisionData(
            decision=decision,
            reason=reason
        )
        return build_sse_event(EventType.ROUTER_DECISION, data, self._next_event_id())
    
    def error(
        self,
        code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ) -> SSEEvent:
        """生成 error 事件"""
        data = ErrorData(
            code=code,
            message=message,
            details=details
        )
        return build_sse_event(EventType.ERROR, data, self._next_event_id())


# ============================================================================
# 便捷函数（用于快速生成事件）
# ============================================================================

_event_generator = EventGenerator()


def event_plan_created(*args, **kwargs) -> SSEEvent:
    """便捷函数：生成 plan.created 事件"""
    return _event_generator.plan_created(*args, **kwargs)


# 🔥 新增：Commander 流式思考事件便捷函数

def event_plan_started(*args, **kwargs) -> SSEEvent:
    """便捷函数：生成 plan.started 事件"""
    return _event_generator.plan_started(*args, **kwargs)


def event_plan_thinking(*args, **kwargs) -> SSEEvent:
    """便捷函数：生成 plan.thinking 事件"""
    return _event_generator.plan_thinking(*args, **kwargs)


def event_task_started(*args, **kwargs) -> SSEEvent:
    """便捷函数：生成 task.started 事件"""
    return _event_generator.task_started(*args, **kwargs)


def event_task_progress(*args, **kwargs) -> SSEEvent:
    """便捷函数：生成 task.progress 事件"""
    return _event_generator.task_progress(*args, **kwargs)


def event_task_completed(*args, **kwargs) -> SSEEvent:
    """便捷函数：生成 task.completed 事件"""
    return _event_generator.task_completed(*args, **kwargs)


def event_task_failed(*args, **kwargs) -> SSEEvent:
    """便捷函数：生成 task.failed 事件"""
    return _event_generator.task_failed(*args, **kwargs)


def event_artifact_generated(*args, **kwargs) -> SSEEvent:
    """便捷函数：生成 artifact.generated 事件"""
    return _event_generator.artifact_generated(*args, **kwargs)


# 🔥 新增：Artifact 流式事件便捷函数（Real-time Streaming）

def event_artifact_start(*args, **kwargs) -> SSEEvent:
    """便捷函数：生成 artifact.start 事件"""
    return _event_generator.artifact_start(*args, **kwargs)


def event_artifact_chunk(*args, **kwargs) -> SSEEvent:
    """便捷函数：生成 artifact.chunk 事件"""
    return _event_generator.artifact_chunk(*args, **kwargs)


def event_artifact_completed(*args, **kwargs) -> SSEEvent:
    """便捷函数：生成 artifact.completed 事件"""
    return _event_generator.artifact_completed(*args, **kwargs)


def event_message_delta(*args, **kwargs) -> SSEEvent:
    """便捷函数：生成 message.delta 事件"""
    return _event_generator.message_delta(*args, **kwargs)


def event_message_done(*args, **kwargs) -> SSEEvent:
    """便捷函数：生成 message.done 事件"""
    return _event_generator.message_done(*args, **kwargs)


def event_router_start(*args, **kwargs) -> SSEEvent:
    """便捷函数：生成 router.start 事件"""
    return _event_generator.router_start(*args, **kwargs)


def event_router_decision(*args, **kwargs) -> SSEEvent:
    """便捷函数：生成 router.decision 事件"""
    return _event_generator.router_decision(*args, **kwargs)


def event_error(*args, **kwargs) -> SSEEvent:
    """便捷函数：生成 error 事件"""
    return _event_generator.error(*args, **kwargs)


# ============================================================================
# SSE 流生成器
# ============================================================================

async def sse_stream_from_events(
    events: AsyncGenerator[SSEEvent, None]
) -> AsyncGenerator[str, None]:
    """
    将事件异步流转换为 SSE 格式的字符串流
    
    用法：
        async def event_generator():
            yield event_plan_created(...)
            yield event_task_started(...)
            ...
        
        return StreamingResponse(
            sse_stream_from_events(event_generator()),
            media_type="text/event-stream"
        )
    """
    async for event in events:
        yield sse_event_to_string(event)
    
    # 发送结束标记
    yield "data: [DONE]\n\n"
