"""
HITL (Human-in-the-Loop) 恢复服务

职责:
- 处理计划审核后的恢复/取消逻辑
- 清理 LangGraph checkpoints（用户取消时）
- 调用 StreamService 执行恢复后的流式处理

注意:
- LangGraph 导入在方法内部进行，防止循环引用
- 复用 StreamService.execute_langgraph_stream 进行流式处理，不重复实现
"""
import os
import asyncio
import psycopg
from typing import List, Dict, Any, Optional, Union
from datetime import datetime
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from models import Thread, TaskSession
from utils.exceptions import NotFoundError, AuthorizationError
from utils.logger import logger


class RecoveryService:
    """HITL 恢复服务"""
    
    def __init__(self, db_session: Session):
        self.db = db_session
        # 延迟初始化其他服务
        self._stream_service = None
    
    @property
    def stream_service(self):
        """延迟初始化 StreamService"""
        if self._stream_service is None:
            from .stream_service import StreamService
            self._stream_service = StreamService(self.db)
        return self._stream_service
    
    # ============================================================================
    # 核心恢复方法
    # ============================================================================
    
    async def resume_chat(
        self,
        thread_id: str,
        user_id: str,
        approved: bool,
        updated_plan: Optional[List[Dict[str, Any]]] = None,
        message_id: Optional[str] = None
    ) -> Union[StreamingResponse, Dict[str, str]]:
        """
        恢复被中断的 HITL 流程
        
        当用户在前端审核计划后，调用此接口继续执行。
        
        Args:
            thread_id: 线程ID
            user_id: 用户ID（用于权限验证）
            approved: 用户是否批准计划
            updated_plan: 用户修改后的任务计划（与前端传来的JSON结构一致）
                每项包含:
                - id: str 任务ID
                - expert_type: str 专家类型
                - description: str 任务描述
                - sort_order: int 排序
                - status: str 状态
                - depends_on: Optional[List[str]] 依赖任务ID列表
            message_id: 前端传入的消息ID（用于关联流式输出）
                
        Returns:
            approved=True: StreamingResponse SSE流
            approved=False: {"status": "cancelled", "message": "..."}
            
        Raises:
            NotFoundError: 线程不存在
            AuthorizationError: 无权访问此线程
        """
        logger.info(f"[HITL RESUME] thread_id={thread_id}, approved={approved}")
        
        # 1. 验证线程存在且属于当前用户
        thread = self.db.get(Thread, thread_id)
        if not thread:
            raise NotFoundError(f"Thread not found: {thread_id}")
        
        if thread.user_id != user_id:
            raise AuthorizationError("无权访问此线程")
        
        # 2. 处理用户拒绝
        if not approved:
            return await self._handle_rejection(thread_id)
        
        # 3. 处理用户批准 - 流式恢复
        return await self._handle_approval(thread_id, updated_plan, message_id)
    
    async def _handle_rejection(self, thread_id: str) -> Dict[str, str]:
        """
        处理用户拒绝计划
        
        清理状态：
        - 清理 LangGraph checkpoints
        - 更新 TaskSession 状态为 cancelled
        
        Args:
            thread_id: 线程ID
            
        Returns:
            取消状态响应
        """
        logger.info("[HITL RESUME] 用户拒绝了计划，清理状态")
        
        # 清理 checkpoints
        await self._cleanup_checkpoints(thread_id)
        
        # 更新 TaskSession
        await self._cancel_task_session(thread_id)
        
        return {"status": "cancelled", "message": "计划已被用户拒绝"}
    
    async def _handle_approval(
        self,
        thread_id: str,
        updated_plan: Optional[List[Dict[str, Any]]] = None,
        message_id: Optional[str] = None
    ) -> StreamingResponse:
        """
        处理用户批准计划 - 流式恢复执行
        
        不复用 SSE 生成器，而是调用 StreamService.execute_langgraph_stream
        
        Args:
            thread_id: 线程ID
            updated_plan: 用户修改后的计划
            message_id: 前端传入的消息ID（用于关联流式输出）
            
        Returns:
            StreamingResponse SSE流
        """
        import uuid
        
        logger.info("[HITL RESUME] 用户批准，开始流式恢复")
        
        # 生成 message_id（如果没有提供）
        actual_message_id = message_id or str(uuid.uuid4())
        
        # 创建队列
        stream_queue = asyncio.Queue()      # 用于 artifact 收集
        sse_queue = asyncio.Queue()         # 用于 SSE 事件收集
        realtime_queue = asyncio.Queue()    # 用于实时推送
        
        async def event_generator():
            """事件生成器 - 复用 StreamService 的核心流式逻辑"""
            try:
                # 调用 StreamService 执行 LangGraph 流式处理
                async for event in self.stream_service.execute_langgraph_stream(
                    thread_id=thread_id,
                    stream_queue=stream_queue,
                    sse_queue=sse_queue,
                    realtime_queue=realtime_queue,
                    updated_plan=updated_plan,
                    message_id=actual_message_id
                ):
                    yield event
                
                # 处理完成后，收集 artifacts 并保存
                await self._process_collected_artifacts(thread_id, stream_queue)
                
            except Exception as e:
                logger.error(f"[HITL RESUME] 流式执行错误: {e}", exc_info=True)
                yield self._build_error_event("RESUME_ERROR", str(e))
        
        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    
    async def _process_collected_artifacts(
        self,
        thread_id: str,
        stream_queue: asyncio.Queue
    ):
        """处理收集到的 artifacts 并保存"""
        from crud.task_session import create_artifacts_batch
        
        artifacts_by_task = {}
        
        # 收集所有 artifacts
        while not stream_queue.empty():
            try:
                item = stream_queue.get_nowait()
                if item.get("type") == "artifact":
                    task_id = item.get("task_id")
                    artifact_data = item.get("data")
                    if task_id and artifact_data:
                        if task_id not in artifacts_by_task:
                            artifacts_by_task[task_id] = []
                        artifacts_by_task[task_id].append(artifact_data)
            except asyncio.QueueEmpty:
                break
        
        # 保存 artifacts（需要查询对应的 subtask_id）
        task_session = self.db.exec(
            select(TaskSession).where(TaskSession.thread_id == thread_id)
        ).first()
        
        if task_session:
            for task_id, artifacts in artifacts_by_task.items():
                # 查询对应的 SubTask
                from models import SubTask
                subtask = self.db.exec(
                    select(SubTask).where(
                        SubTask.task_session_id == task_session.session_id,
                        SubTask.id == task_id
                    )
                ).first()
                
                if subtask:
                    try:
                        create_artifacts_batch(self.db, subtask.id, artifacts)
                        logger.info(f"[HITL RESUME] 保存 {len(artifacts)} 个 artifacts 到 SubTask {subtask.id}")
                    except Exception as e:
                        logger.error(f"[HITL RESUME] 保存 artifacts 失败: {e}")
    
    # ============================================================================
    # 状态清理
    # ============================================================================
    
    async def _cleanup_checkpoints(self, thread_id: str):
        """
        清理 LangGraph checkpoints（防止僵尸状态）
        
        使用同步连接（Windows兼容）
        """
        try:
            db_url = os.getenv("DATABASE_URL", "")
            db_url = db_url.replace("postgresql+asyncpg", "postgresql").replace("postgresql+psycopg", "postgresql")
            
            with psycopg.connect(db_url) as conn:
                with conn.cursor() as cur:
                    # 检查表是否存在
                    cur.execute("""
                        SELECT EXISTS (
                            SELECT FROM information_schema.tables 
                            WHERE table_name = 'checkpoints'
                        )
                    """)
                    if cur.fetchone()[0]:
                        cur.execute(
                            "DELETE FROM checkpoints WHERE thread_id = %s",
                            (thread_id,)
                        )
                        deleted = cur.rowcount
                        logger.info(f"[HITL RESUME] 清理了 {deleted} 个 checkpoint(s)")
                    else:
                        logger.info("[HITL RESUME] checkpoints 表不存在，跳过清理")
                conn.commit()
        
        except Exception as e:
            # 如果表不存在或其他错误，记录但不阻断流程
            logger.warning(f"[HITL RESUME] 清理 checkpoint 失败: {e}")
    
    async def _cancel_task_session(self, thread_id: str):
        """将 TaskSession 标记为 cancelled"""
        try:
            task_session = self.db.exec(
                select(TaskSession).where(TaskSession.thread_id == thread_id)
            ).first()
            
            if task_session:
                task_session.status = "cancelled"
                task_session.final_response = "计划被用户取消"
                task_session.updated_at = datetime.now()
                self.db.add(task_session)
                self.db.commit()
                logger.info(f"[HITL RESUME] TaskSession {task_session.session_id} 已标记为 cancelled")
        
        except Exception as e:
            logger.warning(f"[HITL RESUME] 更新 task_session 失败: {e}")
    
    # ============================================================================
    # 辅助方法
    # ============================================================================
    
    def _build_error_event(self, code: str, message: str) -> str:
        """构建 error 事件"""
        import json
        from event_types.events import EventType, ErrorData, build_sse_event
        from utils.event_generator import sse_event_to_string
        import uuid
        
        event = build_sse_event(
            EventType.ERROR,
            ErrorData(code=code, message=message),
            str(uuid.uuid4())
        )
        return sse_event_to_string(event)
