"""
ExecutionPlan / SubTask / Artifact 数据访问层。

提供复杂模式执行计划的 CRUD 操作。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from models import (
    Artifact,
    ArtifactCreate,
    ExecutionPlan,
    ExecutionPlanUpdate,
    SubTask,
    SubTaskCreate,
    SubTaskUpdate,
)


def create_execution_plan(
    db: Session,
    thread_id: str,
    user_query: str,
    plan_summary: str | None = None,
    estimated_steps: int = 0,
    execution_mode: str = "sequential",
) -> ExecutionPlan:
    """创建执行计划。"""
    execution_plan = ExecutionPlan(
        thread_id=thread_id,
        user_query=user_query,
        plan_summary=plan_summary,
        estimated_steps=estimated_steps,
        execution_mode=execution_mode,
        status="pending",
    )
    db.add(execution_plan)
    db.commit()
    db.refresh(execution_plan)
    return execution_plan


def get_execution_plan(db: Session, execution_plan_id: str) -> ExecutionPlan | None:
    """获取执行计划详情。"""
    statement = select(ExecutionPlan).where(ExecutionPlan.id == execution_plan_id)
    return db.exec(statement).first()


def get_execution_plan_by_thread(db: Session, thread_id: str) -> ExecutionPlan | None:
    """通过线程 ID 获取执行计划。"""
    statement = select(ExecutionPlan).where(ExecutionPlan.thread_id == thread_id)
    return db.exec(statement).first()


def update_execution_plan(
    db: Session,
    execution_plan_id: str,
    update_data: ExecutionPlanUpdate,
) -> ExecutionPlan | None:
    """更新执行计划。"""
    execution_plan = get_execution_plan(db, execution_plan_id)
    if not execution_plan:
        return None

    update_dict = update_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(execution_plan, key, value)

    execution_plan.updated_at = datetime.now()
    db.add(execution_plan)
    db.commit()
    db.refresh(execution_plan)
    return execution_plan


def update_execution_plan_status(
    db: Session,
    execution_plan_id: str,
    status: str,
    final_response: str | None = None,
) -> ExecutionPlan | None:
    """更新执行计划状态和最终响应。"""
    execution_plan = get_execution_plan(db, execution_plan_id)
    if not execution_plan:
        return None

    execution_plan.status = status
    if final_response is not None:
        execution_plan.final_response = final_response
    if status in ["completed", "failed"]:
        execution_plan.completed_at = datetime.now()
    execution_plan.updated_at = datetime.now()

    db.add(execution_plan)
    db.commit()
    db.refresh(execution_plan)
    return execution_plan


def create_subtask(
    db: Session,
    execution_plan_id: str,
    expert_type: str,
    task_description: str,
    sort_order: int = 0,
    input_data: dict | None = None,
    execution_mode: str = "sequential",
    depends_on: list[str] | None = None,
) -> SubTask:
    """创建子任务。"""
    subtask = SubTask(
        execution_plan_id=execution_plan_id,
        expert_type=expert_type,
        task_description=task_description,
        sort_order=sort_order,
        input_data=input_data,
        execution_mode=execution_mode,
        depends_on=depends_on,
        status="pending",
    )
    db.add(subtask)
    db.commit()
    db.refresh(subtask)
    return subtask


def get_subtask(db: Session, subtask_id: str) -> SubTask | None:
    """获取子任务详情。"""
    statement = select(SubTask).where(SubTask.id == subtask_id)
    return db.exec(statement).first()


def get_subtasks_by_execution_plan(db: Session, execution_plan_id: str) -> list[SubTask]:
    """获取执行计划的所有子任务。"""
    statement = (
        select(SubTask)
        .where(SubTask.execution_plan_id == execution_plan_id)
        .order_by(SubTask.sort_order)
    )
    return list(db.exec(statement).all())


def update_subtask_status(
    db: Session,
    subtask_id: str,
    status: str,
    output_result: dict | None = None,
    error_message: str | None = None,
    duration_ms: int | None = None,
) -> SubTask | None:
    """更新子任务状态。"""
    subtask = get_subtask(db, subtask_id)
    if not subtask:
        return None

    subtask.status = status
    if status == "running" and not subtask.started_at:
        subtask.started_at = datetime.now()
    if status in ["completed", "failed"]:
        subtask.completed_at = datetime.now()
    if output_result is not None:
        subtask.output_result = output_result
    if error_message is not None:
        subtask.error_message = error_message
    if duration_ms is not None:
        subtask.duration_ms = duration_ms

    subtask.updated_at = datetime.now()
    db.add(subtask)
    db.commit()
    db.refresh(subtask)
    return subtask


def update_subtask(db: Session, subtask_id: str, update_data: SubTaskUpdate) -> SubTask | None:
    """通用子任务更新。"""
    subtask = get_subtask(db, subtask_id)
    if not subtask:
        return None

    update_dict = update_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(subtask, key, value)

    subtask.updated_at = datetime.now()
    db.add(subtask)
    db.commit()
    db.refresh(subtask)
    return subtask


def create_artifact(
    db: Session,
    sub_task_id: str,
    artifact_type: str,
    content: str,
    title: str | None = None,
    language: str | None = None,
    sort_order: int = 0,
) -> Artifact:
    """创建产物。"""
    artifact = Artifact(
        sub_task_id=sub_task_id,
        type=artifact_type,
        title=title,
        content=content,
        language=language,
        sort_order=sort_order,
    )
    db.add(artifact)
    db.commit()
    db.refresh(artifact)
    return artifact


def create_artifacts_batch(
    db: Session,
    sub_task_id: str,
    artifacts_data: list[ArtifactCreate],
) -> list[Artifact]:
    """批量创建产物。"""
    artifacts = []
    for idx, data in enumerate(artifacts_data):
        artifact_kwargs = {
            "sub_task_id": sub_task_id,
            "type": data.type,
            "title": data.title,
            "content": data.content,
            "language": data.language,
            "sort_order": data.sort_order if data.sort_order is not None else idx,
        }
        if data.id:
            artifact_kwargs["id"] = data.id

        artifact = Artifact(**artifact_kwargs)
        artifacts.append(artifact)
        db.add(artifact)

    db.commit()
    for artifact in artifacts:
        db.refresh(artifact)

    return artifacts


def get_artifact(db: Session, artifact_id: str) -> Artifact | None:
    """获取产物详情。"""
    statement = select(Artifact).where(Artifact.id == artifact_id)
    return db.exec(statement).first()


def get_artifacts_by_subtask(db: Session, sub_task_id: str) -> list[Artifact]:
    """获取子任务的所有产物。"""
    statement = (
        select(Artifact).where(Artifact.sub_task_id == sub_task_id).order_by(Artifact.sort_order)
    )
    return list(db.exec(statement).all())


def delete_artifact(db: Session, artifact_id: str) -> bool:
    """删除产物。"""
    artifact = get_artifact(db, artifact_id)
    if not artifact:
        return False

    db.delete(artifact)
    db.commit()
    return True


def update_artifact_content(db: Session, artifact_id: str, content: str) -> Artifact | None:
    """更新产物内容。"""
    artifact = get_artifact(db, artifact_id)
    if not artifact:
        return None

    artifact.content = content
    db.add(artifact)
    db.commit()
    db.refresh(artifact)
    return artifact


def create_execution_plan_with_subtasks(
    db: Session,
    thread_id: str,
    run_id: str | None,
    user_query: str,
    plan_summary: str,
    estimated_steps: int,
    subtasks_data: list[SubTaskCreate],
    execution_mode: str = "sequential",
    execution_plan_id: str | None = None,
) -> ExecutionPlan:
    """批量创建执行计划和子任务。"""
    execution_plan_data = {
        "thread_id": thread_id,
        "run_id": run_id,
        "user_query": user_query,
        "plan_summary": plan_summary,
        "estimated_steps": estimated_steps,
        "execution_mode": execution_mode,
        "status": "running",
    }
    if execution_plan_id:
        execution_plan_data["id"] = execution_plan_id

    execution_plan = ExecutionPlan(**execution_plan_data)
    db.add(execution_plan)
    db.flush()

    task_id_to_subtask: dict[str, SubTask] = {}
    subtask_list: list[tuple[SubTask, list[str] | None]] = []

    for idx, data in enumerate(subtasks_data):
        subtask = SubTask(
            execution_plan_id=execution_plan.id,
            expert_type=data.expert_type,
            task_description=data.task_description,
            sort_order=data.sort_order if data.sort_order is not None else idx,
            input_data=data.input_data,
            execution_mode=data.execution_mode,
            depends_on=None,
            status="pending",
        )
        db.add(subtask)
        db.flush()

        if data.task_id:
            task_id_to_subtask[data.task_id] = subtask
        subtask_list.append((subtask, data.depends_on))

    for subtask, original_depends_on in subtask_list:
        if not original_depends_on:
            continue
        new_depends_on = []
        for dep_id in original_depends_on:
            if dep_id in task_id_to_subtask:
                new_depends_on.append(str(task_id_to_subtask[dep_id].id))
            else:
                new_depends_on.append(dep_id)
        subtask.depends_on = new_depends_on

    db.commit()
    db.refresh(execution_plan)
    return execution_plan


def get_execution_plan_full(db: Session, execution_plan_id: str) -> ExecutionPlan | None:
    """获取完整执行计划（包含子任务和产物）。"""
    statement = (
        select(ExecutionPlan)
        .where(ExecutionPlan.id == execution_plan_id)
        .options(selectinload(ExecutionPlan.sub_tasks).selectinload(SubTask.artifacts))
    )
    return db.exec(statement).first()
