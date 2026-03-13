"""
统计 CRUD 层

所有聚合计算必须在数据库层完成（使用 func.count/group_by）。
禁止在内存中遍历聚合。

关键约束：
1. runs 列表必须分页（默认 50 条）
2. 所有统计使用 SQLAlchemy 聚合函数
"""

from datetime import datetime, timedelta

from sqlalchemy import case, func, select
from sqlmodel import Session

from models import AgentRun, RunEvent, User
from models.enums import RunEventType, RunStatus


def get_run_metrics(
    db: Session,
    *,
    user_id: str | None = None,
    since: datetime | None = None,
) -> dict:
    """
    获取运行核心指标（数据库层聚合）

    Args:
        db: 数据库会话
        user_id: 用户 ID（None 表示全局统计）
        since: 起始时间（None 表示不限制）

    Returns:
        包含 total_runs, success_count, failed_count, hitl_count, avg_duration_ms 的字典
    """
    # 构建基础查询条件
    base_conditions = []
    if user_id:
        base_conditions.append(AgentRun.user_id == user_id)
    if since:
        base_conditions.append(AgentRun.created_at >= since)

    # 单次查询获取所有计数（数据库层聚合）
    # 使用 case when 进行条件计数
    stmt = select(
        func.count(AgentRun.id).label("total_runs"),
        func.sum(
            case(
                (AgentRun.status == RunStatus.COMPLETED, 1),
                else_=0,
            )
        ).label("success_count"),
        func.sum(
            case(
                (AgentRun.status.in_([RunStatus.FAILED, RunStatus.TIMED_OUT]), 1),
                else_=0,
            )
        ).label("failed_count"),
        func.avg(
            case(
                (
                    AgentRun.completed_at.is_not(None),
                    func.extract("epoch", AgentRun.completed_at - AgentRun.started_at) * 1000,
                ),
                else_=None,
            )
        ).label("avg_duration_ms"),
    ).where(*base_conditions)

    result = db.exec(stmt).first()

    # 单独查询 HITL 次数（需要 join RunEvent）
    hitl_stmt = select(func.count(RunEvent.id)).where(
        RunEvent.event_type == RunEventType.HITL_INTERRUPTED
    )
    if user_id:
        # 通过 AgentRun 关联过滤
        hitl_stmt = hitl_stmt.join(AgentRun).where(AgentRun.user_id == user_id)
    if since:
        hitl_stmt = hitl_stmt.where(RunEvent.timestamp >= since)

    hitl_result = db.exec(hitl_stmt).first()
    hitl_count = hitl_result[0] if hitl_result else 0

    total_runs = result.total_runs or 0
    success_count = int(result.success_count or 0)
    failed_count = int(result.failed_count or 0)

    return {
        "total_runs": total_runs,
        "success_count": success_count,
        "failed_count": failed_count,
        "hitl_count": hitl_count,
        "avg_duration_ms": float(result.avg_duration_ms or 0),
        "success_rate": round(success_count / total_runs * 100, 1) if total_runs > 0 else 0.0,
    }


def get_daily_trends(
    db: Session,
    *,
    user_id: str | None = None,
    days: int = 7,
) -> list[dict]:
    """
    获取每日趋势数据（数据库层聚合）

    使用 PostgreSQL 的 date_trunc 函数按天分组。

    Args:
        db: 数据库会话
        user_id: 用户 ID（None 表示全局统计）
        days: 统计天数（默认 7 天）

    Returns:
        每日趋势列表
    """
    since = datetime.now() - timedelta(days=days)

    # 使用 date_trunc 按天分组聚合
    # 注意：GROUP BY 必须使用与 SELECT 相同的表达式
    date_trunc_expr = func.date_trunc("day", AgentRun.created_at)
    stmt = (
        select(
            date_trunc_expr.label("date"),
            func.count(AgentRun.id).label("total_count"),
            func.sum(
                case(
                    (AgentRun.status == RunStatus.COMPLETED, 1),
                    else_=0,
                )
            ).label("success_count"),
            func.sum(
                case(
                    (AgentRun.status.in_([RunStatus.FAILED, RunStatus.TIMED_OUT]), 1),
                    else_=0,
                )
            ).label("failed_count"),
        )
        .where(AgentRun.created_at >= since)
        .group_by(date_trunc_expr)
        .order_by(date_trunc_expr.asc())
    )

    if user_id:
        stmt = stmt.where(AgentRun.user_id == user_id)

    results = db.exec(stmt).all()

    return [
        {
            "date": row.date.strftime("%Y-%m-%d") if row.date else "",
            "total_count": int(row.total_count or 0),
            "success_count": int(row.success_count or 0),
            "failed_count": int(row.failed_count or 0),
        }
        for row in results
    ]


def get_run_list(
    db: Session,
    *,
    user_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """
    获取运行列表（分页）

    Args:
        db: 数据库会话
        user_id: 用户 ID（None 表示全局）
        limit: 每页数量（默认 50）
        offset: 偏移量

    Returns:
        (运行列表, 总数)
    """
    # 构建基础查询
    base_stmt = select(AgentRun)

    if user_id:
        base_stmt = base_stmt.where(AgentRun.user_id == user_id)

    # 获取总数
    count_stmt = select(func.count(AgentRun.id))
    if user_id:
        count_stmt = count_stmt.where(AgentRun.user_id == user_id)
    total_result = db.exec(count_stmt).first()
    total_count = total_result[0] if total_result else 0

    # 获取列表（按创建时间倒序）
    # 计算耗时（completed_at - started_at）
    stmt = base_stmt.order_by(AgentRun.created_at.desc()).limit(limit).offset(offset)

    runs = db.exec(stmt).scalars().all()

    # 获取用户名（仅全局查询需要 join）
    user_names = {}
    if user_id is None:
        user_ids = {r.user_id for r in runs if r.user_id}
        if user_ids:
            users = db.exec(select(User).where(User.id.in_(user_ids))).scalars().all()
            user_names = {u.id: u.username or u.id[:8] for u in users}

    # 构建结果
    result = []
    for run in runs:
        duration_ms = None
        if run.completed_at and run.started_at:
            duration_ms = int((run.completed_at - run.started_at).total_seconds() * 1000)

        result.append(
            {
                "run_id": run.id,
                "thread_id": run.thread_id,
                "user_id": run.user_id if user_id is None else None,
                "user_name": user_names.get(run.user_id) if user_id is None else None,
                "mode": run.mode,
                "status": run.status,
                "duration_ms": duration_ms,
                "created_at": run.created_at,
                "completed_at": run.completed_at,
            }
        )

    return result, total_count
