"""后台 I/O 任务工具：不阻塞 LLM 主流程的落库/账本写入。

设计目标：
1. 不阻塞主流程（LLM 调用）
2. 确保数据最终一致性
3. 失败必须可见（日志），任务持有引用防 GC 中途丢弃

历史注记：曾有 AsyncTaskQueue（4 线程 ThreadPoolExecutor + submit + 统计），
但从未被用于提交任务（实际执行走 asyncio.to_thread / create_task），
2026-09-04 反模式清理时移除。
"""

from __future__ import annotations

import asyncio
from typing import Any

from utils.logger import logger

# 持有运行中的后台任务引用：CPython 文档明确警告无引用的任务可能被 GC
# 中途丢弃，且异常不会进入任何 handler
_background_tasks: set[asyncio.Task] = set()


def spawn_background(coro, *, label: str = "background") -> asyncio.Task:
    """启动后台任务（fire-and-forget 的安全形态）。

    - 持有强引用直至完成，防 GC 中途丢弃
    - done callback 记录异常（失败可见），并自动清理引用
    """
    task = asyncio.create_task(coro)
    _background_tasks.add(task)

    def _on_done(t: asyncio.Task) -> None:
        _background_tasks.discard(t)
        if not t.cancelled() and t.exception() is not None:
            logger.error("[%s] 后台任务失败: %s", label, t.exception(), exc_info=t.exception())

    task.add_done_callback(_on_done)
    return task


def _sync_save_wrapper(
    *,
    task_id: str,
    expert_type: str,
    output_result: str,
    artifact_data: dict[str, Any] | None = None,
    duration_ms: int | None = None,
) -> None:
    """在独立线程中保存专家执行结果。"""
    from agents.services.task_manager import save_expert_execution_result
    from database import Session, engine

    # 🔥 核心修复：在后台线程里创建全新的同步 Session
    # Session 的生命周期完全由这个后台线程控制，与主线程无关
    with Session(engine) as new_session:
        try:
            save_expert_execution_result(
                new_session,  # ✅ 传入新创建的 session，线程安全
                task_id,
                expert_type,
                output_result,
                artifact_data,
                duration_ms,
            )
        except Exception:
            new_session.rollback()  # 回滚防止脏数据
            # 专家结果/artifact 落库失败必须可见（此前静默吞掉，产出丢失无从排查）
            logger.exception(
                "[AsyncTaskQueue] 后台保存专家执行结果失败 task_id=%s expert=%s",
                task_id,
                expert_type,
            )


def _sync_append_run_event_wrapper(
    *,
    run_id: str,
    event_type: str,
    event_data: dict[str, Any] | None = None,
    thread_id: str | None = None,
    execution_plan_id: str | None = None,
    task_id: str | None = None,
    note: str | None = None,
) -> None:
    """在独立线程中写入运行事件。"""
    from crud.run_event import append_run_event_and_commit
    from database import Session, engine
    from models.enums import RunEventType

    with Session(engine) as new_session:
        try:
            append_run_event_and_commit(
                new_session,
                run_id=run_id,
                event_type=RunEventType(event_type),
                event_data=event_data,
                thread_id=thread_id,
                execution_plan_id=execution_plan_id,
                task_id=task_id,
                note=note,
            )
        except Exception:
            new_session.rollback()
            logger.exception(
                "[RunEvent] 后台写入运行事件失败 run_id=%s event=%s", run_id, event_type
            )


async def async_save_expert_result(
    task_id: str,
    expert_type: str,
    output_result: str,
    artifact_data: dict[str, Any] | None = None,
    duration_ms: int | None = None,
) -> None:
    """异步保存专家执行结果（线程池执行同步 DB 写入）。"""
    await asyncio.to_thread(
        _sync_save_wrapper,
        task_id=task_id,
        expert_type=expert_type,
        output_result=output_result,
        artifact_data=artifact_data,
        duration_ms=duration_ms,
    )


async def async_append_run_event(
    run_id: str,
    event_type: str,
    event_data: dict[str, Any] | None = None,
    thread_id: str | None = None,
    execution_plan_id: str | None = None,
    task_id: str | None = None,
    note: str | None = None,
) -> None:
    """异步追加运行事件（线程池执行同步 DB 写入）。"""
    await asyncio.to_thread(
        _sync_append_run_event_wrapper,
        run_id=run_id,
        event_type=event_type,
        event_data=event_data,
        thread_id=thread_id,
        execution_plan_id=execution_plan_id,
        task_id=task_id,
        note=note,
    )
