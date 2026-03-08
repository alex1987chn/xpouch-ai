"""AgentRun 数据访问层。"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlmodel import Session, select

from config import settings
from crud.run_event import emit_run_created, emit_run_started, emit_run_timed_out
from models import AgentRun, RunStatus, Thread
from utils.error_codes import ErrorCode
from utils.exceptions import AppError

ACTIVE_RUN_STATUSES = {
    RunStatus.QUEUED,
    RunStatus.RUNNING,
    RunStatus.RESUMING,
    RunStatus.WAITING_FOR_APPROVAL,
}


def derive_thread_status_from_run_status(status: RunStatus) -> str:
    """将运行时状态映射为线程展示态。"""
    if status == RunStatus.WAITING_FOR_APPROVAL:
        return "paused"
    if status in {RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.RESUMING}:
        return "running"
    return "idle"


def _sync_thread_status(db: Session, thread_id: str, status: RunStatus) -> None:
    """根据运行状态同步 Thread.status 作为展示缓存。"""
    thread = db.get(Thread, thread_id)
    if thread is None:
        return

    thread.status = derive_thread_status_from_run_status(status)
    thread.updated_at = datetime.now()
    db.add(thread)


def create_agent_run(
    db: Session,
    *,
    thread_id: str,
    user_id: str,
    entrypoint: str,
    mode: str,
    idempotency_key: str | None = None,
    checkpoint_namespace: str | None = None,
) -> AgentRun:
    """创建新的运行实例。"""
    started_at = datetime.now()
    run = AgentRun(
        thread_id=thread_id,
        user_id=user_id,
        entrypoint=entrypoint,
        mode=mode,
        status=RunStatus.RUNNING,
        idempotency_key=idempotency_key,
        checkpoint_namespace=checkpoint_namespace,
        started_at=started_at,
        updated_at=started_at,
        deadline_at=started_at + timedelta(seconds=settings.run_deadline_seconds),
    )
    db.add(run)
    db.flush()

    # 🔥 写入 run_created 事件到账本
    emit_run_created(
        db,
        run_id=run.id,
        thread_id=thread_id,
        entrypoint=entrypoint,
        mode=mode,
    )
    emit_run_started(
        db,
        run_id=run.id,
        thread_id=thread_id,
        current_node="entrypoint",
    )

    _sync_thread_status(db, thread_id, run.status)
    return run


def get_active_run_for_thread(
    db: Session,
    *,
    thread_id: str,
    user_id: str | None = None,
    exclude_run_id: str | None = None,
) -> AgentRun | None:
    """获取线程下当前活跃运行实例。"""
    statement = (
        select(AgentRun)
        .where(AgentRun.thread_id == thread_id)
        .where(AgentRun.status.in_(ACTIVE_RUN_STATUSES))
        .order_by(AgentRun.created_at.desc())
    )
    if user_id is not None:
        statement = statement.where(AgentRun.user_id == user_id)
    if exclude_run_id is not None:
        statement = statement.where(AgentRun.id != exclude_run_id)
    return db.exec(statement).first()


def ensure_no_active_run_for_thread(
    db: Session,
    *,
    thread_id: str,
    user_id: str | None = None,
    exclude_run_id: str | None = None,
) -> None:
    """确保线程下没有其他活跃运行实例。"""
    active_run = get_active_run_for_thread(
        db,
        thread_id=thread_id,
        user_id=user_id,
        exclude_run_id=exclude_run_id,
    )
    if active_run is None:
        return

    raise AppError(
        message="当前会话已有进行中的任务，请先等待完成、恢复或取消后再发起新任务",
        code=ErrorCode.ACTIVE_RUN_CONFLICT,
        status_code=409,
        details={
            "thread_id": thread_id,
            "active_run_id": active_run.id,
            "active_run_status": str(active_run.status),
            "current_node": active_run.current_node,
        },
    )


def mark_run_completed(db: Session, run: AgentRun) -> None:
    """标记运行完成。"""
    run.status = RunStatus.COMPLETED
    run.completed_at = datetime.now()
    run.updated_at = datetime.now()
    db.add(run)
    _sync_thread_status(db, run.thread_id, run.status)


def update_run_status(
    db: Session,
    run: AgentRun,
    status: RunStatus,
    *,
    current_node: str | None = None,
) -> None:
    """更新运行状态和当前节点。"""
    run.status = status
    if current_node is not None:
        run.current_node = current_node
    run.last_heartbeat_at = datetime.now()
    run.updated_at = datetime.now()
    db.add(run)
    _sync_thread_status(db, run.thread_id, run.status)


def mark_run_failed(
    db: Session,
    run: AgentRun,
    *,
    error_message: str,
    error_code: str | None = None,
) -> None:
    """标记运行失败。"""
    run.status = RunStatus.FAILED
    run.error_code = error_code
    run.error_message = error_message
    run.updated_at = datetime.now()
    db.add(run)
    _sync_thread_status(db, run.thread_id, run.status)


def update_run_status_by_id(
    db: Session,
    run_id: str,
    status: RunStatus,
    *,
    current_node: str | None = None,
) -> AgentRun | None:
    """按 ID 更新运行状态。"""
    run = db.get(AgentRun, run_id)
    if run is None:
        return None
    update_run_status(db, run, status, current_node=current_node)
    return run


def touch_run_heartbeat_by_id(
    db: Session,
    run_id: str,
    *,
    current_node: str | None = None,
) -> AgentRun | None:
    """更新运行实例心跳，可选同步当前节点。"""
    run = db.get(AgentRun, run_id)
    if run is None:
        return None
    if current_node is not None:
        run.current_node = current_node
    now = datetime.now()
    run.last_heartbeat_at = now
    run.updated_at = now
    db.add(run)
    return run


def mark_run_failed_by_id(
    db: Session,
    run_id: str,
    *,
    error_message: str,
    error_code: str | None = None,
) -> AgentRun | None:
    """按 ID 标记运行失败。"""
    run = db.get(AgentRun, run_id)
    if run is None:
        return None
    mark_run_failed(db, run, error_message=error_message, error_code=error_code)
    return run


def mark_run_timed_out_by_id(
    db: Session,
    run_id: str,
    *,
    error_message: str = "运行超时",
    error_code: str | None = ErrorCode.RUN_TIMED_OUT,
    current_node: str | None = None,
) -> AgentRun | None:
    """按 ID 将运行标记为超时。"""
    run = db.get(AgentRun, run_id)
    if run is None:
        return None
    run.status = RunStatus.TIMED_OUT
    run.current_node = current_node
    run.error_code = error_code
    run.error_message = error_message
    run.timed_out_at = datetime.now()
    run.updated_at = datetime.now()
    db.add(run)
    emit_run_timed_out(
        db,
        run_id=run.id,
        thread_id=run.thread_id,
        current_node=current_node,
        deadline_at=run.deadline_at.isoformat() if run.deadline_at else None,
    )
    _sync_thread_status(db, run.thread_id, run.status)
    return run


def mark_run_cancelled_by_id(
    db: Session,
    run_id: str,
    *,
    error_message: str = "运行已取消",
    error_code: str | None = ErrorCode.RUN_CANCELLED,
    current_node: str | None = None,
) -> AgentRun | None:
    """按 ID 将运行标记为取消。"""
    run = db.get(AgentRun, run_id)
    if run is None:
        return None
    run.status = RunStatus.CANCELLED
    run.current_node = current_node
    run.error_code = error_code
    run.error_message = error_message
    run.cancelled_at = datetime.now()
    run.updated_at = datetime.now()
    db.add(run)
    _sync_thread_status(db, run.thread_id, run.status)
    return run
