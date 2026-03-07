"""Invoke 持久化层：仅负责事务与 ExecutionPlan/SubTask 的读写。

供 InvokeService（编排层）调用，Service 不直接依赖 ORM 字段结构。
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlmodel import Session

from crud.task_session import create_artifacts_batch
from models import ExecutionPlan, SubTask
from schemas import ArtifactCreate


class InvokePersistence:
    """
    双模调用的持久化门面：创建执行计划、保存结果、标记完成/失败。
    编排层只传高层 payload，不关心 SubTask/ExecutionPlan 字段细节。
    """

    def __init__(self, session: Session) -> None:
        self.session = session

    def create_execution_plan(
        self, message: str, thread_id: str, run_id: str | None = None
    ) -> ExecutionPlan:
        """创建 running 状态 ExecutionPlan，并挂到当前事务。"""
        return create_running_execution_plan(self.session, message, thread_id, run_id)

    def save_auto_result(
        self,
        execution_plan: ExecutionPlan,
        task_list: list[dict[str, Any]],
        final_response: str,
    ) -> None:
        """Auto 模式：保存子任务列表并将会话标记为完成。"""
        create_subtasks_for_auto_mode(self.session, execution_plan.id, task_list)
        mark_execution_plan_completed(self.session, execution_plan, final_response)

    def save_direct_result(
        self,
        execution_plan: ExecutionPlan,
        subtask_payload: dict[str, Any],
        subtask_result: dict[str, Any],
        final_response: str,
    ) -> None:
        """Direct 模式：保存单个子任务并将会话标记为完成。"""
        create_subtask_for_direct_mode(
            self.session, execution_plan.id, subtask_payload, subtask_result
        )
        mark_execution_plan_completed(self.session, execution_plan, final_response)

    def mark_completed(self, execution_plan: ExecutionPlan, response: str) -> None:
        """将执行计划标记为完成（仅更新状态，不写子任务）。"""
        mark_execution_plan_completed(self.session, execution_plan, response)

    def mark_failed(self, execution_plan: ExecutionPlan, error: str) -> None:
        """将执行计划标记为失败。"""
        mark_execution_plan_failed(self.session, execution_plan, error)


def create_running_execution_plan(
    session: Session, message: str, thread_id: str, run_id: str | None = None
) -> ExecutionPlan:
    execution_plan = ExecutionPlan(
        id=str(uuid.uuid4()),
        thread_id=thread_id,
        run_id=run_id,
        user_query=message,
        status="running",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session.add(execution_plan)
    session.flush()
    return execution_plan


def mark_execution_plan_completed(
    session: Session, execution_plan: ExecutionPlan, response: str
) -> None:
    execution_plan.final_response = response
    execution_plan.status = "completed"
    execution_plan.completed_at = datetime.now()
    execution_plan.updated_at = datetime.now()
    session.add(execution_plan)


def mark_execution_plan_failed(session: Session, execution_plan: ExecutionPlan, error: str) -> None:
    execution_plan.status = "failed"
    execution_plan.final_response = f"执行失败: {error}"
    execution_plan.updated_at = datetime.now()
    session.add(execution_plan)


def create_subtasks_for_auto_mode(
    session: Session,
    execution_plan_id: str,
    task_list: list[dict[str, Any]],
) -> None:
    for subtask in task_list:
        raw_artifacts = subtask.get("artifact")
        artifacts = []
        if raw_artifacts:
            raw_artifacts = [raw_artifacts] if isinstance(raw_artifacts, dict) else raw_artifacts
            artifacts = [ArtifactCreate.model_validate(item) for item in raw_artifacts]

        db_subtask = SubTask(
            id=subtask["id"],
            expert_type=subtask["expert_type"],
            task_description=subtask["description"],
            input_data=subtask.get("input_data", {}),
            status=subtask["status"],
            output_result=subtask.get("output_result"),
            started_at=subtask.get("started_at"),
            completed_at=subtask.get("completed_at"),
            created_at=subtask.get("created_at"),
            updated_at=subtask.get("updated_at"),
            execution_plan_id=execution_plan_id,
        )
        session.add(db_subtask)
        session.flush()

        if artifacts:
            create_artifacts_batch(session, db_subtask.id, artifacts)


def create_subtask_for_direct_mode(
    session: Session,
    execution_plan_id: str,
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
        execution_plan_id=execution_plan_id,
    )
    session.add(db_subtask)
