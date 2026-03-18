"""
运行实例相关 API 路由

提供运行时状态查询和时间线 API。
"""

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from crud.run_event import get_run_events_by_run_id, get_run_events_by_thread_id
from database import get_session
from dependencies import get_current_user
from models import AgentRun, Thread, User
from schemas.run_event import (
    RunStatusResponse,
    RunSummaryResponse,
    RunTimelineResponse,
    ThreadTimelineResponse,
)
from utils.exceptions import AuthorizationError, NotFoundError
from utils.logger import logger

router = APIRouter(prefix="/api/runs", tags=["runs"])


def _get_run_or_raise(db: Session, run_id: str, user_id: str) -> AgentRun:
    run = db.get(AgentRun, run_id)
    if run is None:
        raise NotFoundError("AgentRun")
    if run.user_id != user_id:
        raise AuthorizationError("无权访问此运行实例")
    return run


def _get_thread_or_raise(db: Session, thread_id: str, user_id: str) -> Thread:
    thread = db.get(Thread, thread_id)
    if thread is None:
        raise NotFoundError("Thread")
    if thread.user_id != user_id:
        raise AuthorizationError("无权访问此线程")
    return thread


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
    run = _get_run_or_raise(db, run_id, current_user.id)
    return RunSummaryResponse.model_validate(run)


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
    result = db.exec(statement).first()

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
    _get_run_or_raise(db, run_id, current_user.id)

    events = get_run_events_by_run_id(db, run_id, limit=limit, offset=offset)

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
    _get_thread_or_raise(db, thread_id, current_user.id)

    events = get_run_events_by_thread_id(db, thread_id, limit=limit, offset=offset)

    return ThreadTimelineResponse(
        thread_id=thread_id,
        events=list(events),
        total=len(events),
    )
