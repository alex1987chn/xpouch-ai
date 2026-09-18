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
from typing import Any

from fastapi.responses import StreamingResponse
from sqlalchemy import update
from sqlmodel import Session, select

from config import settings
from crud.agent_run import (
    acquire_run_lease,
    mark_run_cancelled_by_id,
)
from crud.audit_log import record_audit
from crud.message import create_user_message
from crud.run_event import (
    emit_hitl_rejected,
    emit_hitl_resumed,
    emit_hitl_revision_failed,
    emit_hitl_revision_started,
    emit_plan_updated,
    emit_run_cancelled,
)
from models import AgentRun, ExecutionPlan, RunStatus, Thread, User
from models.enums import TERMINAL_RUN_STATUSES, TaskStatus
from services.chat.run_lifecycle import sse_stream_headers
from utils.error_codes import ErrorCode
from utils.exceptions import AppError, AuthorizationError, NotFoundError, ValidationError
from utils.logger import logger, set_run_id
from utils.sse_builder import build_error_event
from utils.time import utc_now_naive


class RecoveryService:
    """HITL 恢复服务"""

    _inflight_resume_by_run: dict[str, str] = {}
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
        run_id: str,
        user_id: str,
        approved: bool,
        updated_plan: list[dict[str, Any]] | None = None,
        plan_version: int | None = None,
        message_id: str | None = None,
        idempotency_key: str | None = None,
        feedback: str | None = None,
        action: str | None = None,
    ) -> StreamingResponse | dict[str, str]:
        """
        恢复被中断的 HITL 流程

        当用户在前端审核计划后，调用此接口继续执行。

        Args:
            thread_id: 线程ID
            user_id: 用户ID（用于权限验证）
            approved: 用户是否批准计划（action 缺省时的兼容语义）
            action: 显式动作 'approve' | 'revise' | 'terminate'；缺省时按
                approved 推导（True→approve，False→terminate）。
                'revise' = 驳回+反馈 → 规划专家修订出 v(n+1)，任务保持挂起
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
            feedback: 驳回/修订反馈（落库为 user 消息；revise 必填）

        Returns:
            approve: StreamingResponse SSE流
            revise: {"status": "revising", "execution_plan_id": ...}
            terminate: {"status": "cancelled", "message": "..."}

        Raises:
            NotFoundError: 线程不存在
            AuthorizationError: 无权访问此线程
        """
        effective_action = action or ("approve" if approved else "terminate")
        logger.info(
            f"[HITL RESUME] thread_id={thread_id}, run_id={run_id}, action={effective_action}"
        )

        # 1. 验证线程存在且属于当前用户
        thread = self.db.get(Thread, thread_id)
        if not thread:
            raise NotFoundError(f"Thread not found: {thread_id}")

        if thread.user_id != user_id:
            raise AuthorizationError("无权访问此线程")

        agent_run = self._get_run_or_raise(run_id, thread_id)
        if agent_run.user_id != user_id:
            raise AuthorizationError("无权访问此运行实例")

        # 终态守卫：approve / revise 都要求这个 run 还在等审批。
        # 此前没有这道守卫，批准一个已结束（驳回/取消/超时）的 run 会把它从终态
        # **翻回 RESUMING**，然后在更深处失败（checkpoint 早被终态清理删掉）——
        # 用户看到的是莫名其妙的错误，而 run 状态已被改花。
        # terminate 有意不拦：对已取消的 run 再取消是幂等的。
        if effective_action in ("approve", "revise") and agent_run.status in TERMINAL_RUN_STATUSES:
            raise AppError(
                message=(
                    f"该任务已结束（{agent_run.status}），无法再批准或修订；"
                    "请刷新页面查看结果，或重新发起任务"
                ),
                code=ErrorCode.RESUME_INVALID_STATE,
                status_code=409,
            )

        # 2. 分支处理：修订（驳回+反馈，任务保持挂起）/ 终止。
        # 三个裁决动作各记一条审计日志（与管理面 8 个动作同一 append-only 通道），
        # 只在分支**成功返回后**落笔——失败路径不产生"做了没做成"的误导记录。
        if effective_action == "revise":
            result = await self._handle_revision(thread_id, run_id, agent_run.user_id, feedback)
            await self._audit_plan_decision(
                user_id,
                "plan.revise",
                run_id,
                thread_id,
                {"plan_version": plan_version, "has_feedback": bool(feedback)},
            )
            return result
        if not approved or effective_action == "terminate":
            result = await self._handle_rejection(thread_id, run_id, feedback)
            await self._audit_plan_decision(
                user_id,
                "plan.terminate",
                run_id,
                thread_id,
                {"has_feedback": bool(feedback)},
            )
            return result

        # 3. 处理用户批准 - 流式恢复
        response = await self._handle_approval(
            thread_id,
            run_id,
            updated_plan,
            plan_version,
            message_id,
            idempotency_key,
        )
        await self._audit_plan_decision(
            user_id,
            "plan.approve",
            run_id,
            thread_id,
            {"plan_version": plan_version, "plan_modified": bool(updated_plan)},
        )
        return response

    async def _audit_plan_decision(
        self,
        actor_user_id: str,
        action: str,
        run_id: str,
        thread_id: str,
        detail: dict,
    ) -> None:
        """计划裁决进审计日志：谁、对哪个 run、做了什么裁决。

        只记结构性事实（run/thread/版本/是否带反馈），**不记对话与计划内容**
        ——审计面是治理留痕，不是内容副本（量、隐私、性能三重考量）。
        用户名在此懒查（成功路径才碰 user 表），守卫/校验失败路径零额外查询。
        """
        audit_user = self.db.get(User, actor_user_id)
        record_audit(
            self.db,
            actor_user_id=actor_user_id,
            actor_username=audit_user.username if audit_user else actor_user_id,
            action=action,
            target=f"run:{run_id}",
            detail={"thread_id": thread_id, **detail},
        )
        await asyncio.to_thread(self.db.commit)

    async def _handle_rejection(
        self, thread_id: str, run_id: str, feedback: str | None = None
    ) -> dict[str, str]:
        """
        处理用户拒绝计划

        清理状态：
        - 清理 LangGraph checkpoints
        - 更新 ExecutionPlan 状态为 cancelled
        - 用户反馈以 user 消息落库（会话里留痕，后续运行可作为上下文）

        Args:
            thread_id: 线程ID
            run_id: 运行实例ID
            feedback: 用户驳回时填写的反馈（可选）

        Returns:
            取消状态响应
        """
        logger.info("[HITL RESUME] 用户拒绝了计划，清理状态")

        # 驳回反馈先落库（run 即将取消，但反馈属于会话历史）
        trimmed = (feedback or "").strip()
        if trimmed:
            create_user_message(self.db, thread_id=thread_id, content=trimmed)
            logger.info(f"[HITL RESUME] 驳回反馈已落库（{len(trimmed)} 字）")

        # 驳回即终态：清理 checkpoints（原始 + isolated 两种格式）+ SSE 传输帧
        from utils.db import cleanup_terminal_run

        await cleanup_terminal_run(thread_id, [run_id])

        # 更新 ExecutionPlan
        execution_plan = await self._cancel_execution_plan(run_id)

        # 🔥 写入 hitl_rejected 事件到账本
        emit_hitl_rejected(
            self.db,
            run_id=run_id,
            thread_id=thread_id,
            execution_plan_id=execution_plan.id if execution_plan else None,
        )

        await self._update_run_status(run_id, RunStatus.CANCELLED)
        await asyncio.to_thread(self.db.commit)

        return {"status": "cancelled", "message": "计划已被用户拒绝"}

    # ============================================================================
    # 计划修订（v4 循环，方案 A：运行内真修订）
    # ============================================================================

    async def _handle_revision(
        self,
        thread_id: str,
        run_id: str,
        user_id: str,
        feedback: str | None,
    ) -> dict[str, str]:
        """驳回 + 反馈 → 计划进入"修订中"，任务保持挂起。

        与终止（_handle_rejection）的本质区别：不删 checkpoint、不取消
        计划与运行。反馈落库为 user 消息，修订由后台任务异步执行
        （LLM 调用耗时可达分钟级，不能占住 HTTP 请求），前端轮询
        GET /runs/{run_id}/plan 感知 v(n+1)。
        """
        trimmed = (feedback or "").strip()
        if not trimmed:
            raise ValidationError("修订必须附上反馈，否则规划专家无从下手")

        agent_run = self._get_run_or_raise(run_id, thread_id)
        if agent_run.user_id != user_id:
            raise AuthorizationError("无权访问此运行实例")
        if agent_run.status != RunStatus.WAITING_FOR_APPROVAL:
            raise ValidationError("当前运行不在等待审批状态，无法修订")

        execution_plan = self.db.exec(
            select(ExecutionPlan).where(ExecutionPlan.run_id == run_id)
        ).first()
        if not execution_plan:
            raise NotFoundError("ExecutionPlan")

        # 反馈先落库（属于会话历史）
        create_user_message(self.db, thread_id=thread_id, content=trimmed)

        # 记录"修订中"起点事件（plan 接口据此判定 revising）
        emit_hitl_revision_started(
            self.db,
            run_id=run_id,
            thread_id=thread_id,
            execution_plan_id=execution_plan.id,
            plan_version=execution_plan.plan_version,
            feedback=trimmed,
        )
        await asyncio.to_thread(self.db.commit)

        logger.info(
            f"[HITL REVISION] run={run_id} 进入修订中（plan v{execution_plan.plan_version}）"
        )
        return {
            "status": "revising",
            "execution_plan_id": execution_plan.id,
            "message": "规划专家正在按你的反馈修订计划",
        }

    async def run_revision_job(
        self,
        *,
        run_id: str,
        thread_id: str,
        execution_plan_id: str,
        feedback: str,
    ) -> None:
        """后台修订任务（路由层 BackgroundTasks 调度；独立会话）。

        成功：替换子任务 + plan_version+1 + PLAN_UPDATED 事件（前端轮询感知）。
        失败：保持原计划待审 + HITL_REVISION_FAILED 事件（前端如实提示）。
        两种结局 run 都停留在 WAITING_FOR_APPROVAL，等待用户再次裁决。
        """
        from agents.services.plan_revision import revise_plan_tasks
        from database import engine

        with Session(engine) as session:
            plan = session.get(ExecutionPlan, execution_plan_id)
            if not plan:
                logger.error(f"[HITL REVISION] 计划不存在: {execution_plan_id}")
                return

            try:
                previous_tasks = [
                    {
                        "id": str(index + 1),
                        "expert_type": st.expert_type,
                        "description": st.task_description,
                        "depends_on": st.depends_on or [],
                    }
                    for index, st in enumerate(plan.sub_tasks)
                ]
                revised = await revise_plan_tasks(
                    user_query=plan.user_query,
                    previous_tasks=previous_tasks,
                    plan_version=plan.plan_version,
                    feedback=feedback,
                )

                # 替换子任务（ORM 级联 delete-orphan）
                for st in list(plan.sub_tasks):
                    session.delete(st)
                await asyncio.to_thread(session.flush)

                # 与新建路径共用同一套「建行 + 接依赖线」实现：
                # 修订输出的 id/depends_on 是 LLM 的 "1"/"2" 命名空间，必须经
                # task_id → 子任务 UUID 的解析，否则执行期匹配不到上游（此前的写法
                # 直接把 "1"/"2" 存进 depends_on）。
                #
                # ⚠️ 必须先给任务写上 id：修订提示词规定 id 从 "1" 连续编号、depends_on
                # 也用同一套号。若留空交给位置兜底（`task_{idx}` 是 0 基），LLM 写的
                # "1"（1 基）就会被解析成第二个任务 —— 实测把 writer 的依赖接成了它自己。
                from agents.plan_tasks import build_plan_tasks
                from crud.execution_plan import create_subtasks

                for index, task in enumerate(revised.tasks, start=1):
                    task.id = str(index)
                revised_tasks = build_plan_tasks(list(revised.tasks))
                await asyncio.to_thread(
                    create_subtasks,
                    session,
                    plan.id,
                    [task.to_subtask_create() for task in revised_tasks],
                )

                plan.plan_version += 1
                plan.estimated_steps = len(revised.tasks)
                if revised.strategy:
                    plan.plan_summary = revised.strategy

                emit_plan_updated(
                    session,
                    run_id=run_id,
                    thread_id=thread_id,
                    execution_plan_id=plan.id,
                    plan_version=plan.plan_version,
                    task_count=len(revised.tasks),
                )
                await asyncio.to_thread(session.commit)
                logger.info(
                    f"[HITL REVISION] 修订完成：run={run_id} v{plan.plan_version}"
                    f"（{len(revised.tasks)} 个任务）"
                )
            except Exception as exc:  # noqa: BLE001 — 任何失败都退回"原计划待审"
                session.rollback()
                emit_hitl_revision_failed(
                    session,
                    run_id=run_id,
                    thread_id=thread_id,
                    execution_plan_id=execution_plan_id,
                    plan_version=plan.plan_version,
                    error=str(exc),
                )
                await asyncio.to_thread(session.commit)
                logger.error(f"[HITL REVISION] 修订失败，保持原计划待审: {exc}")

    async def cancel_run(self, run_id: str, user_id: str) -> dict[str, str]:
        """显式取消指定运行实例。"""
        agent_run = self.db.get(AgentRun, run_id)
        if not agent_run:
            raise NotFoundError(f"AgentRun not found: {run_id}")
        if agent_run.user_id != user_id:
            raise AuthorizationError("无权取消此运行实例")

        if agent_run.status in {
            RunStatus.COMPLETED,
            RunStatus.FAILED,
            RunStatus.CANCELLED,
            RunStatus.TIMED_OUT,
        }:
            return {
                "status": str(agent_run.status),
                "message": "运行已处于终态，无需重复取消",
            }

        cancelled = mark_run_cancelled_by_id(
            self.db,
            run_id,
            current_node=agent_run.current_node,
        )
        if cancelled is not None:
            self.db.commit()

        execution_plan = self.db.exec(
            select(ExecutionPlan).where(ExecutionPlan.run_id == run_id)
        ).first()
        if execution_plan:
            from models.enums import TaskStatus

            execution_plan.status = TaskStatus.CANCELLED
            execution_plan.updated_at = utc_now_naive()
            execution_plan.final_response = execution_plan.final_response or "运行已取消"
            self.db.add(execution_plan)
            self.db.commit()

        # 🔥 写入 run_cancelled 事件到账本
        emit_run_cancelled(
            self.db,
            run_id=run_id,
            thread_id=agent_run.thread_id,
            current_node=agent_run.current_node,
        )
        self.db.commit()

        # 取消即终态：清理本次运行的隔离线程 checkpoint + SSE 传输帧
        from utils.db import cleanup_terminal_run

        await cleanup_terminal_run(agent_run.thread_id, [run_id])

        return {"status": "cancelled", "message": "运行已取消"}

    async def _handle_approval(
        self,
        thread_id: str,
        run_id: str,
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

        resume_key = self._build_resume_key(run_id, plan_version, message_id, idempotency_key)
        self._enter_inflight_resume(run_id, resume_key)
        try:
            logger.info("[HITL RESUME] 用户批准，开始流式恢复")
            # 认领租约（决定 2）：把「谁来驱动这个 run」从「谁先到」变成「谁持有租约」。
            # 单实例下这一步必然成功（租约是创建时自己拿的）；多实例/重复投递时
            # 另一个进程持有有效租约 → 拒绝驱动，否则双方会同时跑同一个 run，
            # 而对方的 supervisor 会在自己的续租周期里把它当作无主 run 回收掉。
            if not await asyncio.to_thread(acquire_run_lease, self.db, run_id):
                raise AppError(
                    message="该任务正在被另一个实例处理，请稍后刷新查看结果",
                    code=ErrorCode.ACTIVE_RUN_CONFLICT,
                    status_code=409,
                    details={"run_id": run_id},
                )
            await self._update_run_status(run_id, RunStatus.RESUMING)
            # 🔥 恢复执行：重置完整执行预算（等待期已挂起 deadline）
            await self._reset_deadline(run_id)

            # 🔥 方案1：更新 ExecutionPlan 状态为 running（用户已批准）
            from models.enums import TaskStatus

            await self._update_execution_plan_status(run_id, TaskStatus.RUNNING)

            # 关键一致性保障：计划更新前执行乐观锁校验与版本递增
            self._bump_plan_version_with_cas(run_id, plan_version)

            # 租约释放：resume 成功（计划已更新、事件已写入），run 即将进入 RUNNING。
            # 不释放的话，run 在 RUNNING 期间租约仍被持有，后续对该 run 的任何
            # resume 请求（前端轮询/用户重复点）都会撞 ACTIVE_RUN_CONFLICT。
            run = self.db.get(AgentRun, run_id)
            if run:
                run.owner = None
                run.lease_expires_at = None

            # 🔥 写入 hitl_resumed 事件到账本
            execution_plan = self._get_execution_plan_by_run(run_id)
            emit_hitl_resumed(
                self.db,
                run_id=run_id,
                thread_id=thread_id,
                execution_plan_id=execution_plan.id if execution_plan else None,
                plan_version=plan_version or 1,
                plan_modified=updated_plan is not None and len(updated_plan) > 0,
            )
            self.db.commit()

            # 生成 message_id（如果没有提供）
            actual_message_id = message_id or str(uuid.uuid4())

            # 创建队列
            stream_queue = asyncio.Queue()  # 用于 artifact 收集
            sse_queue = asyncio.Queue()  # 用于 SSE 事件收集
            realtime_queue = asyncio.Queue()  # 用于实时推送

            async def event_generator():
                """事件生成器 - 复用 StreamService 的核心流式逻辑"""
                set_run_id(run_id)
                try:
                    # 调用 StreamService 执行 LangGraph 流式处理
                    async for event in self.stream_service.execute_langgraph_stream(
                        thread_id=thread_id,
                        stream_queue=stream_queue,
                        sse_queue=sse_queue,
                        realtime_queue=realtime_queue,
                        updated_plan=updated_plan,
                        message_id=actual_message_id,
                        run_id=run_id,
                    ):
                        yield event

                    # 处理完成后，收集 artifacts 并保存
                    await self._process_collected_artifacts(run_id, stream_queue)
                    await self._update_run_status(run_id, RunStatus.COMPLETED)

                    # run 终态：清理隔离线程 checkpoint + SSE 传输帧
                    from utils.db import cleanup_terminal_run

                    await cleanup_terminal_run(thread_id, [run_id])
                    yield "data: [DONE]\n\n"

                except asyncio.CancelledError:
                    # 🔥 客户端断开连接（如刷新页面）
                    # aggregator_node 内部已更新 AgentRun 状态，无需在此处理
                    logger.info(f"[HITL RESUME] 客户端断开连接，run_id={run_id}")
                    raise
                except AppError as e:
                    if e.code == ErrorCode.RUN_CANCELLED:
                        yield self._build_error_event(ErrorCode.RUN_CANCELLED, e.message)
                    else:
                        logger.error(f"[HITL RESUME] 流式执行错误: {e}", exc_info=True)
                        await self._mark_run_failed(run_id, str(e))
                        yield self._build_error_event(ErrorCode.RESUME_ERROR, str(e))
                except Exception as e:
                    logger.error(f"[HITL RESUME] 流式执行错误: {e}", exc_info=True)
                    await self._mark_run_failed(run_id, str(e))
                    yield self._build_error_event(ErrorCode.RESUME_ERROR, str(e))
                finally:
                    self._exit_inflight_resume(run_id, resume_key)

        except Exception:
            self._exit_inflight_resume(run_id, resume_key)
            raise

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers=sse_stream_headers(thread_id, run_id),
        )

    @classmethod
    def _enter_inflight_resume(cls, run_id: str, resume_key: str) -> None:
        """进程内幂等保护：防止重复恢复请求并发进入。"""
        with cls._inflight_lock:
            existing = cls._inflight_resume_by_run.get(run_id)
            if existing is None:
                cls._inflight_resume_by_run[run_id] = resume_key
                return

            if existing == resume_key:
                raise AppError(
                    message="恢复请求处理中，请勿重复提交",
                    code=ErrorCode.RESUME_DUPLICATE_REQUEST,
                    status_code=409,
                    details={"run_id": run_id, "idempotency_key": resume_key},
                )

            raise AppError(
                message="当前运行实例已有恢复流程在执行",
                code=ErrorCode.RESUME_IN_PROGRESS,
                status_code=409,
                details={"run_id": run_id, "running_idempotency_key": existing},
            )

    @classmethod
    def _exit_inflight_resume(cls, run_id: str, resume_key: str) -> None:
        """释放进程内恢复请求占位（仅释放自己持有的 key）。"""
        with cls._inflight_lock:
            existing = cls._inflight_resume_by_run.get(run_id)
            if existing == resume_key:
                cls._inflight_resume_by_run.pop(run_id, None)

    @staticmethod
    def _build_resume_key(
        run_id: str,
        plan_version: int | None,
        message_id: str | None,
        idempotency_key: str | None,
    ) -> str:
        """构建恢复请求幂等键。"""
        if idempotency_key:
            return idempotency_key
        if message_id:
            return f"msg:{message_id}"
        return f"{run_id}:{plan_version}"

    def _get_run_or_raise(self, run_id: str, thread_id: str) -> AgentRun:
        """获取指定运行实例，并校验其属于当前线程（单一实现在 run_lifecycle）。"""
        from services.chat.run_lifecycle import get_agent_run_or_raise

        return get_agent_run_or_raise(self.db, run_id, thread_id=thread_id)

    async def _update_run_status(self, run_id: str, status: RunStatus) -> None:
        """更新指定运行实例的状态（单一实现在 run_lifecycle，经 to_thread）。"""
        from services.chat.run_lifecycle import update_run_status

        await asyncio.to_thread(update_run_status, self.db, run_id, status)

    async def _reset_deadline(self, run_id: str) -> None:
        """恢复执行时重置完整执行预算（单一实现在 run_lifecycle，经 to_thread）。"""
        from services.chat.run_lifecycle import reset_deadline

        await asyncio.to_thread(reset_deadline, self.db, run_id, settings.run_deadline_seconds)

    async def _mark_run_failed(self, run_id: str, error_message: str) -> None:
        """将指定运行实例标记为失败（单一实现在 run_lifecycle，经 to_thread）。"""
        from services.chat.run_lifecycle import mark_run_failed

        await asyncio.to_thread(mark_run_failed, self.db, run_id, error_message)

    def _bump_plan_version_with_cas(self, run_id: str, expected_plan_version: int | None) -> None:
        """
        使用 CAS（Compare-And-Set）方式递增 plan_version。

        规则：
        - 客户端必须携带当前看到的 plan_version
        - 版本一致才允许更新并 +1
        - 不一致返回 409 冲突
        """
        if expected_plan_version is None:
            raise ValidationError("缺少 plan_version，无法进行并发校验")

        execution_plan = self._get_execution_plan_by_run(run_id)

        if not execution_plan:
            raise NotFoundError("ExecutionPlan")

        stmt = (
            update(ExecutionPlan)
            .where(
                ExecutionPlan.id == execution_plan.id,
                ExecutionPlan.plan_version == expected_plan_version,
            )
            .values(plan_version=ExecutionPlan.plan_version + 1, updated_at=utc_now_naive())
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
                    "run_id": run_id,
                    "expected_plan_version": expected_plan_version,
                    "current_plan_version": latest,
                },
            )

        self.db.commit()

    async def _process_collected_artifacts(self, run_id: str, stream_queue: asyncio.Queue):
        """处理收集到的 artifacts 并保存"""
        from crud.execution_plan import create_artifacts_batch

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
        execution_plan = self._get_execution_plan_by_run(run_id)

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
                        # 收集链送来的是 raw dict，转换为 ArtifactCreate（pydantic）
                        from models import ArtifactCreate

                        artifact_models = [
                            ArtifactCreate.model_validate(a) if isinstance(a, dict) else a
                            for a in artifacts
                        ]
                        create_artifacts_batch(self.db, subtask.id, artifact_models)
                        logger.info(
                            f"[HITL RESUME] 保存 {len(artifacts)} 个 artifacts 到 SubTask {subtask.id}"
                        )
                    except Exception as e:
                        # rollback 必需：create_artifacts_batch 内部会 commit，失败后
                        # 会话可能处于不可用事务态；不清理会让后续写（例如把 run 标成
                        # COMPLETED）抛 PendingRollbackError，把局部失败放大成整轮失败
                        self.db.rollback()
                        logger.error(
                            "[HITL RESUME] 保存 artifacts 失败（该任务产物缺失，其余流程继续）: %s",
                            e,
                            exc_info=True,
                        )

    # ============================================================================
    # 状态清理
    # ============================================================================

    async def _update_execution_plan_status(self, run_id: str, status: TaskStatus) -> None:
        """
        更新 ExecutionPlan 状态（写路径经 to_thread，避免阻塞事件循环）

        Args:
            run_id: 运行实例ID
            status: 新状态（TaskStatus 枚举）
        """

        def _write() -> None:
            execution_plan = self._get_execution_plan_by_run(run_id)

            if execution_plan:
                execution_plan.status = status
                execution_plan.updated_at = utc_now_naive()
                self.db.add(execution_plan)
                self.db.commit()
                logger.info(f"[HITL RESUME] ExecutionPlan {execution_plan.id} 状态更新为 {status}")

        await asyncio.to_thread(_write)

    async def _cancel_execution_plan(self, run_id: str):
        """将 ExecutionPlan 标记为 cancelled"""
        try:
            execution_plan = self._get_execution_plan_by_run(run_id)

            if execution_plan:
                execution_plan.status = TaskStatus.CANCELLED
                execution_plan.final_response = "计划被用户取消"
                execution_plan.updated_at = utc_now_naive()
                self.db.add(execution_plan)
                self.db.commit()
                logger.info(f"[HITL RESUME] ExecutionPlan {execution_plan.id} 已标记为 cancelled")

        except Exception as e:
            # 取消流程不应因计划状态写失败而中断，但后果是「run 已取消、计划仍
            # IN_PROGRESS」的矛盾态：前端审批卡可能仍显示可操作，而再次批准必然
            # 失败；且调用方因拿不到 plan id 会写出缺上下文的 hitl_rejected 事件。
            # 故用 error + exc_info（此前是 warning 且无堆栈，事后几乎无迹可寻）。
            self.db.rollback()
            logger.error(
                "[HITL RESUME] 更新 execution_plan 状态失败（run 已取消但计划状态可能"
                "仍为非终态，前端可能仍可操作）: %s",
                e,
                exc_info=True,
            )

    # ============================================================================
    # 辅助方法
    # ============================================================================

    def _get_execution_plan_by_run(self, run_id: str) -> ExecutionPlan | None:
        """按 run_id 获取对应的 ExecutionPlan。"""
        return self.db.exec(select(ExecutionPlan).where(ExecutionPlan.run_id == run_id)).first()

    def _build_error_event(self, code: str | ErrorCode, message: str) -> str:
        """构建 error 事件"""
        return build_error_event(code=code, message=message)
