"""审计日志 CRUD（管理面关键变更留痕，append-only）。"""

from sqlalchemy import func
from sqlmodel import Session, select

from models import AuditLog
from utils.time import utc_now


def record_audit(
    db: Session,
    *,
    actor_user_id: str | None,
    actor_username: str,
    action: str,
    target: str | None = None,
    detail: dict | None = None,
) -> AuditLog:
    """写一条审计记录（只 add 不 commit，事务边界由调用方决定）。"""
    entry = AuditLog(
        actor_user_id=actor_user_id,
        actor_username=actor_username,
        action=action,
        target=target,
        detail=detail,
        created_at=utc_now(),
    )
    db.add(entry)
    return entry


def list_audit_logs(
    db: Session,
    *,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AuditLog], int]:
    """审计日志列表（时间倒序；search 匹配操作者/动作/对象）。"""
    base = select(AuditLog)
    count_stmt = select(func.count(AuditLog.id))
    if search:
        like = f"%{search.strip()}%"
        condition = (
            AuditLog.actor_username.ilike(like)
            | AuditLog.action.ilike(like)
            | AuditLog.target.ilike(like)
        )
        base = base.where(condition)
        count_stmt = count_stmt.where(condition)

    # 计数与仓内惯例一致用 .one()：本版本 sqlmodel 对单列聚合返回标量 int，
    # 此前写法 .first()[0] 把 int 当 Row 下标 → 接口 500，审计面板从上线起就渲染不出列表
    total_count = db.exec(count_stmt).one()

    stmt = base.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit).offset(offset)
    return list(db.exec(stmt).all()), total_count
