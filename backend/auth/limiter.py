"""认证相关防滥用：内存滑动窗口（进程内语义）。

注意：gunicorn 多 worker 部署时各进程独立计数（上限 ×N），
迁多 worker 前需换 Redis 等共享存储。
"""

from collections import defaultdict, deque
from time import monotonic

from config import settings

_password_attempts: dict[str, deque[float]] = defaultdict(deque)
_sms_by_ip: dict[str, deque[float]] = defaultdict(deque)


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


# ---------------------------------------------------------------------------
# 发码 IP 频控（公共注册站短信成本止损：每条验证码都是真实计费）
# ---------------------------------------------------------------------------


def sms_ip_limit_exhausted(ip: str, *, window_seconds: int, max_sends: int) -> bool:
    """该 IP 窗口内发码次数是否已达上限（不在窗口内的旧记录顺手清理）"""
    now = monotonic()
    hits = _sms_by_ip[ip]
    while hits and now - hits[0] > window_seconds:
        hits.popleft()
    return len(hits) >= max_sends


def record_sms_send(ip: str) -> None:
    """记录一次成功发码（仅成功计费的次数计入，失败不占额度）"""
    _sms_by_ip[ip].append(monotonic())


def extract_client_ip(request) -> str:
    """取客户端 IP：优先 X-Forwarded-For 首跳（自部署常规反代拓扑），回退直连地址。"""
    forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    return request.client.host if request.client else "unknown"
