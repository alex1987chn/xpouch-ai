"""InvokeService persistence helpers.

将 InvokeService 的数据库读写逻辑下沉到 CRUD，减少 Service 对 ORM 细节的耦合。
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlmodel import Session

from models import SubTask, TaskSession


def create_running_task_session(session: Session, message: str, thread_id: str | None) -> TaskSession:
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
