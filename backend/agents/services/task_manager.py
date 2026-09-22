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

from typing import Any

from sqlmodel import Session

from crud.execution_plan import (
    create_artifacts_batch,
    create_execution_plan_with_subtasks,
    get_execution_plan_by_run,
    get_subtask,
    update_execution_plan_status,
)
from crud.run_event import emit_artifact_generated, emit_task_completed
from models import TaskStatus
from utils.logger import logger
from utils.time import utc_now

# =============================================================================
# ExecutionPlan 管理
# =============================================================================


def get_or_create_execution_plan(
    db: Session,
    thread_id: str,
    run_id: str | None,
    user_query: str,
    strategy: str,
    estimated_steps: int,
    subtasks_data: list[Any],
    execution_mode: str = "sequential",
    execution_plan_id: str | None = None,
) -> tuple[Any, bool]:
    """
    获取或创建执行计划（**一 run 一计划**）

    幂等规则：
    - 本次 run 已有计划 → 直接复用，**不触碰子任务**（节点重执行幂等，返回
      is_reused=True）
    - 其余情况 → **新建一份计划**，不删除任何既有计划/子任务/产物
      （返回 is_reused=False）

    历史说明：原实现按 `thread_id` 单一键判定，命中即删除全部旧 SubTasks 并
    重建。因 `SubTask.artifacts` 配了 `cascade="all, delete-orphan"`，该行为会
    连带删除已完成任务的**产物**——同会话里「先生成网页、再写小游戏」，网页
    产物会被第二次规划抹掉，与「产物是会话级交付物」的产品语义冲突。改为
    一 run 一计划后，产物与任务历史都保留，且运行时不再有任何删除子任务的
    路径（级联自然失效，无需迁移）。

    Args:
        db: 数据库会话
        thread_id: 线程/会话标识
        run_id: 当前运行实例 ID
        user_query: 用户原始查询
        strategy: 执行策略概述
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
        ...     strategy="分步执行", estimated_steps=3,
        ...     subtasks_data=[subtask1, subtask2]
        ... )
        >>> print(f"Plan: {execution_plan.id}, Reused: {reused}")
    """
    # 幂等（同一 run 内节点重执行）→ 复用已建计划，不触碰子任务
    if run_id is not None:
        existing = get_execution_plan_by_run(db, run_id)
        if existing is not None:
            logger.info(f"[TaskManager] 复用本 run 的 ExecutionPlan {existing.id}（不重建子任务）")
            return existing, True

    # 其余情况一律**新建一份计划**：不删除任何既有计划、子任务或产物。
    # 同会话里「先生成网页、再写小游戏」应各留一份计划与产物（产物是会话级
    # 交付物，不能因后续任务重新规划而消失），任务历史也随之保留。
    execution_plan = create_execution_plan_with_subtasks(
        db=db,
        thread_id=thread_id,
        run_id=run_id,
        user_query=user_query,
        strategy=strategy,
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
    update_execution_plan_status(
        db, execution_plan_id, TaskStatus.COMPLETED, final_response=final_response
    )


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
        subtask.status = TaskStatus.COMPLETED
        subtask.output_result = {"content": output_result}
        subtask.completed_at = utc_now()
        if duration_ms is not None:
            subtask.duration_ms = duration_ms
        subtask.updated_at = utc_now()
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
