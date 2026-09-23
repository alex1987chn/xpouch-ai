"""专家执行消息：消息表是专家执行状态的一等真相源（2026-09-23 交互重构）。

形态（对齐 Manus 的过程消息流；决策见 docs/DECISIONS.md）：
- task 开始时插入 running 态的助手消息，完成/失败时**原位更新**（产物引用、
  工具统计快照、摘要）——执行中刷新会话也能从库里读到完整现场；
- task.* SSE 事件携带同一条消息的 id 与载荷，前端实时流与库是同一份数据，
  不再有「前端拼装执行史」的中间态；
- 工具明细的真相源仍是 runevent 账本；消息 extra_data 里的 tool_stats 是
  完成时刻的聚合快照（派生数据，与 task.completed 的 duration 同性质）。

替代的旧机制（已退役）：思考卡内的任务步骤/产物卡/工具行（ThinkingProcess
的 execution 渲染）、thinkingStepsFromTimeline 的 task/tool 重建分支。
"""

from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from models.domain.message import Message
from models.domain.run_event import RunEvent
from models.enums import RunEventType
from utils.logger import logger

EXPERT_MESSAGE_KIND = "expert_result"
RUN_THINKING_MESSAGE_KIND = "run_thinking"


def insert_run_thinking_message(db: Session, *, thread_id: str, run_id: str | None) -> int | None:
    """插入本轮复杂执行的「思考载体」消息（content 恒空——思考步骤不入库，
    真相源是 runevent 账本，前端刷新时重建挂回本条）。

    行顺序即因果顺序：插在专家消息之前（commander 规划落库时），刷新回放
    时思考卡自然位于专家卡与聚合正文之前。幂等（同 run 已有思考行即返回
    其 id）：驳回修订会重跑 commander，不得产生第二行。
    """
    rows = db.exec(
        select(Message).where(Message.thread_id == thread_id, Message.role == "assistant")
    ).all()
    for m in rows:
        extra = m.extra_data or {}
        if extra.get("message_kind") == RUN_THINKING_MESSAGE_KIND and extra.get("run_id") == run_id:
            return m.id
    msg = Message(
        thread_id=thread_id,
        role="assistant",
        content="",
        extra_data={
            "message_kind": RUN_THINKING_MESSAGE_KIND,
            "run_id": run_id,
        },
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg.id


def insert_run_thinking_message_standalone(
    *,
    thread_id: str,
    run_id: str | None,
) -> int | None:
    """线程池形态（独立 Session），commander 经 asyncio.to_thread 调用。"""
    from database import Session, engine

    with Session(engine) as db:
        return insert_run_thinking_message(db, thread_id=thread_id, run_id=run_id)


def insert_expert_message_standalone(
    *,
    thread_id: str,
    task_id: str,
    expert_type: str,
    description: str,
    sort_order: int,
    total_steps: int,
) -> int | None:
    """线程池形态的插入（独立 Session），返回 message id 供事件携带。"""
    from database import Session, engine

    with Session(engine) as db:
        msg = insert_expert_message(
            db,
            thread_id=thread_id,
            task_id=task_id,
            expert_type=expert_type,
            description=description,
            sort_order=sort_order,
            total_steps=total_steps,
        )
        return msg.id if msg else None


def fail_expert_message_standalone(*, thread_id: str, task_id: str, error: str) -> None:
    """线程池形态的失败更新（独立 Session）。"""
    from database import Session, engine

    with Session(engine) as db:
        fail_expert_message(db, thread_id=thread_id, task_id=task_id, error=error)


def _expert_extra(
    *,
    expert_type: str,
    task_id: str,
    description: str,
    sort_order: int,
    total_steps: int,
    status: str,
) -> dict[str, Any]:
    """专家消息的 extra_data 骨架（状态字段随生命周期更新）。"""
    return {
        "message_kind": EXPERT_MESSAGE_KIND,
        "expert_type": expert_type,
        "task_id": task_id,
        "task_description": description,
        "sort_order": sort_order,
        "total_steps": total_steps,
        "status": status,
        "artifact_ids": [],
        "tool_stats": None,
        "duration_ms": None,
        "summary": None,
        "error": None,
    }


def insert_expert_message(
    db: Session,
    *,
    thread_id: str,
    task_id: str,
    expert_type: str,
    description: str,
    sort_order: int,
    total_steps: int,
) -> Message | None:
    """task 开始：插入 running 态专家消息（同步调用，跑在线程池）。"""
    msg = Message(
        thread_id=thread_id,
        role="assistant",
        content=description,
        extra_data=_expert_extra(
            expert_type=expert_type,
            task_id=task_id,
            description=description,
            sort_order=sort_order,
            total_steps=total_steps,
            status="running",
        ),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    logger.info(
        "[ExpertMessage] 插入 running 态专家消息: task=%s expert=%s msg=%s",
        task_id,
        expert_type,
        msg.id,
    )
    return msg


def _find_expert_message(db: Session, thread_id: str, task_id: str) -> Message | None:
    """按 task_id 定位该线程的专家消息（extra_data 是 JSON 列，thread 内
    助手消息量级是个位数，内存过滤比 JSONB 表达式更可移植且够快）。"""
    rows = db.exec(
        select(Message).where(Message.thread_id == thread_id, Message.role == "assistant")
    ).all()
    for m in rows:
        extra = m.extra_data or {}
        if extra.get("message_kind") == EXPERT_MESSAGE_KIND and extra.get("task_id") == task_id:
            return m
    return None


def _tool_snapshot_from_ledger(db: Session, run_id: str | None, task_id: str) -> dict[str, Any]:
    """从 runevent 账本聚合该任务的工具调用：聚合统计 + 逐次明细（完成时刻
    快照，与 duration 同性质——真相源仍是账本）。明细截 50 条防超长。"""
    stats: dict[str, int] = {"count": 0, "total_ms": 0, "failed": 0}
    calls: list[dict[str, Any]] = []
    if run_id:
        rows = db.exec(
            select(RunEvent.event_data).where(
                RunEvent.run_id == run_id, RunEvent.event_type == RunEventType.TOOL_RESULT
            )
        ).all()
        for data in rows:
            if (data or {}).get("task_id") != task_id:
                continue
            stats["count"] += 1
            duration_ms = int(data.get("duration_ms") or 0)
            stats["total_ms"] += duration_ms
            success = data.get("success") is True
            if not success:
                stats["failed"] += 1
            calls.append(
                {
                    "tool": str(data.get("tool") or "unknown"),
                    "duration_ms": duration_ms,
                    "success": success,
                    "source": str(data.get("source") or "builtin"),
                }
            )
    return {"tool_stats": stats, "tool_calls": calls[:50]}


def complete_expert_message(
    db: Session,
    *,
    thread_id: str,
    task_id: str,
    run_id: str | None,
    artifact_ids: list[str],
    duration_ms: int | None,
    summary: str | None,
) -> Message | None:
    """task 完成：原位更新为 completed（含产物引用与工具统计快照）。"""
    msg = _find_expert_message(db, thread_id, task_id)
    if msg is None:
        logger.warning("[ExpertMessage] 完成更新未找到专家消息: task=%s", task_id)
        return None
    extra = dict(msg.extra_data or {})
    extra.update(
        status="completed",
        artifact_ids=artifact_ids,
        **_tool_snapshot_from_ledger(db, run_id, task_id),
        duration_ms=duration_ms,
        summary=summary,
    )
    msg.extra_data = extra
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def fail_expert_message(
    db: Session,
    *,
    thread_id: str,
    task_id: str,
    error: str,
) -> Message | None:
    """task 失败：原位更新为 failed（如实保留错误，供回看诊断）。"""
    msg = _find_expert_message(db, thread_id, task_id)
    if msg is None:
        logger.warning("[ExpertMessage] 失败更新未找到专家消息: task=%s", task_id)
        return None
    extra = dict(msg.extra_data or {})
    extra.update(status="failed", error=error[:300])
    msg.extra_data = extra
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg
