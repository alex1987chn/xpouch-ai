"""v3.4.3 安全加固的单元测试：require_role 守卫与 OTP/Token 哈希。"""

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from types import SimpleNamespace  # noqa: E402

from dependencies import require_role  # noqa: E402
from models.enums import UserRole  # noqa: E402
from utils.secret_hash import compare_hash, hash_secret  # noqa: E402
from utils.verification import VerificationCodeInvalidError, verify_code  # noqa: E402

# ============================================================================
# require_role 守卫
# ============================================================================


class _FakeUser:
    def __init__(self, uid: str, role: UserRole):
        self.id = uid
        self.role = role


@pytest.mark.asyncio
async def test_require_role_allows_matching_role():
    guard = require_role(UserRole.ADMIN)
    user = await guard(_FakeUser("u1", UserRole.ADMIN))
    assert user.id == "u1"


@pytest.mark.asyncio
async def test_require_role_rejects_plain_user_for_admin_surface():
    """回归：普通 USER 不得通过 admin 面（v3.4.7 双角色收敛后唯一守卫语义）。"""
    guard = require_role(UserRole.ADMIN)
    with pytest.raises(HTTPException) as exc_info:
        await guard(_FakeUser("u2", UserRole.USER))
    assert exc_info.value.status_code == 403


# ============================================================================
# secret_hash
# ============================================================================


def test_hash_secret_deterministic_and_hex():
    h1 = hash_secret("123456")
    h2 = hash_secret("123456")
    assert h1 == h2
    assert len(h1) == 64
    int(h1, 16)  # 合法 hex


def test_compare_hash_roundtrip():
    stored = hash_secret("654321")
    assert compare_hash(stored, "654321") is True
    assert compare_hash(stored, "000000") is False


def test_compare_hash_rejects_none_and_empty():
    assert compare_hash(None, "123456") is False
    assert compare_hash("", "123456") is False


def test_compare_hash_rejects_legacy_plaintext():
    """存量明文行：比对失败而非异常（用户重发验证码即恢复）。"""
    assert compare_hash("123456", "123456") is False


# ============================================================================
# verify_code 与哈希存储的集成语义
# ============================================================================


def test_verify_code_accepts_hashed_storage():
    stored = hash_secret("246810")
    assert verify_code(stored, "246810", expires_at=None) is True


def test_verify_code_rejects_wrong_code_with_hashed_storage():
    stored = hash_secret("246810")
    with pytest.raises(VerificationCodeInvalidError):
        verify_code(stored, "111111", expires_at=None)


# ============================================================================
# 首跑 bootstrap：空库首注册者自动 admin
# ============================================================================


class _OneResult:
    """exec().one() 聚合结果桩（模块级，避免函数内定义类）"""

    def __init__(self, value):
        self._value = value

    def one(self):
        return self._value


def _count_session(count: int):
    """user 表行数固定的会话桩"""
    session = MagicMock()
    session.exec.return_value = _OneResult(count)
    return session


def test_fresh_install_detection():
    from auth.routes_otp import _is_fresh_install

    assert _is_fresh_install(_count_session(0)) is True
    assert _is_fresh_install(_count_session(3)) is False


# ============================================================================
# 发码 IP 频控（内存滑动窗口）
# ============================================================================


def test_sms_ip_limit_window_and_isolation():
    from auth.limiter import _sms_by_ip, record_sms_send, sms_ip_limit_exhausted

    _sms_by_ip.pop("203.0.113.10", None)
    _sms_by_ip.pop("203.0.113.11", None)
    for _ in range(3):
        record_sms_send("203.0.113.10")
    assert sms_ip_limit_exhausted("203.0.113.10", window_seconds=3600, max_sends=3) is True
    assert sms_ip_limit_exhausted("203.0.113.11", window_seconds=3600, max_sends=3) is False


def test_extract_client_ip_prefers_forwarded_first_hop():
    from auth.limiter import extract_client_ip

    req = SimpleNamespace(headers={"X-Forwarded-For": "203.0.113.9, 10.0.0.1"}, client=None)
    req2 = SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))

    assert extract_client_ip(req) == "203.0.113.9"
    assert extract_client_ip(req2) == "127.0.0.1"
