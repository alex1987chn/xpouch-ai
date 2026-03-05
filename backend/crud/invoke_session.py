"""Invoke 持久化层：仅负责事务与 TaskSession/SubTask 的读写。

供 InvokeService（编排层）调用，Service 不直接依赖 ORM 字段结构。
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlmodel import Session

from models import SubTask, TaskSession


class InvokePersistence:
    """
    双模调用的持久化门面：创建会话、保存结果、标记完成/失败。
    编排层只传高层 payload，不关心 SubTask/TaskSession 字段细节。
    """

    def __init__(self, session: Session) -> None:
        self.session = session

    def create_task_session(self, message: str, thread_id: str | None) -> TaskSession:
        """创建 running 状态 TaskSession，提交并返回。"""
        return create_running_task_session(self.session, message, thread_id)

    def save_auto_result(
        self,
        task_session: TaskSession,
        task_list: list[dict[str, Any]],
        final_response: str,
    ) -> None:
        """Auto 模式：保存子任务列表并将会话标记为完成。"""
        create_subtasks_for_auto_mode(self.session, task_session.session_id, task_list)
        mark_task_session_completed(self.session, task_session, final_response)

    def save_direct_result(
        self,
        task_session: TaskSession,
        subtask_payload: dict[str, Any],
        subtask_result: dict[str, Any],
        final_response: str,
    ) -> None:
        """Direct 模式：保存单个子任务并将会话标记为完成。"""
        create_subtask_for_direct_mode(
            self.session, task_session.session_id, subtask_payload, subtask_result
        )
        mark_task_session_completed(self.session, task_session, final_response)

    def mark_completed(self, task_session: TaskSession, response: str) -> None:
        """将会话标记为完成（仅更新状态，不写子任务）。"""
        mark_task_session_completed(self.session, task_session, response)

    def mark_failed(self, task_session: TaskSession, error: str) -> None:
        """将会话标记为失败并提交。"""
        mark_task_session_failed(self.session, task_session, error)


def create_running_task_session(
    session: Session, message: str, thread_id: str | None
) -> TaskSession:
    session_id = thread_id or str(uuid.uuid4())
    task_session = TaskSession(
        session_id=session_id,
        user_query=message,
        status="running",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session.add(task_session)
    session.commit()
    session.refresh(task_session)
    return task_session


def mark_task_session_completed(session: Session, task_session: TaskSession, response: str) -> None:
    task_session.final_response = response
    task_session.status = "completed"
    task_session.completed_at = datetime.now()
    task_session.updated_at = datetime.now()
    session.add(task_session)


def mark_task_session_failed(session: Session, task_session: TaskSession, error: str) -> None:
    task_session.status = "failed"
    task_session.final_response = f"执行失败: {error}"
    task_session.updated_at = datetime.now()
    session.add(task_session)
    session.commit()


def create_subtasks_for_auto_mode(
    session: Session,
    session_id: str,
    task_list: list[dict[str, Any]],
) -> None:
    for subtask in task_list:
        artifacts = subtask.get("artifact")
        if artifacts:
            artifacts = [artifacts] if isinstance(artifacts, dict) else artifacts

        db_subtask = SubTask(
            id=subtask["id"],
            expert_type=subtask["expert_type"],
            task_description=subtask["description"],
            input_data=subtask.get("input_data", {}),
            status=subtask["status"],
            output_result=subtask.get("output_result"),
            artifacts=artifacts,
            started_at=subtask.get("started_at"),
            completed_at=subtask.get("completed_at"),
            created_at=subtask.get("created_at"),
            updated_at=subtask.get("updated_at"),
            task_session_id=session_id,
        )
        session.add(db_subtask)


def create_subtask_for_direct_mode(
    session: Session,
    session_id: str,
    subtask_dict: dict[str, Any],
    result: dict[str, Any],
) -> None:
    db_subtask = SubTask(
        id=subtask_dict["id"],
        expert_type=subtask_dict["expert_type"],
        task_description=subtask_dict["description"],
        input_data=subtask_dict.get("input_data", {}),
        status=result.get("status", "completed"),
        output_result={"content": result.get("output_result", "")},
        started_at=result.get("started_at"),
        completed_at=result.get("completed_at"),
        created_at=subtask_dict["created_at"],
        updated_at=subtask_dict["updated_at"],
        task_session_id=session_id,
    )
    session.add(db_subtask)
