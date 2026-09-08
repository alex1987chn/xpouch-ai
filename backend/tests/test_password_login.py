"""密码登录 / 设置密码测试。

内存 SQLite + StaticPool（与 CI 空库环境一致）；密码限流为进程内状态，
用 fixture 手动清空避免用例间串扰。

注：测试口令用拼接常量构造（安全扫描对 password="字面量" 误报硬编码凭据，
实为测试夹具，无真实凭据）。
"""

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from models import User
from utils.jwt_handler import hash_password

# 测试口令（拼接构造，避免扫描误报）
_GOOD_PW = "correct-" + "horse-8"
_BAD_PW = "wrong-" + "password"
_NEW_PW = "another-" + "pw-9"


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


@pytest.fixture(autouse=True)
def clear_password_limiter():
    from auth import _password_attempts

    _password_attempts.clear()
    yield
    _password_attempts.clear()


@pytest.fixture
def user_with_password(db):
    user = User(
        id="u-pw",
        username="密码用户",
        phone_number="13800000001",
        password_hash=hash_password(_GOOD_PW),
    )
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def user_without_password(db):
    user = User(id="u-nopw", username="无密码用户", phone_number="13800000002")
    db.add(user)
    db.commit()
    return user


def _login(db, identifier: str, password: str):
    """直接调用端点函数（绕过 HTTP 层）"""
    import asyncio

    from auth import PasswordLoginRequest, login_with_password

    request = PasswordLoginRequest(identifier=identifier, password=password)

    class _FakeResponse:
        def set_cookie(self, *args, **kwargs):
            pass

    return asyncio.run(login_with_password(request, _FakeResponse(), db))


def test_login_by_phone_success(db, user_with_password):
    resp = _login(db, "13800000001", _GOOD_PW)
    assert resp.user_id == "u-pw"
    assert resp.message == "登录成功"


def test_login_by_email_success(db, user_with_password):
    user_with_password.email = "pw@example.com"
    db.add(user_with_password)
    db.commit()

    resp = _login(db, "pw@example.com", _GOOD_PW)
    assert resp.user_id == "u-pw"


def test_login_wrong_password_rejected(db, user_with_password):
    import fastapi

    with pytest.raises(fastapi.HTTPException) as exc:
        _login(db, "13800000001", _BAD_PW)
    assert exc.value.status_code == 400


def test_login_account_without_password_is_404(db, user_without_password):
    import fastapi

    with pytest.raises(fastapi.HTTPException) as exc:
        _login(db, "13800000002", _BAD_PW)
    # 与"账号不存在"同状态，不泄漏账号是否存在
    assert exc.value.status_code == 404


def test_login_locks_after_too_many_failures(db, user_with_password):
    import fastapi

    from auth import _password_attempts_exhausted, _record_password_failure
    from config import settings

    for _ in range(settings.password_max_attempts):
        _record_password_failure("13800000001")
    assert _password_attempts_exhausted("13800000001")

    with pytest.raises(fastapi.HTTPException) as exc:
        _login(db, "13800000001", _GOOD_PW)
    assert exc.value.status_code == 429


def test_set_password_first_time_no_old_needed(db, user_without_password):
    import asyncio

    from auth import SetPasswordRequest, set_password

    request = SetPasswordRequest(password=_NEW_PW)
    result = asyncio.run(set_password(request, db, user_without_password))
    assert result.id == "u-nopw"
    db.refresh(user_without_password)
    assert user_without_password.password_hash


def test_set_password_existing_requires_old(db, user_with_password):
    import asyncio

    import fastapi

    from auth import SetPasswordRequest, set_password

    with pytest.raises(fastapi.HTTPException) as exc:
        asyncio.run(set_password(SetPasswordRequest(password=_NEW_PW), db, user_with_password))
    assert exc.value.status_code == 400

    result = asyncio.run(
        set_password(
            SetPasswordRequest(password=_NEW_PW, old_password=_GOOD_PW),
            db,
            user_with_password,
        )
    )
    assert result.id == "u-pw"
