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
from typing import TYPE_CHECKING, Any

from utils.logger import logger

if TYPE_CHECKING:
    from event_types.events import SSEEvent

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
    thread_id: str | None = None,
    run_id: str | None = None,
    artifact_id: str | None = None,
) -> bool:
    """在独立线程中保存专家执行结果，并把专家消息更新为终态。返回是否成功。

    消息表是专家执行状态的真相源：产物落库成功后原位更新消息（completed +
    产物引用 + 工具统计快照）；落库失败则如实标 failed（error="结果保存失败"），
    不留 running 态僵尸。
    """
    from agents.services.task_manager import save_expert_execution_result
    from database import Session, engine
    from services.chat.expert_message import complete_expert_message, fail_expert_message

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
            if thread_id:
                try:
                    fail_expert_message(
                        new_session,
                        thread_id=thread_id,
                        task_id=str(task_id),
                        error="结果保存失败（持久化异常）",
                    )
                except Exception:
                    new_session.rollback()
                    logger.exception("[AsyncTaskQueue] 失败态专家消息更新失败 task=%s", task_id)
            return {"ok": False}

    # 产物已落库：专家消息更新为 completed（含工具统计快照）
    payload: dict[str, Any] = {"ok": True}
    if thread_id:
        try:
            with Session(engine) as msg_session:
                summary = (output_result or "").strip().splitlines()
                msg = complete_expert_message(
                    msg_session,
                    thread_id=thread_id,
                    task_id=str(task_id),
                    run_id=run_id,
                    artifact_ids=[artifact_id] if artifact_id else [],
                    duration_ms=duration_ms,
                    summary=summary[0][:120] if summary else None,
                )
            if msg is not None:
                payload["message_id"] = msg.id
                payload["tool_stats"] = (msg.extra_data or {}).get("tool_stats")
                payload["tool_calls"] = (msg.extra_data or {}).get("tool_calls")
        except Exception:
            logger.exception("[AsyncTaskQueue] 专家消息完成态更新失败 task=%s", task_id)
    return payload


def _sync_mark_subtask_running(task_id: str) -> bool:
    """在独立线程中把子任务标为 running（顺带落 started_at）。返回是否成功。"""
    from crud.execution_plan import update_subtask_status
    from database import Session, engine
    from models.enums import TaskStatus

    with Session(engine) as new_session:
        try:
            updated = update_subtask_status(new_session, task_id, TaskStatus.RUNNING)
            if updated is None:
                # 计划可能已被修订替换（旧行不存在）：按"没这条任务"记一条警告即可，
                # 不是什么异常路径，也不该改前端语义。
                logger.warning("[AsyncTaskQueue] 任务开始落库跳过：SubTask 不存在 %s", task_id)
                return False
            return True
        except Exception:
            new_session.rollback()
            logger.exception("[AsyncTaskQueue] 任务开始时刻落库失败 task_id=%s", task_id)
            return False


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


async def async_mark_subtask_running(task_id: str) -> bool:
    """把子任务标为 running 并落 started_at（线程池执行同步 DB 写）。

    为什么单独一支而不是塞进 `async_save_expert_result`：开始与结束发生在两个时刻，
    中间是整段执行（可能几分钟）。开始时刻必须**在任务真正开始时**写下，否则
    "这个任务跑了多久"永远只能从完成时刻倒推（且跨进程重启就断线）。

    失败只告警不抛：它是可观测性补充，不该因为一次 DB 抖动打断任务执行。
    """
    return await asyncio.to_thread(_sync_mark_subtask_running, task_id)


async def async_save_expert_result(
    task_id: str,
    expert_type: str,
    output_result: str,
    artifact_data: dict[str, Any] | None = None,
    duration_ms: int | None = None,
    artifact_event: SSEEvent | None = None,
    task_completed_event: SSEEvent | None = None,
    thread_id: str | None = None,
    run_id: str | None = None,
    artifact_id: str | None = None,
) -> None:
    """异步保存专家执行结果（线程池执行同步 DB 写入），并把专家消息推到终态。

    artifact_event / task_completed_event：都遵循「产物/终态已持久化，收到即可查」
    ——必须在**落库成功之后**发射（保存失败则不发：不存在的东西不宣称完成）。
    task_completed_event 在发射前补上消息终态字段（message_id / tool_stats），
    前端用它覆盖同 id 的专家消息，与库保持一字不差。落库失败时经 emit_event
    告知前端（本协程运行在事件循环、继承节点的图上下文）；无图上下文
    （如单测直调）时 emit_event 为 no-op，日志兜底。
    """
    result = await asyncio.to_thread(
        _sync_save_wrapper,
        task_id=task_id,
        expert_type=expert_type,
        output_result=output_result,
        artifact_data=artifact_data,
        duration_ms=duration_ms,
        thread_id=thread_id,
        run_id=run_id,
        artifact_id=artifact_id,
    )
    if not result.get("ok"):
        try:
            from agents.event_stream import emit_event
            from utils.event_generator import event_error

            await emit_event(
                event_error(
                    "PERSISTENCE_WARNING",
                    f"{expert_type} 的产出结果未能持久化，本轮内容可能不会保存",
                )
            )
        except Exception:
            logger.debug("[AsyncTaskQueue] 持久化失败通知未送达 task_id=%s", task_id)
        return
    try:
        from agents.event_stream import emit_event

        if task_completed_event is not None:
            if result.get("message_id") is not None:
                task_completed_event.data["message_id"] = result["message_id"]
            if result.get("tool_stats") is not None:
                task_completed_event.data["tool_stats"] = result["tool_stats"]
            if result.get("tool_calls") is not None:
                task_completed_event.data["tool_calls"] = result["tool_calls"]
            await emit_event(task_completed_event)
        if artifact_event is not None:
            await emit_event(artifact_event)
    except Exception:
        logger.exception("[AsyncTaskQueue] 完成事件未送达 task_id=%s", task_id)


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
