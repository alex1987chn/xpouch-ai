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

import asyncio
import threading
from datetime import datetime
from typing import Any

import psycopg
from fastapi.responses import StreamingResponse
from sqlalchemy import update
from sqlmodel import Session, select

from config import settings
from models import AgentRun, ExecutionPlan, RunStatus, Thread
from utils.error_codes import ErrorCode
from utils.exceptions import AppError, AuthorizationError, NotFoundError, ValidationError
from utils.logger import logger
from utils.sse_builder import build_error_event


class RecoveryService:
    """HITL 恢复服务"""

    _inflight_resume_by_thread: dict[str, str] = {}
    _inflight_lock = threading.Lock()

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
        updated_plan: list[dict[str, Any]] | None = None,
        plan_version: int | None = None,
        message_id: str | None = None,
        idempotency_key: str | None = None,
    ) -> StreamingResponse | dict[str, str]:
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
            plan_version: 客户端当前看到的计划版本号（乐观锁）
            message_id: 前端传入的消息ID（用于关联流式输出）
            idempotency_key: 幂等键（推荐传入，防止重复恢复请求）

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
        return await self._handle_approval(
            thread_id,
            updated_plan,
            plan_version,
            message_id,
            idempotency_key,
        )

    async def _handle_rejection(self, thread_id: str) -> dict[str, str]:
        """
        处理用户拒绝计划

        清理状态：
        - 清理 LangGraph checkpoints
        - 更新 ExecutionPlan 状态为 cancelled

        Args:
            thread_id: 线程ID

        Returns:
            取消状态响应
        """
        logger.info("[HITL RESUME] 用户拒绝了计划，清理状态")

        # 清理 checkpoints
        await self._cleanup_checkpoints(thread_id)

        # 更新 ExecutionPlan
        await self._cancel_execution_plan(thread_id)
        self._update_latest_run_status(thread_id, RunStatus.CANCELLED)

        return {"status": "cancelled", "message": "计划已被用户拒绝"}

    async def _handle_approval(
        self,
        thread_id: str,
        updated_plan: list[dict[str, Any]] | None = None,
        plan_version: int | None = None,
        message_id: str | None = None,
        idempotency_key: str | None = None,
    ) -> StreamingResponse:
        """
        处理用户批准计划 - 流式恢复执行

        不复用 SSE 生成器，而是调用 StreamService.execute_langgraph_stream

        Args:
            thread_id: 线程ID
            updated_plan: 用户修改后的计划
            plan_version: 客户端当前看到的计划版本号
            message_id: 前端传入的消息ID（用于关联流式输出）
            idempotency_key: 幂等键（推荐传入，防止重复恢复请求）

        Returns:
            StreamingResponse SSE流
        """
        import uuid

        resume_key = self._build_resume_key(thread_id, plan_version, message_id, idempotency_key)
        self._enter_inflight_resume(thread_id, resume_key)
        try:
            self._mark_thread_running(thread_id)
        except Exception:
            self._exit_inflight_resume(thread_id, resume_key)
            raise

        logger.info("[HITL RESUME] 用户批准，开始流式恢复")
        self._update_latest_run_status(thread_id, RunStatus.RESUMING)

        # 🔥 方案1：更新 ExecutionPlan 状态为 running（用户已批准）
        self._update_execution_plan_status(thread_id, "running")

        # 关键一致性保障：计划更新前执行乐观锁校验与版本递增
        self._bump_plan_version_with_cas(thread_id, plan_version)

        # 生成 message_id（如果没有提供）
        actual_message_id = message_id or str(uuid.uuid4())

        # 创建队列
        stream_queue = asyncio.Queue()  # 用于 artifact 收集
        sse_queue = asyncio.Queue()  # 用于 SSE 事件收集
        realtime_queue = asyncio.Queue()  # 用于实时推送

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
                    message_id=actual_message_id,
                ):
                    yield event

                # 处理完成后，收集 artifacts 并保存
                await self._process_collected_artifacts(thread_id, stream_queue)
                self._update_latest_run_status(thread_id, RunStatus.COMPLETED)

            except Exception as e:
                logger.error(f"[HITL RESUME] 流式执行错误: {e}", exc_info=True)
                self._mark_latest_run_failed(thread_id, str(e))
                yield self._build_error_event(ErrorCode.RESUME_ERROR, str(e))
            finally:
                self._mark_thread_idle(thread_id)
                self._exit_inflight_resume(thread_id, resume_key)

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @classmethod
    def _enter_inflight_resume(cls, thread_id: str, resume_key: str) -> None:
        """进程内幂等保护：防止重复恢复请求并发进入。"""
        with cls._inflight_lock:
            existing = cls._inflight_resume_by_thread.get(thread_id)
            if existing is None:
                cls._inflight_resume_by_thread[thread_id] = resume_key
                return

            if existing == resume_key:
                raise AppError(
                    message="恢复请求处理中，请勿重复提交",
                    code=ErrorCode.RESUME_DUPLICATE_REQUEST,
                    status_code=409,
                    details={"thread_id": thread_id, "idempotency_key": resume_key},
                )

            raise AppError(
                message="当前线程已有恢复流程在执行",
                code=ErrorCode.RESUME_IN_PROGRESS,
                status_code=409,
                details={"thread_id": thread_id, "running_idempotency_key": existing},
            )

    @classmethod
    def _exit_inflight_resume(cls, thread_id: str, resume_key: str) -> None:
        """释放进程内恢复请求占位（仅释放自己持有的 key）。"""
        with cls._inflight_lock:
            existing = cls._inflight_resume_by_thread.get(thread_id)
            if existing == resume_key:
                cls._inflight_resume_by_thread.pop(thread_id, None)

    @staticmethod
    def _build_resume_key(
        thread_id: str,
        plan_version: int | None,
        message_id: str | None,
        idempotency_key: str | None,
    ) -> str:
        """构建恢复请求幂等键。"""
        if idempotency_key:
            return idempotency_key
        if message_id:
            return f"msg:{message_id}"
        return f"{thread_id}:{plan_version}"

    def _get_latest_run(self, thread_id: str) -> AgentRun | None:
        """获取线程最新的 AgentRun。"""
        return self.db.exec(
            select(AgentRun)
            .where(AgentRun.thread_id == thread_id)
            .order_by(AgentRun.created_at.desc())
        ).first()

    def _update_latest_run_status(self, thread_id: str, status: RunStatus) -> None:
        """更新线程最新运行的状态。"""
        agent_run = self._get_latest_run(thread_id)
        if not agent_run:
            return
        agent_run.status = status
        agent_run.updated_at = datetime.now()
        agent_run.last_heartbeat_at = datetime.now()
        self.db.add(agent_run)
        self.db.commit()

    def _mark_latest_run_failed(self, thread_id: str, error_message: str) -> None:
        """将线程最新运行标记为失败。"""
        agent_run = self._get_latest_run(thread_id)
        if not agent_run:
            return
        agent_run.status = RunStatus.FAILED
        agent_run.error_message = error_message
        agent_run.updated_at = datetime.now()
        self.db.add(agent_run)
        self.db.commit()

    def _mark_thread_running(self, thread_id: str) -> None:
        """
        标记线程为 running。

        说明:
        - 作为跨请求的并发保护补充，避免同一线程被重复恢复。
        - 若线程已在运行中，则拒绝新的恢复请求。
        """
        thread = self.db.get(Thread, thread_id)
        if not thread:
            raise NotFoundError(f"Thread not found: {thread_id}")

        result = self.db.exec(
            update(Thread)
            .where(Thread.id == thread_id, Thread.status != "running")
            .values(status="running", updated_at=datetime.now())
        )
        if result.rowcount == 0:
            self.db.rollback()
            raise AppError(
                message="当前线程已有恢复流程在执行",
                code=ErrorCode.RESUME_IN_PROGRESS,
                status_code=409,
                details={"thread_id": thread_id},
            )
        self.db.commit()

    def _mark_thread_idle(self, thread_id: str) -> None:
        """恢复流程结束后，将线程状态归位为 idle。"""
        try:
            thread = self.db.get(Thread, thread_id)
            if not thread:
                return
            thread.status = "idle"
            thread.updated_at = datetime.now()
            self.db.add(thread)
            self.db.commit()
        except Exception as e:
            logger.warning(f"[HITL RESUME] 重置线程状态失败: {e}")

    def _bump_plan_version_with_cas(
        self, thread_id: str, expected_plan_version: int | None
    ) -> None:
        """
        使用 CAS（Compare-And-Set）方式递增 plan_version。

        规则：
        - 客户端必须携带当前看到的 plan_version
        - 版本一致才允许更新并 +1
        - 不一致返回 409 冲突
        """
        if expected_plan_version is None:
            raise ValidationError("缺少 plan_version，无法进行并发校验")

        execution_plan = self.db.exec(
            select(ExecutionPlan)
            .where(ExecutionPlan.thread_id == thread_id)
            .order_by(ExecutionPlan.created_at.desc())
        ).first()

        if not execution_plan:
            raise NotFoundError("ExecutionPlan")

        stmt = (
            update(ExecutionPlan)
            .where(
                ExecutionPlan.id == execution_plan.id,
                ExecutionPlan.plan_version == expected_plan_version,
            )
            .values(plan_version=ExecutionPlan.plan_version + 1, updated_at=datetime.now())
        )
        result = self.db.exec(stmt)

        if result.rowcount == 0:
            self.db.rollback()
            latest = self.db.exec(
                select(ExecutionPlan.plan_version).where(ExecutionPlan.id == execution_plan.id)
            ).first()
            raise AppError(
                message="计划已被更新，请刷新后重试",
                code=ErrorCode.PLAN_VERSION_CONFLICT,
                status_code=409,
                details={
                    "thread_id": thread_id,
                    "expected_plan_version": expected_plan_version,
                    "current_plan_version": latest,
                },
            )

        self.db.commit()

    async def _process_collected_artifacts(self, thread_id: str, stream_queue: asyncio.Queue):
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
        execution_plan = self.db.exec(
            select(ExecutionPlan).where(ExecutionPlan.thread_id == thread_id)
        ).first()

        if execution_plan:
            for task_id, artifacts in artifacts_by_task.items():
                # 查询对应的 SubTask
                from models import SubTask

                subtask = self.db.exec(
                    select(SubTask).where(
                        SubTask.execution_plan_id == execution_plan.id, SubTask.id == task_id
                    )
                ).first()

                if subtask:
                    try:
                        create_artifacts_batch(self.db, subtask.id, artifacts)
                        logger.info(
                            f"[HITL RESUME] 保存 {len(artifacts)} 个 artifacts 到 SubTask {subtask.id}"
                        )
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
            db_url = settings.get_database_url(sync_driver="plain")

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
                        cur.execute("DELETE FROM checkpoints WHERE thread_id = %s", (thread_id,))
                        deleted = cur.rowcount
                        logger.info(f"[HITL RESUME] 清理了 {deleted} 个 checkpoint(s)")
                    else:
                        logger.info("[HITL RESUME] checkpoints 表不存在，跳过清理")
                conn.commit()

        except Exception as e:
            # 如果表不存在或其他错误，记录但不阻断流程
            logger.warning(f"[HITL RESUME] 清理 checkpoint 失败: {e}")

    def _update_execution_plan_status(self, thread_id: str, status: str) -> None:
        """
        更新 ExecutionPlan 状态

        Args:
            thread_id: 线程ID
            status: 新状态（pending, waiting_for_approval, running, completed, failed, cancelled）
        """
        from models.enums import TaskStatus

        execution_plan = self.db.exec(
            select(ExecutionPlan).where(ExecutionPlan.thread_id == thread_id)
        ).first()

        if execution_plan:
            execution_plan.status = TaskStatus(status)
            execution_plan.updated_at = datetime.now()
            self.db.add(execution_plan)
            self.db.commit()
            logger.info(f"[HITL RESUME] ExecutionPlan {execution_plan.id} 状态更新为 {status}")

    async def _cancel_execution_plan(self, thread_id: str):
        """将 ExecutionPlan 标记为 cancelled"""
        try:
            execution_plan = self.db.exec(
                select(ExecutionPlan).where(ExecutionPlan.thread_id == thread_id)
            ).first()

            if execution_plan:
                execution_plan.status = "cancelled"
                execution_plan.final_response = "计划被用户取消"
                execution_plan.updated_at = datetime.now()
                self.db.add(execution_plan)
                self.db.commit()
                logger.info(f"[HITL RESUME] ExecutionPlan {execution_plan.id} 已标记为 cancelled")

        except Exception as e:
            logger.warning(f"[HITL RESUME] 更新 execution_plan 失败: {e}")

    # ============================================================================
    # 辅助方法
    # ============================================================================

    def _build_error_event(self, code: str | ErrorCode, message: str) -> str:
        """构建 error 事件"""
        return build_error_event(code=code, message=message)
