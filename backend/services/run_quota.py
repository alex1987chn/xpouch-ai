"""用户日 token 配额（公共注册站成本止损的第二道闸）。

配额存 system_setting 表（key=user_daily_token_quota，int 字符串），
空/缺失/非法 = 不限量。在新 run 创建前由 chat 路由拦截（HITL 恢复
不拦截，避免打断进行中的多专家任务）。
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlmodel import Session

from models import AgentRun, SystemSetting
from utils.logger import logger
from utils.time import utc_now_naive

USER_DAILY_TOKEN_QUOTA_KEY = "user_daily_token_quota"


def load_daily_token_quota(session: Session) -> int | None:
    """读取全局每用户日 token 配额；未配置/非法值返回 None（不限量）。"""
    stored = session.get(SystemSetting, USER_DAILY_TOKEN_QUOTA_KEY)
    if not stored:
        return None
    try:
        quota = int(stored.value)
    except (TypeError, ValueError):
        logger.warning("[RunQuota] 配额值非法: %r，按不限量处理", stored.value)
        return None
    return quota if quota > 0 else None


def save_daily_token_quota(session: Session, quota: int | None) -> int | None:
    """写入全局每用户日 token 配额（None/0 = 不限量）。"""
    if not quota or quota <= 0:
        stored = session.get(SystemSetting, USER_DAILY_TOKEN_QUOTA_KEY)
        if stored:
            session.delete(stored)
            session.commit()
        return None
    payload = str(int(quota))
    stored = session.get(SystemSetting, USER_DAILY_TOKEN_QUOTA_KEY)
    if stored:
        stored.value = payload
        session.add(stored)
    else:
        session.add(SystemSetting(key=USER_DAILY_TOKEN_QUOTA_KEY, value=payload))
    session.commit()
    return quota


def today_token_usage_exceeds_quota(session: Session, user_id: str, quota: int) -> bool:
    """该用户今日（UTC 日界）已产生的 token 总量是否已达配额。

    select 必须用 **sqlalchemy** 的（与 crud.stats.get_today_token_usage 同款）：
    sqlmodel 的 select 单列聚合经 Session.exec 会得到 ScalarResult 直接给 int，
    `used[0]` 会 TypeError——这是 da19a1c 修过的同族问题的漏网之鱼（配额
    未设置时此函数不被调用，故长期潜伏）。
    """
    today_start = utc_now_naive().replace(hour=0, minute=0, second=0, microsecond=0)
    used = session.exec(
        select(func.coalesce(func.sum(AgentRun.total_tokens), 0)).where(
            AgentRun.user_id == user_id,
            AgentRun.started_at >= today_start,
        )
    ).one()
    return int(used[0] or 0) >= quota


def quota_reset_hint() -> str:
    """配额重置时间提示（UTC 日界）。"""
    tomorrow = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(
        days=1
    )
    return tomorrow.strftime("%H:%M UTC")
