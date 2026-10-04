"""
ExecutionPlan / SubTask / Artifact 数据访问层。

提供复杂模式执行计划的 CRUD 操作。
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, func, select

from models import (
    Artifact,
    ArtifactCreate,
    ExecutionPlan,
    SubTask,
    SubTaskCreate,
    TaskStatus,
    Thread,
)
from utils.time import utc_now


async def create_execution_plan(
    db: Session,
    thread_id: str,
    user_query: str,
    strategy: str | None = None,
    estimated_steps: int = 0,
    execution_mode: str = "sequential",
) -> ExecutionPlan:
    """创建执行计划。"""
    execution_plan = ExecutionPlan(
        thread_id=thread_id,
        user_query=user_query,
        strategy=strategy,
        estimated_steps=estimated_steps,
        execution_mode=execution_mode,
        status=TaskStatus.PENDING,
    )
    db.add(execution_plan)
    await db.commit()
    await db.refresh(execution_plan)
    return execution_plan


async def get_execution_plan(db: Session, execution_plan_id: str) -> ExecutionPlan | None:
    """获取执行计划详情。"""
    statement = select(ExecutionPlan).where(ExecutionPlan.id == execution_plan_id)
    return (await db.exec(statement)).first()


async def get_execution_plan_by_run(db: Session, run_id: str) -> ExecutionPlan | None:
    """按 run_id 获取 ExecutionPlan（一 run 一计划，故至多一份）。"""
    return (await db.exec(select(ExecutionPlan).where(ExecutionPlan.run_id == run_id))).first()


async def get_current_execution_plan_by_thread(db: Session, thread_id: str) -> ExecutionPlan | None:
    """取线程**当前**执行计划——唯一访问入口，调用方不得自拼「当前计划」查询。

    口径（三条历史选取路径的收敛点，2026-10-04）：
    - `thread.execution_plan_id` 指针优先——所有创建/收尾路径事务内维护，
      存量实测零漂移；指针是显式真相，排序只是启发式（时钟偏斜不可靠）
    - 指针为空（清理路径置空 / 历史数据缺失）时退化 created_at 倒序最新；
      兜底排序必须显式 created_at——主键是 uuid，按 id 排序无时间语义
    - 一个会话可有多份计划（一 run 一计划），指针悬挂时兜底也能给出
      合理答案而非空
    """
    thread = await db.get(Thread, thread_id)
    if thread and thread.execution_plan_id:
        plan = await db.get(ExecutionPlan, thread.execution_plan_id)
        if plan:
            return plan
    return (
        await db.exec(
            select(ExecutionPlan)
            .where(ExecutionPlan.thread_id == thread_id)
            .order_by(ExecutionPlan.created_at.desc())
        )
    ).first()


async def update_execution_plan_status(
    db: Session,
    execution_plan_id: str,
    status: TaskStatus,
    final_response: str | None = None,
) -> ExecutionPlan | None:
    """更新执行计划状态和最终响应。"""
    execution_plan = await get_execution_plan(db, execution_plan_id)
    if not execution_plan:
        return None

    execution_plan.status = status
    if final_response is not None:
        execution_plan.final_response = final_response
    if status in (TaskStatus.COMPLETED, TaskStatus.FAILED):
        execution_plan.completed_at = utc_now()
    execution_plan.updated_at = utc_now()

    db.add(execution_plan)
    await db.commit()
    await db.refresh(execution_plan)
    return execution_plan


async def get_subtask(db: Session, subtask_id: str) -> SubTask | None:
    """获取子任务详情。"""
    statement = select(SubTask).where(SubTask.id == subtask_id)
    return (await db.exec(statement)).first()


async def get_subtasks_by_execution_plan(db: Session, execution_plan_id: str) -> list[SubTask]:
    """获取执行计划的所有子任务。"""
    statement = (
        select(SubTask)
        .where(SubTask.execution_plan_id == execution_plan_id)
        .order_by(SubTask.sort_order)
    )
    return list((await db.exec(statement)).all())


async def update_subtask_status(
    db: Session,
    subtask_id: str,
    status: str,
    output_result: dict | None = None,
    error_message: str | None = None,
    duration_ms: int | None = None,
) -> SubTask | None:
    """更新子任务状态。"""
    subtask = await get_subtask(db, subtask_id)
    if not subtask:
        return None

    subtask.status = status
    if status == TaskStatus.RUNNING and not subtask.started_at:
        subtask.started_at = utc_now()
    if status in [TaskStatus.COMPLETED, TaskStatus.FAILED]:
        subtask.completed_at = utc_now()
    if output_result is not None:
        subtask.output_result = output_result
    if error_message is not None:
        subtask.error_message = error_message
    if duration_ms is not None:
        subtask.duration_ms = duration_ms

    subtask.updated_at = utc_now()
    db.add(subtask)
    await db.commit()
    await db.refresh(subtask)
    return subtask


async def _derive_thread_id(db: Session, sub_task_id: str) -> str | None:
    """从 subtask→executionplan 链路派生 thread_id（artifact 冗余列写入用）。"""
    subtask = await db.get(SubTask, sub_task_id)
    if not subtask or not subtask.execution_plan_id:
        return None
    plan = await db.get(ExecutionPlan, subtask.execution_plan_id)
    return plan.thread_id if plan else None


def _coerce_artifact_create(data: ArtifactCreate | dict[str, Any]) -> ArtifactCreate:
    """raw dict（事件 / task_outcome 载荷，键名 artifact_id）与 DTO 的单一归一入口。

    artifact_id 是产物在全链路（SSE 事件 → outcome → 各保存路径）共享的逻辑身份，
    必须归一进 id 主键：漏了它每条并发写入路径都会生成随机新 uuid，主键去重失效，
    重复产物行就此坐大（2026-09-27 产物 ×4 事故）。
    """
    if isinstance(data, ArtifactCreate):
        return data
    payload = dict(data)
    if payload.get("id") is None and payload.get("artifact_id"):
        payload["id"] = payload["artifact_id"]
    payload.pop("artifact_id", None)
    return ArtifactCreate.model_validate(payload)


async def create_artifacts_batch(
    db: Session,
    sub_task_id: str,
    artifacts_data: list[ArtifactCreate | dict[str, Any]],
) -> list[Artifact]:
    """批量创建产物。

    v3.4.4 幂等保护：跳过已存在产物的 sub_task_id。同一任务的产物可能经
    多条路径到达（任务完成时的后台队列保存 + 流收尾的批量收集 + HITL
    恢复回放），此前会重复插入。

    全异步后这些路径会**并发**抵达（各自独立 session），先查后插的护栏
    存在 check-then-insert 竞态——真正的闸是主键：所有路径经
    _coerce_artifact_create 归一出同一 artifact_id，并发冲突撞 PK 时
    首写赢、后到者按幂等空手而归（2026-09-27 产物 ×4 事故修复）。
    """
    existing = (
        await db.exec(select(Artifact.sub_task_id).where(Artifact.sub_task_id == sub_task_id))
    ).first()
    if existing is not None:
        return []

    thread_id = await _derive_thread_id(db, sub_task_id)
    artifacts = []
    for idx, raw in enumerate(artifacts_data):
        data = _coerce_artifact_create(raw)
        artifact_kwargs = {
            "sub_task_id": sub_task_id,
            "thread_id": thread_id,
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

    # 冲突探测进 SAVEPOINT：PK 撞车只回滚保存点。
    # 此前用全量 rollback 兜冲突——它会把**调用方会话里所有已加载实例全部
    # 过期**，恢复回放的后续代码访问 subtask.id / execution_plan.id 就地
    # MissingGreenlet 崩溃（2026-09-27 16:07 HITL RESUME 事故），调用方
    # 未提交的变更也被株连丢弃。savepoint 只回收本批插入，外层事务原样。
    try:
        async with db.begin_nested():
            for artifact in artifacts:
                db.add(artifact)
            await db.flush()
    except IntegrityError:
        # 并发竞态：另一路已写入同 id 产物（首写赢），按幂等空手而归。
        # 调用方会话仍处于可用事务态，其 pending 变更由调用方自行提交。
        return []
    await db.commit()
    for artifact in artifacts:
        await db.refresh(artifact)

    return artifacts


async def get_artifact(db: Session, artifact_id: str) -> Artifact | None:
    """获取产物详情。"""
    statement = select(Artifact).where(Artifact.id == artifact_id)
    return (await db.exec(statement)).first()


async def get_artifacts_by_subtask(db: Session, sub_task_id: str) -> list[Artifact]:
    """获取子任务的所有产物。"""
    statement = (
        select(Artifact).where(Artifact.sub_task_id == sub_task_id).order_by(Artifact.sort_order)
    )
    return list((await db.exec(statement)).all())


async def update_artifact_content(db: Session, artifact_id: str, content: str) -> Artifact | None:
    """更新产物内容。"""
    artifact = await get_artifact(db, artifact_id)
    if not artifact:
        return None

    artifact.content = content
    db.add(artifact)
    await db.commit()
    await db.refresh(artifact)
    return artifact


async def get_thread_titles_map(db: Session, thread_ids: list[str]) -> dict[str, str | None]:
    """批量取会话标题（产物卡片展示来源会话用），缺失的会话不出现在结果里。"""
    if not thread_ids:
        return {}
    rows = (await db.exec(select(Thread.id, Thread.title).where(Thread.id.in_(thread_ids)))).all()
    return {row[0]: row[1] for row in rows}


async def list_artifacts_for_user(
    db: Session,
    user_id: str,
    thread_id: str | None = None,
    artifact_type: str | None = None,
    search: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> dict:
    """按用户跨会话列出产物（artifact.thread_id 冗余列直连 thread 做归属过滤）。

    search 对标题/内容做 ILIKE 包含匹配（当前量级无索引压力）。
    分页语义与 list_threads 一致：{items, total, page, limit, pages}。
    """
    limit = min(limit, 100)
    offset = (page - 1) * limit

    base_filters = [Thread.user_id == user_id, Artifact.thread_id.isnot(None)]
    if thread_id:
        base_filters.append(Artifact.thread_id == thread_id)
    if artifact_type:
        base_filters.append(Artifact.type == artifact_type)
    if search:
        pattern = f"%{search}%"
        base_filters.append(or_(Artifact.title.ilike(pattern), Artifact.content.ilike(pattern)))

    total = (
        await db.exec(
            select(func.count())
            .select_from(Artifact)
            .join(Thread, Artifact.thread_id == Thread.id)
            .where(*base_filters)
        )
    ).one()

    items = (
        await db.exec(
            select(Artifact)
            .join(Thread, Artifact.thread_id == Thread.id)
            .where(*base_filters)
            .order_by(Artifact.created_at.desc(), Artifact.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()

    return {
        "items": list(items),
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


async def create_execution_plan_with_subtasks(
    db: Session,
    thread_id: str,
    run_id: str | None,
    user_query: str,
    strategy: str,
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
        "strategy": strategy,
        "estimated_steps": estimated_steps,
        "execution_mode": execution_mode,
        "status": TaskStatus.RUNNING,
    }
    if execution_plan_id:
        execution_plan_data["id"] = execution_plan_id

    execution_plan = ExecutionPlan(**execution_plan_data)
    db.add(execution_plan)
    await db.flush()

    await create_subtasks(db, execution_plan.id, subtasks_data)

    await db.commit()
    await db.refresh(execution_plan)
    return execution_plan


async def create_subtasks(
    db: Session,
    execution_plan_id: str,
    subtasks_data: list[SubTaskCreate],
) -> list[SubTask]:
    """创建子任务并**接好依赖线**（唯一实现，两条创建路径共用）。

    依赖的两种形态（这里的转换是必须的）：
    - 传入的 `SubTaskCreate.depends_on` 是 **Commander 语义 ID**（`task_1`），
      与 `task_id` 同一命名空间；
    - 落库的 `SubTask.depends_on` 存的是**子任务 UUID**（前端的计划视图、执行期
      的 `expert_results.db_uuid` 匹配都是这个形态）。
    所以这里把语义 ID 解析成 UUID；解析不到的依赖**原样保留**（交给下游的依赖清理
    判断，不静默丢弃）。

    为什么要抽出来：修订路径（`action=revise`）此前自己 `SubTask(...)` 建行、没做这一步，
    于是修订后的依赖存进去的是 LLM 写的 `"1"/"2"` —— 执行期谁都匹配不到，下游任务
    静默失去上游上下文。
    """
    task_id_to_subtask: dict[str, SubTask] = {}
    subtask_list: list[tuple[SubTask, list[str] | None]] = []

    for idx, data in enumerate(subtasks_data):
        subtask = SubTask(
            execution_plan_id=execution_plan_id,
            task_id=data.task_id,
            expert_type=data.expert_type,
            description=data.description,
            sort_order=data.sort_order if data.sort_order is not None else idx,
            input_data=data.input_data,
            execution_mode=data.execution_mode,
            depends_on=None,
            status=TaskStatus.PENDING,
        )
        db.add(subtask)
        await db.flush()

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
        db.add(subtask)

    await db.flush()
    return [subtask for subtask, _ in subtask_list]
