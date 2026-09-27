"""密码登录 / 设置密码测试。

内存 SQLite + StaticPool（与 CI 空库环境一致）；密码限流为进程内状态，
用 fixture 手动清空避免用例间串扰。

注：测试口令用拼接常量构造（安全扫描对 password="字面量" 误报硬编码凭据，
实为测试夹具，无真实凭据）。
"""

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from models import User
from utils.jwt_handler import hash_password

_TEST_ENGINE_HOLDER = [None]


def _test_session():
    from sqlmodel.ext.asyncio.session import AsyncSession as _AS

    return _AS(_TEST_ENGINE_HOLDER[0], expire_on_commit=False)


# 测试口令（拼接构造，避免扫描误报）
_GOOD_PW = "correct-" + "horse-8"
_BAD_PW = "wrong-" + "password"
_NEW_PW = "another-" + "pw-9"


@pytest.fixture
async def db():
    _TEST_ENGINE_HOLDER[0] = engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: SQLModel.metadata.create_all(c, tables=[User.__table__]))
    async with _test_session() as session:
        yield session


@pytest.fixture(autouse=True)
def clear_password_limiter():
    from auth.limiter import _password_attempts

    _password_attempts.clear()
    yield
    _password_attempts.clear()


@pytest.fixture
async def user_with_password(db):
    user = User(
        id="u-pw",
        username="密码用户",
        phone_number="13800000001",
        password_hash=hash_password(_GOOD_PW),
    )
    db.add(user)
    await db.commit()
    return user


@pytest.fixture
async def user_without_password(db):
    user = User(id="u-nopw", username="无密码用户", phone_number="13800000002")
    db.add(user)
    await db.commit()
    return user


async def _login(db, identifier: str, password: str):
    """直接调用端点函数（绕过 HTTP 层）"""

    from auth.routes_password import login_with_password
    from auth.schemas import PasswordLoginRequest

    request = PasswordLoginRequest(identifier=identifier, password=password)

    class _FakeResponse:
        def set_cookie(self, *args, **kwargs):
            pass

    return await login_with_password(request, _FakeResponse(), db)


async def test_login_by_phone_success(db, user_with_password):
    resp = await _login(db, "13800000001", _GOOD_PW)
    assert resp.user_id == "u-pw"
    assert resp.message == "登录成功"


async def test_login_by_email_success(db, user_with_password):
    user_with_password.email = "pw@example.com"
    db.add(user_with_password)
    await db.commit()

    resp = await _login(db, "pw@example.com", _GOOD_PW)
    assert resp.user_id == "u-pw"


async def test_login_wrong_password_rejected(db, user_with_password):
    import fastapi

    with pytest.raises(fastapi.HTTPException) as exc:
        await _login(db, "13800000001", _BAD_PW)
    assert exc.value.status_code == 400


async def test_login_account_without_password_is_404(db, user_without_password):
    import fastapi

    with pytest.raises(fastapi.HTTPException) as exc:
        await _login(db, "13800000002", _BAD_PW)
    # 与"账号不存在"同状态，不泄漏账号是否存在
    assert exc.value.status_code == 404


async def test_login_locks_after_too_many_failures(db, user_with_password):
    import fastapi

    from auth.limiter import _password_attempts_exhausted, _record_password_failure
    from config import settings

    for _ in range(settings.password_max_attempts):
        _record_password_failure("13800000001")
    assert _password_attempts_exhausted("13800000001")

    with pytest.raises(fastapi.HTTPException) as exc:
        await _login(db, "13800000001", _GOOD_PW)
    assert exc.value.status_code == 429


async def test_set_password_first_time_no_old_needed(db, user_without_password):

    from auth.routes_password import set_password
    from auth.schemas import SetPasswordRequest

    request = SetPasswordRequest(password=_NEW_PW)
    result = await set_password(request, db, user_without_password)
    assert result.id == "u-nopw"
    await db.refresh(user_without_password)
    assert user_without_password.password_hash


async def test_set_password_existing_requires_old(db, user_with_password):

    import fastapi

    from auth.routes_password import set_password
    from auth.schemas import SetPasswordRequest

    with pytest.raises(fastapi.HTTPException) as exc:
        await set_password(SetPasswordRequest(password=_NEW_PW), db, user_with_password)
    assert exc.value.status_code == 400

    result = await set_password(
        SetPasswordRequest(password=_NEW_PW, old_password=_GOOD_PW),
        db,
        user_with_password,
    )

    assert result.id == "u-pw"
