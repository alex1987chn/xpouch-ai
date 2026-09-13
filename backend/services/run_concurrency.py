"""图内并发上限：同层就绪任务的并行度（`agents/plan_waves.select_wave` 的参数）。

读取链（与 `services/run_quota.py` 同一套模式）：**system_setting 表 →
`settings.graph_max_concurrency`（env）**。缺失/非法一律退回 **1 = 串行**：
默认绝不能并发——并发会改变执行顺序、也更容易撞 provider 限流，必须是显式选择。

值域：`1..MAX_CONCURRENCY_LIMIT`。上限不是性能判断，是防手滑（写成 1000 会把
provider 打爆、把 run 变成 DDoS）。写库时按上限夹紧，读到越界值也按上限处理。
"""

from sqlmodel import Session

from models import SystemSetting
from utils.logger import logger

GRAPH_MAX_CONCURRENCY_KEY = "graph_max_concurrency"

# 可配置的上限（页面输入框与服务端校验共用这一个值）
MAX_CONCURRENCY_LIMIT = 8

# 兜底值：串行
SERIAL = 1


def clamp_concurrency(value: int) -> int:
    """把并发值夹到合法区间（<1 视作 1，>上限按上限）。"""
    return max(SERIAL, min(int(value), MAX_CONCURRENCY_LIMIT))


def load_graph_max_concurrency(session: Session) -> int | None:
    """读取设置表里的并发上限；未配置/非法返回 None（交给 env 兜底）。"""
    stored = session.get(SystemSetting, GRAPH_MAX_CONCURRENCY_KEY)
    if not stored:
        return None
    try:
        value = int(stored.value)
    except (TypeError, ValueError):
        logger.warning("[RunConcurrency] 并发上限值非法: %r，按未配置处理", stored.value)
        return None
    if value < SERIAL:
        logger.warning("[RunConcurrency] 并发上限 %s 非法（<1），按未配置处理", value)
        return None
    return clamp_concurrency(value)


def save_graph_max_concurrency(session: Session, value: int | None) -> int:
    """写入并发上限（None/<=1 视为「恢复串行」，直接删除该键）。"""
    if not value or int(value) <= SERIAL:
        stored = session.get(SystemSetting, GRAPH_MAX_CONCURRENCY_KEY)
        if stored:
            session.delete(stored)
            session.commit()
        return SERIAL

    clamped = clamp_concurrency(value)
    payload = str(clamped)
    stored = session.get(SystemSetting, GRAPH_MAX_CONCURRENCY_KEY)
    if stored:
        stored.value = payload
        session.add(stored)
    else:
        session.add(SystemSetting(key=GRAPH_MAX_CONCURRENCY_KEY, value=payload))
    session.commit()
    return clamped


def resolve_graph_max_concurrency(session: Session | None = None) -> int:
    """本次运行实际使用的并发上限：设置表 → env → 串行。"""
    from config import settings

    if session is not None:
        from_setting = load_graph_max_concurrency(session)
        if from_setting is not None:
            return from_setting
    return clamp_concurrency(settings.graph_max_concurrency or SERIAL)
