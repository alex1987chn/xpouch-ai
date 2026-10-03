"""
运行实例相关 API 路由

提供运行时状态查询和时间线 API。
"""

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from crud.run_event import get_run_events_by_run_id, get_run_events_by_thread_id
from database import get_session
from dependencies import get_current_user
from models import AgentRun, ExecutionPlan, RunEvent, SubTask, Thread, User
from schemas.run_event import (
    RunPlanResponse,
    RunPlanTask,
    RunStatusResponse,
    RunSummaryResponse,
    RunTimelineResponse,
    ThreadTimelineResponse,
)
from services.chat.run_lifecycle import get_agent_run_or_raise
from utils.exceptions import AuthorizationError, NotFoundError
from utils.logger import logger

router = APIRouter(prefix="/api/runs", tags=["runs"])


async def _get_run_or_raise(
    db: Session, run_id: str, user_id: str, is_admin: bool = False
) -> AgentRun:
    """用户归属校验（单一实现在 run_lifecycle.get_agent_run_or_raise）。

    admin 例外：运行统计（全局列表）跳转详情时允许查看任意用户的 run。
    """
    if is_admin:
        run = await db.get(AgentRun, run_id)
        if run is None:
            raise NotFoundError("AgentRun")
        return run
    return await get_agent_run_or_raise(db, run_id, user_id=user_id)


async def _get_thread_or_raise(db: Session, thread_id: str, user_id: str) -> Thread:
    # 单一实现在 thread_service（run 侧对称物 get_agent_run_or_raise）
    from services.chat.thread_service import get_thread_or_raise

    return await get_thread_or_raise(db, thread_id, user_id)


