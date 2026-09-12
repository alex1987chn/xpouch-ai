"""
统计 API 路由

提供运行统计和趋势数据。

权限规则：
- admin: 返回全局数据
- 普通用户: 返回自己的数据
"""

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from crud.stats import get_daily_trends, get_run_list, get_run_metrics, get_today_token_usage
from database import get_session
from dependencies import get_current_user
from models import User
from schemas.stats import RunMetrics, RunStatsResponse
from utils.logger import logger

router = APIRouter(prefix="/api/admin/stats", tags=["stats"])


@router.get("/runs", response_model=RunStatsResponse)
async def get_run_stats(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    days: int = Query(default=7, ge=1, le=30),
    search: str | None = Query(default=None, max_length=64),
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RunStatsResponse:
    """
    获取运行统计

    - admin: 返回全局数据
    - 普通用户: 返回自己的数据

    Args:
        limit: 运行列表每页数量（默认 50，最大 100）
        offset: 偏移量
        db: 数据库会话
        current_user: 当前用户

    Returns:
        RunStatsResponse: 统计数据
    """
    is_admin = current_user.role == "admin"
    user_id = None if is_admin else current_user.id

    logger.info(f"[Stats API] 获取运行统计: user_id={current_user.id}, is_admin={is_admin}")

    # 获取核心指标（数据库层聚合）
    metrics_data = get_run_metrics(db, user_id=user_id)
    metrics = RunMetrics(**metrics_data)

    # 获取每日趋势（数据库层聚合）
    trends = get_daily_trends(db, user_id=user_id, days=days)

    # 获取运行列表（分页）
    runs, total_count = get_run_list(db, user_id=user_id, limit=limit, offset=offset, search=search)

    # 今日 token 用量与配额（按请求者口径；配额为全局设置）
    from services.run_quota import load_daily_token_quota

    today_tokens = get_today_token_usage(db, user_id=current_user.id)
    daily_quota = load_daily_token_quota(db)

    return RunStatsResponse(
        is_admin=is_admin,
        today_tokens=today_tokens,
        daily_token_quota=daily_quota,
        metrics=metrics,
        trends=trends,
        runs=runs,
        total_runs_count=total_count,
        limit=limit,
        offset=offset,
    )


@router.get("/tokens-today")
async def get_tokens_today(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """当前用户今日 token 用量 + 全局配额（底栏轻量轮询专供）。"""
    from services.run_quota import load_daily_token_quota

    return {
        "today_tokens": get_today_token_usage(db, user_id=current_user.id),
        "daily_token_quota": load_daily_token_quota(db),
    }
