"""密码登录防爆破：内存滑动窗口（identifier 维度，进程内语义）。

注意：gunicorn 多 worker 部署时各进程独立计数（上限 ×N），
迁多 worker 前需换 Redis 等共享存储。
"""

from collections import defaultdict, deque
from time import monotonic

from config import settings

_password_attempts: dict[str, deque[float]] = defaultdict(deque)


def _password_attempts_exhausted(identifier: str) -> bool:
    """窗口内失败次数是否已达上限（不在窗口内的旧记录顺手清理）"""
    now = monotonic()
    window = settings.password_attempt_window_minutes * 60
    hits = _password_attempts[identifier]
    while hits and now - hits[0] > window:
        hits.popleft()
    return len(hits) >= settings.password_max_attempts


def _record_password_failure(identifier: str) -> None:
    _password_attempts[identifier].append(monotonic())


def _reset_password_failures(identifier: str) -> None:
    _password_attempts.pop(identifier, None)
