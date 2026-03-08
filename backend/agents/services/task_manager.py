"""
执行计划管理服务 (Task Manager)

负责 ExecutionPlan 和 SubTask 的数据库操作，包括：
- 执行计划的创建、查询、更新
- 子任务的创建、状态更新
- 聚合结果的持久化

设计原则：
- 所有数据库操作集中管理，便于事务控制和错误处理
- 提供高层抽象，让 Node 代码只关注业务逻辑
- 统一日志格式，便于调试

Author: XPouch AI Team
Created: 2026-02-05
"""

from datetime import datetime
from typing import Any

from sqlmodel import Session

from crud.execution_plan import (
    create_artifacts_batch,
    create_execution_plan_with_subtasks,
    create_subtask,
    get_execution_plan_by_thread,
    get_subtask,
    get_subtasks_by_execution_plan,
    update_execution_plan_status,
)
from crud.run_event import emit_artifact_generated, emit_task_completed
from models import Message as MessageModel
from utils.logger import logger

# =============================================================================
# ExecutionPlan 管理
# =============================================================================


def get_or_create_execution_plan(
    db: Session,
    thread_id: str,
    run_id: str | None,
    user_query: str,
    plan_summary: str,
    estimated_steps: int,
    subtasks_data: list[Any],
    execution_mode: str = "sequential",
    execution_plan_id: str | None = None,
) -> tuple[Any, bool]:
    """
    获取或创建执行计划

    如果指定 thread_id 的 ExecutionPlan 已存在，则复用并更新；
    否则创建新的 ExecutionPlan。

    Args:
        db: 数据库会话
        thread_id: 线程/会话标识
        run_id: 当前运行实例 ID
        user_query: 用户原始查询
        plan_summary: 执行策略概述
        estimated_steps: 预计步骤数
        subtasks_data: 子任务数据列表 (SubTaskCreate)
        execution_mode: 执行模式 (sequential/parallel)
        execution_plan_id: 可选的执行计划 ID（用于流式预览时保持一致性）

    Returns:
        tuple: (execution_plan, is_reused)
            - execution_plan: ExecutionPlan 对象
            - is_reused: 是否复用了已存在的执行计划

    Example:
        >>> execution_plan, reused = get_or_create_execution_plan(
        ...     db, thread_id="abc123", user_query="查询天气",
        ...     plan_summary="分步执行", estimated_steps=3,
        ...     subtasks_data=[subtask1, subtask2]
        ... )
        >>> print(f"Plan: {execution_plan.id}, Reused: {reused}")
    """
    # 先检查是否已存在
    existing_plan = get_execution_plan_by_thread(db, thread_id)

    if existing_plan:
        # ✅ 修复：删除旧的 SubTasks，根据新的 subtasks_data 创建新的
        # 这样可以确保 task_list 与数据库一致
        old_subtasks = get_subtasks_by_execution_plan(db, existing_plan.id)
        if old_subtasks:
            for old_subtask in old_subtasks:
                db.delete(old_subtask)

        # 更新 session 的信息
        existing_plan.plan_summary = plan_summary
        existing_plan.estimated_steps = estimated_steps
        existing_plan.execution_mode = execution_mode
        existing_plan.run_id = run_id
        existing_plan.status = "running"
        db.add(existing_plan)

        # 🔥 关键修复：批量创建子任务并正确映射 depends_on
        task_id_to_subtask: dict[str, Any] = {}
        subtask_data_list: list[tuple] = []

        for subtask_data in subtasks_data:
            subtask = create_subtask(
                db=db,
                execution_plan_id=existing_plan.id,
                expert_type=subtask_data.expert_type,
                task_description=subtask_data.task_description,
                sort_order=subtask_data.sort_order,
                input_data=subtask_data.input_data,
                execution_mode=subtask_data.execution_mode,
                depends_on=None,  # 先不设置
            )

            # 建立映射
            if subtask_data.task_id:
                task_id_to_subtask[subtask_data.task_id] = subtask
            subtask_data_list.append((subtask, subtask_data.depends_on))

        # 更新 depends_on
        for subtask, original_depends_on in subtask_data_list:
            if original_depends_on:
                new_depends_on = []
                for dep_id in original_depends_on:
                    if dep_id in task_id_to_subtask:
                        new_depends_on.append(str(task_id_to_subtask[dep_id].id))
                    else:
                        new_depends_on.append(dep_id)
                subtask.depends_on = new_depends_on
                db.add(subtask)

        db.commit()
        db.refresh(existing_plan)
        return existing_plan, True

    execution_plan = create_execution_plan_with_subtasks(
        db=db,
        thread_id=thread_id,
        run_id=run_id,
        user_query=user_query,
        plan_summary=plan_summary,
        estimated_steps=estimated_steps,
        subtasks_data=subtasks_data,
        execution_mode=execution_mode,
        execution_plan_id=execution_plan_id,
    )
    return execution_plan, False


