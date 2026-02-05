"""
任务会话管理服务 (Task Manager)

负责 TaskSession 和 SubTask 的数据库操作，包括：
- 任务会话的创建、查询、更新
- 子任务的创建、状态更新
- 聚合结果的持久化

设计原则：
- 所有数据库操作集中管理，便于事务控制和错误处理
- 提供高层抽象，让 Node 代码只关注业务逻辑
- 统一日志格式，便于调试

Author: XPouch AI Team
Created: 2026-02-05
"""
from typing import Dict, Any, List, Optional
from sqlmodel import Session

from models import Message as MessageModel
from crud.task_session import (
    create_task_session_with_subtasks,
    get_task_session_by_thread,
    create_subtask,
    update_task_session_status,
)


# =============================================================================
# TaskSession 管理
# =============================================================================

def get_or_create_task_session(
    db: Session,
    thread_id: str,
    user_query: str,
    plan_summary: str,
    estimated_steps: int,
    subtasks_data: List[Any],
    execution_mode: str = "sequential"
) -> tuple[Any, bool]:
    """
    获取或创建任务会话

    如果指定 thread_id 的 TaskSession 已存在，则复用并更新；
    否则创建新的 TaskSession。

    Args:
        db: 数据库会话
        thread_id: 线程/会话标识
        user_query: 用户原始查询
        plan_summary: 执行策略概述
        estimated_steps: 预计步骤数
        subtasks_data: 子任务数据列表 (SubTaskCreate)
        execution_mode: 执行模式 (sequential/parallel)

    Returns:
        tuple: (task_session, is_reused)
            - task_session: TaskSession 对象
            - is_reused: 是否复用了已存在的会话

    Example:
        >>> task_session, reused = get_or_create_task_session(
        ...     db, thread_id="abc123", user_query="查询天气",
        ...     plan_summary="分步执行", estimated_steps=3,
        ...     subtasks_data=[subtask1, subtask2]
        ... )
        >>> print(f"Session: {task_session.session_id}, Reused: {reused}")
    """
    # 先检查是否已存在
    existing_session = get_task_session_by_thread(db, thread_id)

    if existing_session:
        print(f"[TaskManager] 复用已有 TaskSession: {existing_session.session_id}")

        # 更新已有 session 的信息
        existing_session.plan_summary = plan_summary
        existing_session.estimated_steps = estimated_steps
        existing_session.execution_mode = execution_mode
        db.add(existing_session)

        # 创建 SubTask 并关联到已有 session
        for subtask_data in subtasks_data:
            create_subtask(
                db=db,
                task_session_id=existing_session.session_id,
                expert_type=subtask_data.expert_type,
                task_description=subtask_data.task_description,
                sort_order=subtask_data.sort_order,
                input_data=subtask_data.input_data,
                execution_mode=subtask_data.execution_mode,
                depends_on=subtask_data.depends_on
            )

        db.commit()
        db.refresh(existing_session)
        print(f"[TaskManager] 已更新 TaskSession 并创建 {len(subtasks_data)} 个子任务")
        return existing_session, True

    # 创建新的 TaskSession
    task_session = create_task_session_with_subtasks(
        db=db,
        thread_id=thread_id,
        user_query=user_query,
        plan_summary=plan_summary,
        estimated_steps=estimated_steps,
        subtasks_data=subtasks_data,
        execution_mode=execution_mode
    )
    print(f"[TaskManager] 创建新 TaskSession: {task_session.session_id}")
    return task_session, False


def complete_task_session(
    db: Session,
    task_session_id: str,
    final_response: str
) -> None:
    """
    标记任务会话为已完成

    Args:
        db: 数据库会话
        task_session_id: 任务会话 ID
        final_response: 最终聚合结果

    Example:
        >>> complete_task_session(db, "session_abc", "所有任务已完成，结果是...")
    """
    update_task_session_status(
        db,
        task_session_id,
        "completed",
        final_response=final_response
    )
    print(f"[TaskManager] TaskSession {task_session_id} 已标记为完成")


# =============================================================================
# 消息持久化
# =============================================================================

def save_aggregator_message(
    db: Session,
    thread_id: str,
    content: str
) -> Optional[MessageModel]:
    """
    保存聚合器生成的最终消息到数据库

    Args:
        db: 数据库会话
        thread_id: 会话/线程 ID (对应 conversation_id)
        content: 消息内容

    Returns:
        MessageModel: 创建的消息记录，如果失败则返回 None

    Note:
        - Message.id 由数据库自动生成 (INTEGER 自增)
        - thread_id 用于关联到对话

    Example:
        >>> message = save_aggregator_message(db, "conv_123", "这是最终回复...")
        >>> print(f"消息已保存: {message.id}")
    """
    try:
        message_record = MessageModel(
            thread_id=thread_id,
            role="assistant",
            content=content
        )
        db.add(message_record)
        db.commit()
        print(f"[TaskManager] 聚合消息已持久化, thread_id={thread_id}, msg_id={message_record.id}")
        return message_record
    except Exception as e:
        print(f"[TaskManager] 消息持久化失败: {e}")
        db.rollback()
        return None


# =============================================================================
# 子任务管理
# =============================================================================

def update_subtask_status(
    db: Session,
    subtask_id: str,
    status: str,
    output_result: Optional[str] = None,
    error_message: Optional[str] = None
) -> bool:
    """
    更新子任务状态

    Args:
        db: 数据库会话
        subtask_id: 子任务 ID
        status: 新状态 (pending/running/completed/failed)
        output_result: 执行结果（可选）
        error_message: 错误信息（可选）

    Returns:
        bool: 是否更新成功

    Example:
        >>> update_subtask_status(db, "subtask_1", "completed", output_result="结果数据")
    """
    from crud.task_session import update_subtask

    try:
        update_subtask(
            db=db,
            subtask_id=subtask_id,
            status=status,
            output_result=output_result,
            error_message=error_message
        )
        print(f"[TaskManager] 子任务 {subtask_id} 状态更新为: {status}")
        return True
    except Exception as e:
        print(f"[TaskManager] 子任务状态更新失败: {e}")
        return False


def get_subtask_by_id(db: Session, subtask_id: str) -> Optional[Any]:
    """
    根据 ID 获取子任务

    Args:
        db: 数据库会话
        subtask_id: 子任务 ID

    Returns:
        SubTask 对象，如果不存在则返回 None
    """
    from crud.task_session import get_subtask
    return get_subtask(db, subtask_id)
