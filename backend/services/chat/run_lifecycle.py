"""AgentRun / ExecutionPlan 生命周期操作——单一实现。

此前 StreamService / RecoveryService / routers 各自维护一份状态更新、
失败标记、完成收尾、SSE 头构造（同体异名、逐字重复、键语义漂移并存）；
本模块是唯一权威。

约定：
- 全部函数为同步实现，显式接收 Session（调用方在 async 上下文用
  asyncio.to_thread 包装，与 nodes 层既有纪律一致）。
- commit 策略：写函数内部 commit（调用方无需关心事务边界）。
"""

from datetime import datetime, timedelta

from sqlmodel import Session, select

from crud.agent_run import mark_run_completed_by_id, mark_run_failed_by_id, update_run_status_by_id
from crud.run_event import emit_run_completed
from models import AgentRun, ExecutionPlan
from models.enums import RunStatus
from utils.exceptions import AuthorizationError, NotFoundError, ValidationError
from utils.logger import logger


def update_run_status(
    session: Session,
    run_id: str,
    status: RunStatus,
    *,
    current_node: str | None = None,
) -> bool:
    """更新 AgentRun 状态并提交。返回是否命中了运行实例。"""
    updated = update_run_status_by_id(session, run_id, status, current_node=current_node)
    if updated is not None:
        session.commit()
        return True
    return False


def mark_run_failed(
    session: Session,
    run_id: str,
    error_message: str,
    *,
    error_code: str | None = None,
) -> bool:
    """将 AgentRun 标记为失败并提交。返回是否命中了运行实例。"""
    updated = mark_run_failed_by_id(
        session,
        run_id,
        error_message=error_message,
        error_code=error_code,
    )
    if updated is not None:
        session.commit()
        return True
    return False


def pause_deadline(session: Session, run_id: str) -> None:
    """进入 HITL 等待时挂起执行预算（deadline_at 置空）。

    用户思考/修改计划的时间不应消耗执行 deadline——否则审批页停留
    超过预算后，恢复即被守卫击杀（等待态本身不被清理服务触碰，挂起安全）。
    """
    run = session.get(AgentRun, run_id)
    if run and run.deadline_at is not None:
        run.deadline_at = None
        session.add(run)
        session.commit()
        logger.info(f"[RunLifecycle] deadline paused for run {run_id}")


def reset_deadline(session: Session, run_id: str, budget_seconds: int) -> None:
    """恢复执行时重置完整执行预算（每轮批准都是新的执行爆发）。"""
    run = session.get(AgentRun, run_id)
    if run:
        run.deadline_at = datetime.now() + timedelta(seconds=budget_seconds)
        session.add(run)
        session.commit()
        logger.info(f"[RunLifecycle] deadline reset (+{budget_seconds}s) for run {run_id}")


def finalize_run_completed(session: Session, run_id: str, thread_id: str) -> None:
    """运行完成收尾：终态 + current_node + run_completed 账本事件，一次提交。"""
    mark_run_completed_by_id(session, run_id)
    run = session.get(AgentRun, run_id)
    if run:
        run.current_node = "done"
        session.add(run)
    emit_run_completed(session, run_id=run_id, thread_id=thread_id)
    session.commit()
    logger.info(f"[RunLifecycle] AgentRun {run_id} finalized as completed")


def get_execution_plan_by_run(session: Session, run_id: str) -> ExecutionPlan | None:
    """按 run_id 获取 ExecutionPlan。"""
    return session.exec(select(ExecutionPlan).where(ExecutionPlan.run_id == run_id)).first()


def get_agent_run_or_raise(
    session: Session,
    run_id: str,
    *,
    thread_id: str | None = None,
    user_id: str | None = None,
) -> AgentRun:
    """获取 AgentRun 并按需校验归属。

    - thread_id：校验 run 属于该线程（HITL 恢复路径）
    - user_id：校验 run 属于该用户（runs 路由访问控制）
    两者可同时提供。
    """
    run = session.get(AgentRun, run_id)
    if run is None:
        raise NotFoundError(f"AgentRun not found: {run_id}" if thread_id else "AgentRun")
    if thread_id is not None and run.thread_id != thread_id:
        raise ValidationError("run_id 与 thread_id 不匹配")
    if user_id is not None and run.user_id != user_id:
        raise AuthorizationError("无权访问此运行实例")
    return run


def sse_stream_headers(thread_id: str, run_id: str | None) -> dict[str, str]:
    """SSE StreamingResponse 统一响应头（此前三处复制粘贴）。"""
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Thread-ID": thread_id,
    }
    if run_id:
        headers["X-Run-ID"] = run_id
    return headers
