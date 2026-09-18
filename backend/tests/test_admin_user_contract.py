"""管理员创建/重置密码两端点的一次性明文密码契约。

回归背景（盘点 T2 时发现）：create_user 往返回 dict 里注入 generated_password，
但端点 response_model=AdminUserResponse 没有该字段——FastAPI 按模型过滤后
**随机初始密码被静默剥掉**，前端 AddUserDialog 拿不到密码可展示，管理员用
随机密码建出来的用户无法交付初始凭据。

本文件锁住「一次性明文必须真的到达响应」，并钉住 reset-password 的条件键
（password 仅随机模式非空）。
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from models import User
from routers import admin as admin_router


class _SessionStub:
    """最小会话替身：唯一性查询一律「无冲突」，写操作静默成功。"""

    def _session_exec(self, _statement):
        class _Result:
            def first(self):
                return None

        return _Result()

    # SQLModel Session 的方法名就叫 exec；按本仓测试惯例以赋值别名暴露
    exec = _session_exec

    def add(self, _obj) -> None:
        pass

    def commit(self) -> None:
        pass

    def refresh(self, _obj) -> None:
        pass

    def get(self, _model, _pk):
        return _user_fixture()


def _user_fixture() -> User:
    return User(
        id="user-1",
        username="bob",
        phone_number="+8613800000000",
        email=None,
        role="user",
        plan="free",
    )


def _admin_client(sample_user) -> TestClient:
    app = FastAPI()
    app.include_router(admin_router.router)
    app.dependency_overrides[admin_router.get_current_admin] = lambda: sample_user
    app.dependency_overrides[admin_router.get_session] = lambda: _SessionStub()
    return TestClient(app)


def test_create_user_random_password_reaches_response(sample_user):
    """随机初始密码必须出现在响应里——它只此一次、服务端不留明文，被剥掉就永远丢了。"""
    response = _admin_client(sample_user).post(
        "/api/admin/users",
        json={
            "username": "bob",
            "phone_number": "+8613800000000",
            "generate_random_password": True,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body.get("generated_password"), (
        "generated_password 被 response_model 过滤：管理员拿不到一次性初始密码"
    )
    assert set(body.keys()) == {
        "id",
        "username",
        "email",
        "phone_masked",
        "has_phone",
        "avatar",
        "role",
        "plan",
        "created_at",
        "last_login_at",
        "generated_password",
    }


def test_create_user_without_random_password_has_no_password_key(sample_user):
    """指定初始密码 / 无密码创建时，generated_password 为 null（键恒在、值可空）。"""
    response = _admin_client(sample_user).post(
        "/api/admin/users",
        json={"username": "bob", "phone_number": "+8613800000000"},
    )

    assert response.status_code == 201
    assert response.json()["generated_password"] is None


def test_reset_password_random_mode_returns_password_once(sample_user):
    """随机模式：password 仅此一次返回，三键形态锁定。"""
    response = _admin_client(sample_user).post(
        "/api/admin/users/user-1/reset-password",
        json={"mode": "random"},
    )

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"message", "generated", "password"}
    assert body["generated"] is True
    assert body["password"]


def test_reset_password_custom_mode_omits_password(sample_user):
    """自定义模式：密码不入响应（管理员自己指定的，无需回传）。"""
    response = _admin_client(sample_user).post(
        "/api/admin/users/user-1/reset-password",
        json={"mode": "custom", "password": "Sup3rSecret!"},
    )

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"message", "generated", "password"}
    assert body["generated"] is False
    assert body["password"] is None
