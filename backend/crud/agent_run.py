"""AgentRun 数据访问层。"""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Session

from models import AgentRun, RunStatus


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
    run = AgentRun(
        thread_id=thread_id,
        user_id=user_id,
        entrypoint=entrypoint,
        mode=mode,
        status=RunStatus.RUNNING,
        idempotency_key=idempotency_key,
        checkpoint_namespace=checkpoint_namespace,
        started_at=datetime.now(),
        updated_at=datetime.now(),
    )
    db.add(run)
    db.flush()
    return run


def mark_run_completed(db: Session, run: AgentRun) -> None:
    """标记运行完成。"""
    run.status = RunStatus.COMPLETED
    run.completed_at = datetime.now()
    run.updated_at = datetime.now()
    db.add(run)


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
