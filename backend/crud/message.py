"""Message 数据访问层（消息落库唯一入口）。

此前 Message 的构造散落在 thread_service（用户消息/助手消息）与
recovery_service（HITL 驳回反馈）三处；统一收敛到本模块，
保证时间戳口径（utc_now_naive）与 extra_data 结构的一致性。
"""

from __future__ import annotations

from typing import Any

from sqlmodel import Session

from models import Message
from utils.time import utc_now_naive


def create_message(
    db: Session,
    *,
    thread_id: str,
    role: str,
    content: str,
    extra_data: dict[str, Any] | None = None,
) -> Message:
    """创建消息记录。

    只 add 不 commit——事务提交时机由调用方决定
    （如 recovery_service 在同一事务里连带取消 run，thread_service
    在同事务里更新线程时间戳后统一提交）。
    """
    message = Message(
        thread_id=thread_id,
        role=role,
        content=content,
        extra_data=extra_data,
        timestamp=utc_now_naive(),
    )
    db.add(message)
    return message


def create_user_message(db: Session, *, thread_id: str, content: str) -> Message:
    """用户消息便捷入口。"""
    return create_message(db, thread_id=thread_id, role="user", content=content)


def create_assistant_message(
    db: Session,
    *,
    thread_id: str,
    content: str,
    thinking_data: dict[str, Any] | None = None,
    frontend_message_id: str | None = None,
) -> Message:
    """助手消息便捷入口（thinking/前端消息 ID 关联进 extra_data）。"""
    extra_data: dict[str, Any] = {}
    if thinking_data:
        extra_data["thinking"] = thinking_data
    if frontend_message_id:
        extra_data["frontend_message_id"] = frontend_message_id
    return create_message(
        db,
        thread_id=thread_id,
        role="assistant",
        content=content,
        extra_data=extra_data or None,
    )
