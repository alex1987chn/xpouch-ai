"""
RunEvent 数据访问层

提供运行事件账本的写入和查询功能。
所有写入操作都是 append-only，不允许修改或删除。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlmodel import Session, select

from models import RunEvent, RunEventType


def append_run_event(
    db: Session,
    *,
    run_id: str,
    event_type: RunEventType,
    event_data: dict[str, Any] | None = None,
    thread_id: str | None = None,
    execution_plan_id: str | None = None,
    task_id: str | None = None,
    note: str | None = None,
) -> RunEvent:
    """
    追加运行事件到账本。

    Args:
        db: 数据库会话
        run_id: 运行实例 ID
        event_type: 事件类型
        event_data: 事件上下文元数据（可选）
        thread_id: 关联的线程 ID（可选，用于快速查询）
        execution_plan_id: 关联的计划 ID（可选）
        task_id: 关联的任务 ID（可选）
        note: 备注（可选）

    Returns:
        新创建的 RunEvent 实例
    """
    event = RunEvent(
        run_id=run_id,
        event_type=event_type,
        event_data=event_data,
        thread_id=thread_id,
        execution_plan_id=execution_plan_id,
        task_id=task_id,
        timestamp=datetime.now(),
        note=note,
    )
    db.add(event)
    return event


def append_run_event_and_commit(
    db: Session,
    *,
    run_id: str,
    event_type: RunEventType,
    event_data: dict[str, Any] | None = None,
    thread_id: str | None = None,
    execution_plan_id: str | None = None,
    task_id: str | None = None,
    note: str | None = None,
) -> RunEvent:
    """
    追加运行事件并立即提交。

    用于需要立即持久化的关键事件（如运行创建、失败、取消等）。
    """
    event = append_run_event(
        db,
        run_id=run_id,
        event_type=event_type,
        event_data=event_data,
        thread_id=thread_id,
        execution_plan_id=execution_plan_id,
        task_id=task_id,
        note=note,
    )
    db.commit()
    return event


def get_run_events_by_run_id(
    db: Session,
    run_id: str,
    *,
    limit: int = 100,
    offset: int = 0,
) -> list[RunEvent]:
    """
    按运行实例 ID 查询事件时间线。

    Args:
        db: 数据库会话
        run_id: 运行实例 ID
        limit: 返回数量限制
        offset: 偏移量

    Returns:
        事件列表，按时间戳升序排列
    """
    return list(
        db.exec(
            select(RunEvent)
            .where(RunEvent.run_id == run_id)
            .order_by(RunEvent.timestamp.asc())
            .limit(limit)
            .offset(offset)
        ).all()
    )


def get_run_events_by_thread_id(
    db: Session,
    thread_id: str,
    *,
    limit: int = 200,
    offset: int = 0,
) -> list[RunEvent]:
    """
    按线程 ID 查询事件时间线。

    用于查看同一线程下所有运行的事件历史。

    Args:
        db: 数据库会话
        thread_id: 线程 ID
        limit: 返回数量限制
        offset: 偏移量

    Returns:
        事件列表，按时间戳升序排列
    """
    return list(
        db.exec(
            select(RunEvent)
            .where(RunEvent.thread_id == thread_id)
            .order_by(RunEvent.timestamp.asc())
            .limit(limit)
            .offset(offset)
        ).all()
    )


def get_latest_run_event(
    db: Session,
    run_id: str,
) -> RunEvent | None:
    """
    获取运行实例的最新事件。

    用于判断当前运行状态。
    """
    return db.exec(
        select(RunEvent)
        .where(RunEvent.run_id == run_id)
        .order_by(RunEvent.timestamp.desc())
        .limit(1)
    ).first()


def count_run_events_by_run_id(
    db: Session,
    run_id: str,
) -> int:
    """
    统计运行实例的事件数量。
    """
    return len(get_run_events_by_run_id(db, run_id, limit=10000))


# ============================================================================
# 便捷函数：常用事件写入
# ============================================================================


def emit_run_created(
    db: Session,
    *,
    run_id: str,
    thread_id: str,
    entrypoint: str,
    mode: str,
) -> RunEvent:
    """发送 RUN_CREATED 事件"""
    return append_run_event(
        db,
        run_id=run_id,
        event_type=RunEventType.RUN_CREATED,
        thread_id=thread_id,
        event_data={"entrypoint": entrypoint, "mode": mode},
    )


def emit_run_started(
    db: Session,
    *,
    run_id: str,
    thread_id: str,
    current_node: str | None = None,
) -> RunEvent:
    """发送 RUN_STARTED 事件"""
    return append_run_event(
        db,
        run_id=run_id,
        event_type=RunEventType.RUN_STARTED,
        thread_id=thread_id,
        event_data={"current_node": current_node},
    )


def emit_router_decided(
    db: Session,
    *,
    run_id: str,
    thread_id: str,
    mode: str,
    reason: str | None = None,
) -> RunEvent:
    """发送 ROUTER_DECIDED 事件"""
    return append_run_event(
        db,
        run_id=run_id,
        event_type=RunEventType.ROUTER_DECIDED,
        thread_id=thread_id,
        event_data={"mode": mode, "reason": reason},
    )


def emit_plan_created(
    db: Session,
    *,
    run_id: str,
    thread_id: str,
    execution_plan_id: str,
    task_count: int,
    plan_summary: str | None = None,
) -> RunEvent:
    """发送 PLAN_CREATED 事件"""
    return append_run_event(
        db,
        run_id=run_id,
        event_type=RunEventType.PLAN_CREATED,
        thread_id=thread_id,
        execution_plan_id=execution_plan_id,
        event_data={"task_count": task_count, "plan_summary": plan_summary},
    )


def emit_plan_updated(
    db: Session,
    *,
    run_id: str,
    thread_id: str,
    execution_plan_id: str,
    plan_version: int,
    task_count: int,
) -> RunEvent:
    """发送 PLAN_UPDATED 事件"""
    return append_run_event(
        db,
        run_id=run_id,
        event_type=RunEventType.PLAN_UPDATED,
        thread_id=thread_id,
        execution_plan_id=execution_plan_id,
        event_data={"plan_version": plan_version, "task_count": task_count},
    )


def emit_hitl_interrupted(
    db: Session,
    *,
    run_id: str,
    thread_id: str,
    execution_plan_id: str,
    plan_version: int,
) -> RunEvent:
    """发送 HITL_INTERRUPTED 事件"""
    return append_run_event(
        db,
        run_id=run_id,
        event_type=RunEventType.HITL_INTERRUPTED,
        thread_id=thread_id,
        execution_plan_id=execution_plan_id,
        event_data={"plan_version": plan_version},
    )


def emit_hitl_resumed(
    db: Session,
    *,
    run_id: str,
    thread_id: str,
    execution_plan_id: str,
    plan_version: int,
    plan_modified: bool,
) -> RunEvent:
    """发送 HITL_RESUMED 事件"""
    return append_run_event(
        db,
        run_id=run_id,
        event_type=RunEventType.HITL_RESUMED,
        thread_id=thread_id,
        execution_plan_id=execution_plan_id,
        event_data={"plan_version": plan_version, "plan_modified": plan_modified},
    )


def emit_hitl_rejected(
    db: Session,
    *,
    run_id: str,
    thread_id: str,
    execution_plan_id: str,
) -> RunEvent:
    """发送 HITL_REJECTED 事件"""
    return append_run_event(
        db,
        run_id=run_id,
        event_type=RunEventType.HITL_REJECTED,
        thread_id=thread_id,
        execution_plan_id=execution_plan_id,
    )


def emit_task_started(
    db: Session,
    *,
    run_id: str,
    thread_id: str,
    execution_plan_id: str,
    task_id: str,
    expert_type: str,
) -> RunEvent:
    """发送 TASK_STARTED 事件"""
    return append_run_event(
        db,
        run_id=run_id,
        event_type=RunEventType.TASK_STARTED,
        thread_id=thread_id,
        execution_plan_id=execution_plan_id,
        task_id=task_id,
        event_data={"expert_type": expert_type},
    )


def emit_task_completed(
    db: Session,
    *,
    run_id: str,
    thread_id: str,
    execution_plan_id: str,
    task_id: str,
    expert_type: str,
    has_artifact: bool,
    duration_ms: int | None = None,
) -> RunEvent:
    """发送 TASK_COMPLETED 事件"""
    return append_run_event(
        db,
        run_id=run_id,
        event_type=RunEventType.TASK_COMPLETED,
        thread_id=thread_id,
        execution_plan_id=execution_plan_id,
        task_id=task_id,
        event_data={
            "expert_type": expert_type,
            "has_artifact": has_artifact,
            "duration_ms": duration_ms,
        },
    )


def emit_task_failed(
    db: Session,
    *,
    run_id: str,
    thread_id: str,
    execution_plan_id: str,
    task_id: str,
    expert_type: str,
    error_message: str | None = None,
) -> RunEvent:
    """发送 TASK_FAILED 事件"""
    return append_run_event(
        db,
        run_id=run_id,
        event_type=RunEventType.TASK_FAILED,
        thread_id=thread_id,
        execution_plan_id=execution_plan_id,
        task_id=task_id,
        event_data={"expert_type": expert_type, "error_message": error_message},
    )


def emit_artifact_generated(
    db: Session,
    *,
    run_id: str,
    thread_id: str,
    execution_plan_id: str,
    task_id: str,
    artifact_id: str,
    artifact_type: str,
    artifact_title: str | None = None,
) -> RunEvent:
    """发送 ARTIFACT_GENERATED 事件"""
    return append_run_event(
        db,
        run_id=run_id,
        event_type=RunEventType.ARTIFACT_GENERATED,
        thread_id=thread_id,
        execution_plan_id=execution_plan_id,
        task_id=task_id,
        event_data={
            "artifact_id": artifact_id,
            "artifact_type": artifact_type,
            "artifact_title": artifact_title,
        },
    )


def emit_run_completed(
    db: Session,
    *,
    run_id: str,
    thread_id: str,
    duration_ms: int | None = None,
) -> RunEvent:
    """发送 RUN_COMPLETED 事件"""
    return append_run_event(
        db,
        run_id=run_id,
        event_type=RunEventType.RUN_COMPLETED,
        thread_id=thread_id,
        event_data={"duration_ms": duration_ms},
    )


def emit_run_failed(
    db: Session,
    *,
    run_id: str,
    thread_id: str,
    error_code: str | None = None,
    error_message: str | None = None,
) -> RunEvent:
    """发送 RUN_FAILED 事件"""
    return append_run_event(
        db,
        run_id=run_id,
        event_type=RunEventType.RUN_FAILED,
        thread_id=thread_id,
        event_data={"error_code": error_code, "error_message": error_message},
    )


def emit_run_cancelled(
    db: Session,
    *,
    run_id: str,
    thread_id: str,
    current_node: str | None = None,
) -> RunEvent:
    """发送 RUN_CANCELLED 事件"""
    return append_run_event(
        db,
        run_id=run_id,
        event_type=RunEventType.RUN_CANCELLED,
        thread_id=thread_id,
        event_data={"current_node": current_node},
    )


def emit_run_timed_out(
    db: Session,
    *,
    run_id: str,
    thread_id: str,
    current_node: str | None = None,
    deadline_at: str | None = None,
) -> RunEvent:
    """发送 RUN_TIMED_OUT 事件"""
    return append_run_event(
        db,
        run_id=run_id,
        event_type=RunEventType.RUN_TIMED_OUT,
        thread_id=thread_id,
        event_data={"current_node": current_node, "deadline_at": deadline_at},
    )
