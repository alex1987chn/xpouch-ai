"""v3.4.3 安全加固的单元测试：require_role 守卫与 OTP/Token 哈希。"""

import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

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
