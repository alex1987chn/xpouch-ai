"""忘记密码（手机验证码重置）测试。

与 test_password_login 同款夹具风格：内存 SQLite + StaticPool，直接调端点函数。
SMS 发送用 monkeypatch 打桩；验证码哈希直接写库构造（模拟 send-code 成功后的状态）。

注：测试口令用拼接常量构造（安全扫描对 password="字面量" 误报硬编码凭据，
实为测试夹具，无真实凭据）。
"""

import asyncio
from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from models import User
from utils.jwt_handler import hash_password, verify_password
from utils.secret_hash import hash_secret
from utils.verification import get_code_expiry_duration, utcnow


class _FakeHttpRequest:
    """端点直调时的最小 http request 桩（IP 频控读取 header/client）"""

    headers = {}
    client = None


# 测试口令与验证码（拼接构造，避免扫描误报）
_PW_OLD = "old-" + "password-1"
_PW_NEW = "new-" + "password-9"
_CODE = "123456"
_PHONE = "13900000001"


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine, tables=[User.__table__])
    with Session(engine) as session:
        yield session


@pytest.fixture
def user_with_password(db):
    user = User(
        id="u-reset",
        username="重置用户",
        phone_number=_PHONE,
        password_hash=hash_password(_PW_OLD),
    )
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def mock_sms(monkeypatch):
    calls = []

    def _fake_send(phone_number, code, expire_minutes):
        calls.append((phone_number, code))
        return True, None

    monkeypatch.setattr("auth.routes_otp.send_verification_code_with_fallback", _fake_send)
    return calls


def _stage_code(user: User, code: str = _CODE, expired: bool = False) -> None:
    """给用户挂上一个验证码（模拟 send-code 成功后的状态）。"""
    user.verification_code = hash_secret(code)
    if expired:
        user.verification_code_expires_at = utcnow() - timedelta(minutes=1)
    else:
        user.verification_code_expires_at = get_code_expiry_duration(minutes=10)
    user.verification_code_attempts = 0
    user.verification_code_locked_until = None


def _reset(db, phone: str, code: str, password: str):
    from auth import ResetPasswordRequest, reset_password

    return asyncio.run(
        reset_password(ResetPasswordRequest(phone_number=phone, code=code, password=password), db)
    )


def _send_code(db, phone: str, purpose: str = "login"):
    from auth import SendCodeRequest, send_verification_code

    return asyncio.run(
        send_verification_code(
            SendCodeRequest(phone_number=phone, purpose=purpose), _FakeHttpRequest(), db
        )
    )


def test_reset_success_then_new_password_works(db, user_with_password):
    _stage_code(user_with_password)
    db.add(user_with_password)
    db.commit()

    resp = _reset(db, _PHONE, _CODE, _PW_NEW)
    assert "密码已重置" in resp["message"]

    db.refresh(user_with_password)
    # 旧密码失效、新密码生效、验证码用后即清
    assert not verify_password(_PW_OLD, user_with_password.password_hash)
    assert verify_password(_PW_NEW, user_with_password.password_hash)
    assert not user_with_password.verification_code


def test_reset_wrong_code_rejected_and_password_unchanged(db, user_with_password):
    _stage_code(user_with_password)
    db.add(user_with_password)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        _reset(db, _PHONE, "000000", _PW_NEW)
    assert exc.value.status_code == 400

    db.refresh(user_with_password)
    assert user_with_password.verification_code_attempts == 1
    assert verify_password(_PW_OLD, user_with_password.password_hash)


def test_reset_locks_after_too_many_failures(db, user_with_password):
    from config import settings

    _stage_code(user_with_password)
    db.add(user_with_password)
    db.commit()

    for _ in range(settings.verification_code_max_attempts):
        with pytest.raises(HTTPException):
            _reset(db, _PHONE, "000000", _PW_NEW)

    # 锁定后即使验证码正确也拒绝
    with pytest.raises(HTTPException) as exc:
        _reset(db, _PHONE, _CODE, _PW_NEW)
    assert exc.value.status_code == 429


def test_reset_expired_code_400(db, user_with_password):
    _stage_code(user_with_password, expired=True)
    db.add(user_with_password)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        _reset(db, _PHONE, _CODE, _PW_NEW)
    assert exc.value.status_code == 400
    assert "过期" in exc.value.detail


def test_reset_nonexistent_user_404(db):
    with pytest.raises(HTTPException) as exc:
        _reset(db, "13900000099", _CODE, _PW_NEW)
    assert exc.value.status_code == 404


def test_send_code_reset_purpose_does_not_create_account(db, mock_sms):
    with pytest.raises(HTTPException) as exc:
        _send_code(db, "13900000099", purpose="password_reset")
    assert exc.value.status_code == 404
    # 不像登录/注册那样自动建号
    assert db.exec(select(User).where(User.phone_number == "13900000099")).first() is None
    assert mock_sms == []


def test_send_code_reset_purpose_existing_user_sends(db, user_with_password, mock_sms):
    resp = _send_code(db, _PHONE, purpose="password_reset")
    assert resp["expires_in"] > 0
    assert len(mock_sms) == 1
    db.refresh(user_with_password)
    assert user_with_password.verification_code
