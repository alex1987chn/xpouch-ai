"""
会话清理服务（ARCH-12）。

目标：
- 定时回收长时间未活跃的会话线程
- 修复异常中断后长期停留在 running 的线程状态
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta
from typing import Any

from sqlmodel import Session, select

from database import engine
from models import Thread
from utils.logger import logger

THREAD_RETENTION_DAYS = int(os.getenv("THREAD_RETENTION_DAYS", "30"))
STALE_RUNNING_THREAD_MINUTES = int(os.getenv("STALE_RUNNING_THREAD_MINUTES", "60"))
SESSION_CLEANUP_INTERVAL_SECONDS = int(os.getenv("SESSION_CLEANUP_INTERVAL_SECONDS", "3600"))


def _cleanup_once() -> dict[str, Any]:
    """
    执行一次清理并返回统计信息。

    规则：
    - running 且长时间无更新 -> 重置为 idle
    - idle/paused 且超过保留周期 -> 删除线程（级联删除消息与关联数据）
    """
    now = datetime.now()
    stale_running_before = now - timedelta(minutes=STALE_RUNNING_THREAD_MINUTES)
    expired_before = now - timedelta(days=THREAD_RETENTION_DAYS)

    stale_running_reset = 0
    expired_deleted = 0

    with Session(engine) as session:
        stale_running_threads = session.exec(
            select(Thread).where(Thread.status == "running", Thread.updated_at < stale_running_before)
        ).all()
        for thread in stale_running_threads:
            thread.status = "idle"
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
            session.delete(thread)
            expired_deleted += 1

        if stale_running_reset or expired_deleted:
            session.commit()
        else:
            session.rollback()

    return {
        "stale_running_reset": stale_running_reset,
        "expired_deleted": expired_deleted,
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
            if stats["stale_running_reset"] or stats["expired_deleted"]:
                logger.info("[SessionCleanup] 完成一次清理: %s", stats)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[SessionCleanup] 清理执行失败: %s", exc)
        await asyncio.sleep(SESSION_CLEANUP_INTERVAL_SECONDS)
