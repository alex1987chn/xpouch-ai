"""
会话清理服务（ARCH-12）。

目标：
- 定时回收长时间未活跃的会话线程
- 修复异常中断后长期停留在 running 的线程状态
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import and_, or_
from sqlmodel import Session, select

from config import settings
from crud.agent_run import derive_thread_status_from_run_status, mark_run_timed_out_by_id
from database import engine
from models import AgentRun, ExecutionPlan, RunStatus, Thread
from utils.logger import logger

THREAD_RETENTION_DAYS = settings.thread_retention_days
STALE_RUNNING_THREAD_MINUTES = max(5, settings.request_timeout_seconds // 60)
SESSION_CLEANUP_INTERVAL_SECONDS = settings.session_cleanup_interval_minutes * 60


def _purge_thread(session: Session, thread: Thread) -> list[str] | None:
    """删除过期线程及其全部子数据，成功时返回其 run id 列表（供 checkpoint 清理），失败返回 None。

    - 子表（message/tasksession/agentrun/executionplan/subtask/runevent）的外键
      已由迁移 20260903_094500 统一为级联删除/SET NULL（部署时 alembic 先于应用执行），
      删除 thread 即自动清理整棵子树。
    - 这里仍显式删除 executionplan / agentrun，保证在仅部分级联生效的库上顺序正确。
    - 逐线程 savepoint 隔离：单个线程删除失败只回滚自身，不影响本轮其他清理
      （历史上一个线程的外键违例会把整轮清理事务一起顶崩）。
    """
    try:
        with session.begin_nested():
            execution_plans = session.exec(
                select(ExecutionPlan).where(ExecutionPlan.thread_id == thread.id)
            ).all()
            agent_runs = session.exec(select(AgentRun).where(AgentRun.thread_id == thread.id)).all()

            if thread.execution_plan_id is not None:
                thread.execution_plan_id = None
                session.add(thread)
                session.flush()

            for execution_plan in execution_plans:
                session.delete(execution_plan)

            for agent_run in agent_runs:
                session.delete(agent_run)

            session.delete(thread)
        return [run.id for run in agent_runs]
    except Exception as exc:  # noqa: BLE001
        logger.warning("[SessionCleanup] 删除线程 %s 失败，已跳过: %s", thread.id, exc)
        return None


def _cleanup_once() -> dict[str, Any]:
    """
    执行一次清理并返回统计信息。

    规则：
    - 历史遗留的 running 线程展示态 -> 按最近一次 AgentRun 重新同步
    - idle/paused 且超过保留周期 -> 删除线程（级联删除消息与关联数据）
    """
    now = datetime.now()
    stale_running_before = now - timedelta(minutes=STALE_RUNNING_THREAD_MINUTES)
    expired_before = now - timedelta(days=THREAD_RETENTION_DAYS)

    stale_running_reset = 0
    stale_run_timeout = 0
    expired_deleted = 0
    # 需要异步清理 checkpoint 的目标：(thread_id, [run_id, ...])，由异步循环统一执行
    checkpoint_targets: list[tuple[str, list[str]]] = []

    with Session(engine) as session:
        stale_runs = session.exec(
            select(AgentRun).where(
                AgentRun.status.in_([RunStatus.RUNNING, RunStatus.RESUMING]),
                or_(
                    and_(AgentRun.deadline_at.is_not(None), AgentRun.deadline_at < now),
                    AgentRun.updated_at < stale_running_before,
                ),
            )
        ).all()
        for run in stale_runs:
            timed_out = mark_run_timed_out_by_id(
                session,
                run.id,
                error_message="后台清理任务检测到运行长时间无心跳，已标记为超时",
                current_node=run.current_node,
            )
            if timed_out is not None:
                stale_run_timeout += 1
                checkpoint_targets.append((run.thread_id, [run.id]))

        stale_running_threads = session.exec(
            select(Thread).where(
                Thread.status == "running", Thread.updated_at < stale_running_before
            )
        ).all()
        for thread in stale_running_threads:
            latest_run = session.exec(
                select(AgentRun)
                .where(AgentRun.thread_id == thread.id)
                .order_by(AgentRun.created_at.desc())
            ).first()
            thread.status = (
                derive_thread_status_from_run_status(latest_run.status)
                if latest_run is not None
                else "idle"
            )
            thread.updated_at = now
            session.add(thread)
            stale_running_reset += 1

        expired_threads = session.exec(
            select(Thread).where(
                Thread.status.in_(["idle", "paused"]),
                Thread.updated_at < expired_before,
            )
        ).all()
        for thread in expired_threads:
            purged_run_ids = _purge_thread(session, thread)
            if purged_run_ids is not None:
                expired_deleted += 1
                checkpoint_targets.append((thread.id, purged_run_ids))

        if stale_run_timeout or stale_running_reset or expired_deleted:
            session.commit()
        else:
            session.rollback()

    return {
        "stale_run_timeout": stale_run_timeout,
        "stale_running_reset": stale_running_reset,
        "expired_deleted": expired_deleted,
        "checkpoint_targets": checkpoint_targets,
        "retention_days": THREAD_RETENTION_DAYS,
        "stale_running_minutes": STALE_RUNNING_THREAD_MINUTES,
    }


async def run_session_cleanup_loop() -> None:
    """后台定时清理任务。"""
    logger.info(
        "[SessionCleanup] 启动 | interval=%ss retention_days=%s stale_running_minutes=%s",
        SESSION_CLEANUP_INTERVAL_SECONDS,
        THREAD_RETENTION_DAYS,
        STALE_RUNNING_THREAD_MINUTES,
    )
    while True:
        try:
            stats = await asyncio.to_thread(_cleanup_once)
            if (
                stats["stale_run_timeout"]
                or stats["stale_running_reset"]
                or stats["expired_deleted"]
            ):
                logger.info("[SessionCleanup] 完成一次清理: %s", stats)
            # run 终态/线程删除后清理对应 checkpoint（LangGraph 无自动 TTL）
            for target_thread_id, run_ids in stats.get("checkpoint_targets", []):
                from utils.db import delete_checkpoints_for_thread

                await delete_checkpoints_for_thread(target_thread_id, run_ids)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[SessionCleanup] 清理执行失败: %s", exc)
        await asyncio.sleep(SESSION_CLEANUP_INTERVAL_SECONDS)
