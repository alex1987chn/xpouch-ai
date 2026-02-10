"""
TaskSession / SubTask / Artifact 数据访问层
提供复杂模式任务会话的 CRUD 操作
"""

from typing import List, Optional
from datetime import datetime
from sqlmodel import Session, select
from models import (
    TaskSession, SubTask, Artifact,
    TaskSessionCreate, TaskSessionUpdate,
    SubTaskCreate, SubTaskUpdate,
    ArtifactCreate
)


# ============================================================================
# TaskSession CRUD
# ============================================================================

def create_task_session(
    db: Session,
    thread_id: str,
    user_query: str,
    plan_summary: Optional[str] = None,
    estimated_steps: int = 0,
    execution_mode: str = "sequential"
) -> TaskSession:
    """
    创建任务会话
    
    Args:
        db: 数据库会话
        thread_id: 关联的对话ID
        user_query: 用户原始查询
        plan_summary: 规划摘要
        estimated_steps: 预计步骤数
        execution_mode: 执行模式 (sequential/parallel)
    
    Returns:
        创建的任务会话
    """
    task_session = TaskSession(
        thread_id=thread_id,
        user_query=user_query,
        plan_summary=plan_summary,
        estimated_steps=estimated_steps,
        execution_mode=execution_mode,
        status="pending"
    )
    db.add(task_session)
    db.commit()
    db.refresh(task_session)
    return task_session


def get_task_session(db: Session, session_id: str) -> Optional[TaskSession]:
    """获取任务会话详情（包含子任务和产物）"""
    statement = select(TaskSession).where(TaskSession.session_id == session_id)
    result = db.exec(statement).first()
    return result


def get_task_session_by_thread(db: Session, thread_id: str) -> Optional[TaskSession]:
    """通过对话ID获取任务会话"""
    statement = select(TaskSession).where(TaskSession.thread_id == thread_id)
    result = db.exec(statement).first()
    return result


def update_task_session(
    db: Session,
    session_id: str,
    update_data: TaskSessionUpdate
) -> Optional[TaskSession]:
    """更新任务会话"""
    task_session = get_task_session(db, session_id)
    if not task_session:
        return None
    
    update_dict = update_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(task_session, key, value)
    
    task_session.updated_at = datetime.now()
    db.add(task_session)
    db.commit()
    db.refresh(task_session)
    return task_session


def update_task_session_status(
    db: Session,
    session_id: str,
    status: str,
    final_response: Optional[str] = None
) -> Optional[TaskSession]:
    """更新任务会话状态和最终响应"""
    task_session = get_task_session(db, session_id)
    if not task_session:
        return None
    
    task_session.status = status
    if final_response is not None:
        task_session.final_response = final_response
    if status in ["completed", "failed"]:
        task_session.completed_at = datetime.now()
    task_session.updated_at = datetime.now()
    
    db.add(task_session)
    db.commit()
    db.refresh(task_session)
    return task_session


# ============================================================================
# SubTask CRUD
# ============================================================================

def create_subtask(
    db: Session,
    task_session_id: str,
    expert_type: str,
    task_description: str,
    sort_order: int = 0,
    input_data: Optional[dict] = None,
    execution_mode: str = "sequential",
    depends_on: Optional[List[str]] = None
) -> SubTask:
    """
    创建子任务
    
    Args:
        db: 数据库会话
        task_session_id: 关联的任务会话ID
        expert_type: 专家类型
        task_description: 任务描述
        sort_order: 排序顺序
        input_data: 输入数据
        execution_mode: 执行模式
        depends_on: 依赖的任务ID列表
    
    Returns:
        创建的子任务
    """
    subtask = SubTask(
        task_session_id=task_session_id,
        expert_type=expert_type,
        task_description=task_description,
        sort_order=sort_order,
        input_data=input_data,
        execution_mode=execution_mode,
        depends_on=depends_on,
        status="pending"
    )
    db.add(subtask)
    db.commit()
    db.refresh(subtask)
    return subtask


def get_subtask(db: Session, subtask_id: str) -> Optional[SubTask]:
    """获取子任务详情（包含产物列表）"""
    statement = select(SubTask).where(SubTask.id == subtask_id)
    result = db.exec(statement).first()
    return result


def get_subtasks_by_session(db: Session, task_session_id: str) -> List[SubTask]:
    """获取任务会话的所有子任务（按 sort_order 排序）"""
    statement = (
        select(SubTask)
        .where(SubTask.task_session_id == task_session_id)
        .order_by(SubTask.sort_order)
    )
    results = db.exec(statement).all()
    return list(results)


def update_subtask_status(
    db: Session,
    subtask_id: str,
    status: str,
    output_result: Optional[dict] = None,
    error_message: Optional[str] = None,
    duration_ms: Optional[int] = None
) -> Optional[SubTask]:
    """更新子任务状态"""
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


def update_subtask(
    db: Session,
    subtask_id: str,
    update_data: SubTaskUpdate
) -> Optional[SubTask]:
    """更新子任务（通用）"""
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


# ============================================================================
# Artifact CRUD
# ============================================================================