@router.get("/{run_id}", response_model=RunSummaryResponse)
async def get_run_details(
    run_id: str,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RunSummaryResponse:
    """
    获取运行实例详情

    返回指定 run_id 的运行实例信息。

    Args:
        run_id: 运行实例 ID
        db: 数据库会话
        current_user: 当前用户

    Returns:
        RunSummaryResponse: 运行实例摘要
    """
    logger.info(f"[Runs API] 获取运行详情: run_id={run_id}, user_id={current_user.id}")
    run = await _get_run_or_raise(
        db, run_id, current_user.id, is_admin=(current_user.role == "admin")
    )
    return RunSummaryResponse.model_validate(run)


@router.get("/{run_id}/plan", response_model=RunPlanResponse)
async def get_run_plan(
    run_id: str,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RunPlanResponse:
    """计划状态轮询（HITL 修订专供）。

    返回计划版本、子任务快照与修订状态；revising/revision_error 从
    事件账本推导（最新修订事件 = started 即修订中 / failed 即失败）。
    """
    # 归属校验（admin 可跨用户查看）；run 本体不再使用
    await _get_run_or_raise(db, run_id, current_user.id, is_admin=(current_user.role == "admin"))

    plan = (
        await db.exec(
            select(ExecutionPlan)
            .where(ExecutionPlan.run_id == run_id)
            .order_by(ExecutionPlan.id.desc())
        )
    ).first()
    if not plan:
        raise NotFoundError("ExecutionPlan")

    # 事件账本推导修订状态（倒序取第一条相关事件）
    from models.enums import RunEventType

    revision_events = (
        await db.exec(
            select(RunEvent)
            .where(
                RunEvent.run_id == run_id,
                RunEvent.event_type.in_(
                    [
                        RunEventType.HITL_REVISION_STARTED,
                        RunEventType.HITL_REVISION_FAILED,
                        RunEventType.PLAN_UPDATED,
                    ]
                ),
            )
            .order_by(RunEvent.id.desc())
        )
    ).all()
    revising = False
    revision_error: str | None = None
    if revision_events:
        latest = revision_events[0]
        if latest.event_type == RunEventType.HITL_REVISION_STARTED:
            revising = True
        elif latest.event_type == RunEventType.HITL_REVISION_FAILED:
            revision_error = (latest.event_data or {}).get("error")

    return RunPlanResponse(
        run_id=run_id,
        plan_id=plan.id,
        plan_version=plan.plan_version,
        status=str(plan.status) if plan.status else "pending",
        revising=revising,
        revision_error=revision_error,
        tasks=[
            RunPlanTask(
                # id 必须是 SubTask 真实主键（uuid）：前端批准时把这份计划原样
                # 回传 updated_plan，执行产物的 db_uuid 与落库保存都按它对行。
                # 此前返回位置号 "1"/"2"（语义 id）——修订后批准回传，语义 id
                # 流进 task_list，保存路径查不到 SubTask（"SubTask 不存在"），
                # 产物全灭 + 依赖清洗把 uuid 依赖线误剪（2026-10-03 e68b5a40）。
                # 位置语义由 sort_order 承载（前端 diff 本就按位置比对，见
                # frontend/src/lib/planDiff.ts）。
                id=str(st.id),
                expert_type=st.expert_type,
                description=st.description,
                sort_order=st.sort_order,
                depends_on=st.depends_on or [],
            )
            for st in (
                await db.exec(
                    select(SubTask)
                    .where(SubTask.execution_plan_id == plan.id)
                    .order_by(SubTask.sort_order.asc())
                )
            ).all()
        ],
    )


@router.get("/{run_id}/status", response_model=RunStatusResponse)
async def get_run_status(
    run_id: str,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RunStatusResponse:
    """
    获取运行实例状态（轻量级接口，专供轮询使用）

    **极简查询**：只选取 status + current_node + completed_at 三个字段，
    避免全量加载 ORM 对象，减少数据库 I/O 和内存占用。

    Args:
        run_id: 运行实例 ID
        db: 数据库会话
        current_user: 当前用户

    Returns:
        RunStatusResponse: 运行状态
    """
    # 极简查询：只选取需要的字段
    statement = select(
        AgentRun.id,
        AgentRun.status,
        AgentRun.current_node,
        AgentRun.completed_at,
        AgentRun.user_id,
    ).where(AgentRun.id == run_id)
    result = (await db.exec(statement)).first()

    if result is None:
        raise NotFoundError("AgentRun")

    run_id_val, status, current_node, completed_at, user_id = result

    # 权限检查
    if user_id != current_user.id:
        raise AuthorizationError("无权访问此运行实例")

    return RunStatusResponse(
        id=run_id_val,
        status=status,
        current_node=current_node,
        completed_at=completed_at,
    )


@router.get("/{run_id}/timeline", response_model=RunTimelineResponse)
async def get_run_timeline(
    run_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RunTimelineResponse:
    """
    获取运行实例的事件时间线

    返回指定 run_id 的所有事件，按时间戳升序排列。

    Args:
        run_id: 运行实例 ID
        limit: 返回数量限制（默认 100，最大 1000）
        offset: 偏移量（用于分页）
        db: 数据库会话
        current_user: 当前用户

    Returns:
        RunTimelineResponse: 包含事件列表的响应
    """
    logger.info(f"[Runs API] 获取运行时间线: run_id={run_id}, user_id={current_user.id}")
    await _get_run_or_raise(db, run_id, current_user.id, is_admin=(current_user.role == "admin"))

    events = await get_run_events_by_run_id(db, run_id, limit=limit, offset=offset)

    return RunTimelineResponse(
        run_id=run_id,
        events=list(events),
        total=len(events),
    )


@router.get("/thread/{thread_id}/timeline", response_model=ThreadTimelineResponse)
async def get_thread_timeline(
    thread_id: str,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ThreadTimelineResponse:
    """
    获取线程的事件时间线

    返回指定线程下所有运行实例的事件，按时间戳升序排列。
    用于查看同一线程下的完整运行历史。

    Args:
        thread_id: 线程 ID
        limit: 返回数量限制（默认 200，最大 1000）
        offset: 偏移量（用于分页）
        db: 数据库会话
        current_user: 当前用户

    Returns:
        ThreadTimelineResponse: 包含事件列表的响应
    """
    logger.info(f"[Runs API] 获取线程时间线: thread_id={thread_id}, user_id={current_user.id}")
    await _get_thread_or_raise(db, thread_id, current_user.id)

    events = await get_run_events_by_thread_id(db, thread_id, limit=limit, offset=offset)

    return ThreadTimelineResponse(
        thread_id=thread_id,
        events=list(events),
        total=len(events),
    )