def complete_execution_plan(db: Session, execution_plan_id: str, final_response: str) -> None:
    """
    标记执行计划为已完成

    Args:
        db: 数据库会话
        execution_plan_id: 执行计划 ID
        final_response: 最终聚合结果

    Example:
        >>> complete_execution_plan(db, "plan_abc", "所有任务已完成，结果是...")
    """
    update_execution_plan_status(db, execution_plan_id, "completed", final_response=final_response)


# =============================================================================
# 专家执行结果实时保存
# =============================================================================


def save_expert_execution_result(
    db: Session,
    task_id: str,
    expert_type: str,
    output_result: str,
    artifact_data: dict[str, Any] | None = None,
    duration_ms: int | None = None,
) -> bool:
    """
    实时保存专家执行结果到数据库

    在 GenericWorker 执行完成后立即调用，确保：
    1. SubTask 状态更新为 completed
    2. 输出结果保存到 SubTask
    3. Artifact 创建并关联到 SubTask

    Args:
        db: 数据库会话
        task_id: 子任务 ID (SubTask.id)
        expert_type: 专家类型
        output_result: 专家输出内容
        artifact_data: Artifact 数据 (可选)
        duration_ms: 执行耗时 (毫秒)

    Returns:
        bool: 是否保存成功
    """
    try:
        # 1. 检查 SubTask 是否存在
        subtask = get_subtask(db, task_id)
        if not subtask:
            logger.warning(f"[TaskManager] SubTask 不存在: {task_id}")
            return False

        # 2. 更新 SubTask 状态 - 直接操作对象避免参数问题
        subtask.status = "completed"
        subtask.output_result = {"content": output_result}
        subtask.completed_at = datetime.now()
        if duration_ms is not None:
            subtask.duration_ms = duration_ms
        subtask.updated_at = datetime.now()
        db.add(subtask)
        db.commit()
        db.refresh(subtask)

        execution_plan = subtask.execution_plan
        run_id = execution_plan.run_id if execution_plan else None
        thread_id = execution_plan.thread_id if execution_plan else None

        if run_id and thread_id:
            emit_task_completed(
                db,
                run_id=run_id,
                thread_id=thread_id,
                execution_plan_id=subtask.execution_plan_id,
                task_id=str(subtask.id),
                expert_type=expert_type,
                has_artifact=artifact_data is not None,
                duration_ms=duration_ms,
            )

        # 3. 创建 Artifact (如果有)
        if artifact_data:
            from models import ArtifactCreate

            artifact_create = ArtifactCreate(
                id=artifact_data.get("artifact_id"),  # 使用前端传入的 artifact_id
                type=artifact_data.get("type", "markdown"),
                title=artifact_data.get("title", f"{expert_type}结果"),
                content=artifact_data.get("content", output_result),
                language=artifact_data.get("language"),
                sort_order=artifact_data.get("sort_order", 0),
            )
            created_artifacts = create_artifacts_batch(db, task_id, [artifact_create])
            if run_id and thread_id:
                for created_artifact in created_artifacts:
                    emit_artifact_generated(
                        db,
                        run_id=run_id,
                        thread_id=thread_id,
                        execution_plan_id=subtask.execution_plan_id,
                        task_id=str(subtask.id),
                        artifact_id=created_artifact.id,
                        artifact_type=created_artifact.type,
                        artifact_title=created_artifact.title,
                    )

        if run_id and thread_id:
            db.commit()

        return True

    except Exception as e:
        logger.error(f"[TaskManager] 保存专家执行结果失败: {e}", exc_info=True)
        return False


# =============================================================================
# 消息持久化
# =============================================================================


def save_aggregator_message(db: Session, thread_id: str, content: str) -> MessageModel | None:
    """
    保存聚合器生成的最终消息到数据库

    Args:
        db: 数据库会话
        thread_id: 线程 ID
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
        message_record = MessageModel(thread_id=thread_id, role="assistant", content=content)
        db.add(message_record)
        db.commit()
        return message_record
    except Exception as e:
        logger.error(f"[TaskManager] 消息持久化失败: {e}")
        db.rollback()
        return None


# =============================================================================
# 子任务管理
# =============================================================================


def update_subtask_status(
    db: Session,
    subtask_id: str,
    status: str,
    output_result: str | None = None,
    error_message: str | None = None,
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
    from crud.execution_plan import update_subtask

    try:
        update_subtask(
            db=db,
            subtask_id=subtask_id,
            status=status,
            output_result=output_result,
            error_message=error_message,
        )
        return True
    except Exception as e:
        logger.error(f"[TaskManager] 子任务状态更新失败: {e}")
        return False


def get_subtask_by_id(db: Session, subtask_id: str) -> Any | None:
    """
    根据 ID 获取子任务

    Args:
        db: 数据库会话
        subtask_id: 子任务 ID

    Returns:
        SubTask 对象，如果不存在则返回 None
    """
    from crud.execution_plan import get_subtask

    return get_subtask(db, subtask_id)