def create_artifact(
    db: Session,
    sub_task_id: str,
    artifact_type: str,
    content: str,
    title: Optional[str] = None,
    language: Optional[str] = None,
    sort_order: int = 0
) -> Artifact:
    """
    创建产物
    
    Args:
        db: 数据库会话
        sub_task_id: 关联的子任务ID
        artifact_type: 产物类型 (code/html/markdown/json/text)
        content: 产物内容
        title: 产物标题
        language: 代码语言（如果是代码类型）
        sort_order: 排序顺序
    
    Returns:
        创建的产物
    """
    artifact = Artifact(
        sub_task_id=sub_task_id,
        type=artifact_type,
        title=title,
        content=content,
        language=language,
        sort_order=sort_order
    )
    db.add(artifact)
    db.commit()
    db.refresh(artifact)
    return artifact


def create_artifacts_batch(
    db: Session,
    sub_task_id: str,
    artifacts_data: List[ArtifactCreate]
) -> List[Artifact]:
    """批量创建产物"""
    artifacts = []
    for idx, data in enumerate(artifacts_data):
        artifact = Artifact(
            sub_task_id=sub_task_id,
            type=data.type,
            title=data.title,
            content=data.content,
            language=data.language,
            sort_order=data.sort_order if data.sort_order is not None else idx
        )
        artifacts.append(artifact)
        db.add(artifact)
    
    db.commit()
    for artifact in artifacts:
        db.refresh(artifact)
    
    return artifacts


def get_artifact(db: Session, artifact_id: str) -> Optional[Artifact]:
    """获取产物详情"""
    statement = select(Artifact).where(Artifact.id == artifact_id)
    result = db.exec(statement).first()
    return result


def get_artifacts_by_subtask(db: Session, sub_task_id: str) -> List[Artifact]:
    """获取子任务的所有产物（按 sort_order 排序）"""
    statement = (
        select(Artifact)
        .where(Artifact.sub_task_id == sub_task_id)
        .order_by(Artifact.sort_order)
    )
    results = db.exec(statement).all()
    return list(results)


def delete_artifact(db: Session, artifact_id: str) -> bool:
    """删除产物"""
    artifact = get_artifact(db, artifact_id)
    if not artifact:
        return False
    
    db.delete(artifact)
    db.commit()
    return True


def update_artifact_content(db: Session, artifact_id: str, content: str) -> Optional[Artifact]:
    """更新产物内容
    
    用于用户编辑 AI 生成的 Artifact 后持久化到数据库
    """
    artifact = get_artifact(db, artifact_id)
    if not artifact:
        return None
    
    artifact.content = content
    db.add(artifact)
    db.commit()
    db.refresh(artifact)
    return artifact


# ============================================================================
# 批量操作
# ============================================================================

def create_task_session_with_subtasks(
    db: Session,
    thread_id: str,
    user_query: str,
    plan_summary: str,
    estimated_steps: int,
    subtasks_data: List[SubTaskCreate],
    execution_mode: str = "sequential",
    session_id: Optional[str] = None  # 🔥 新增：可选的自定义 session_id
) -> TaskSession:
    """
    批量创建任务会话和子任务（Commander 阶段使用）
    
    Args:
        db: 数据库会话
        thread_id: 关联的对话ID
        user_query: 用户原始查询
        plan_summary: 规划摘要
        estimated_steps: 预计步骤数
        subtasks_data: 子任务列表
        execution_mode: 执行模式
        session_id: 可选的自定义 session_id（用于流式预览时保持一致性）
    
    Returns:
        创建的任务会话（包含所有子任务）
    """
    # 1. 创建任务会话
    # 🔥 如果传入了 session_id，使用它；否则数据库自动生成
    task_session_data = {
        "thread_id": thread_id,
        "user_query": user_query,
        "plan_summary": plan_summary,
        "estimated_steps": estimated_steps,
        "execution_mode": execution_mode,
        "status": "running"
    }
    
    if session_id:
        task_session_data["session_id"] = session_id
    
    task_session = TaskSession(**task_session_data)
    db.add(task_session)
    db.flush()  # 获取 session_id（如果是自动生成的）
    
    # 2. 批量创建子任务
    for idx, data in enumerate(subtasks_data):
        subtask = SubTask(
            task_session_id=task_session.session_id,
            expert_type=data.expert_type,
            task_description=data.task_description,
            sort_order=data.sort_order if data.sort_order is not None else idx,
            input_data=data.input_data,
            execution_mode=data.execution_mode,
            depends_on=data.depends_on,
            status="pending"
        )
        db.add(subtask)
    
    db.commit()
    db.refresh(task_session)
    return task_session


def get_task_session_full(db: Session, session_id: str) -> Optional[TaskSession]:
    """
    获取完整的任务会话（包含子任务和产物）
    
    用于从历史记录恢复复杂模式对话
    """
    task_session = get_task_session(db, session_id)
    if not task_session:
        return None
    
    # 确保加载所有关联数据
    for subtask in task_session.sub_tasks:
        # 访问 artifacts 会触发加载
        _ = subtask.artifacts
    
    return task_session
