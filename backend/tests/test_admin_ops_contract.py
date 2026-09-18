"""批次 5（T2 阶段一）admin 管理面响应契约：专家配置/升级管理员/配额/并发/手机号/删用户。

全键断言锁形态；写路径全部打桩（audit / 缓存刷新 / 配额服务），不连库。
"""

from datetime import datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient

from models import User
from routers import admin as admin_router


def _admin() -> User:
    return User(id="admin-1", username="boss", role="admin")


def _client(sample_user) -> TestClient:
    app = FastAPI()
    app.include_router(admin_router.router)
    app.dependency_overrides[admin_router.get_current_admin] = lambda: sample_user
    app.dependency_overrides[admin_router.get_session] = lambda: object()
    return TestClient(app)


def test_update_expert_contract(sample_user, monkeypatch):
    """专家配置更新：乐观锁新版本号 + ISO 时间戳，4 键锁定。"""

    class _UpdatedExpert:
        id = "exp-1"
        expert_key = "aggregator"
        name = "首席联络官"
        is_dynamic = True
        is_system = False
        config_version = 7
        updated_at = datetime(2026, 9, 18, 8, 0, 0)

    class _ExecResult:
        # 同一结果类兼容两种消费：UPDATE 语句读 rowcount，SELECT 读 first()
        rowcount = 1

        def first(self):
            return _UpdatedExpert()

    class _SessionStub:
        def _session_exec(self, _statement):
            return _ExecResult()

        # 乐观锁 UPDATE 走 SQLAlchemy 风格的 session.execute，SELECT 走 SQLModel 的 exec
        execute = _session_exec
        exec = _session_exec

        def add(self, _obj) -> None:
            pass

        def commit(self) -> None:
            pass

    monkeypatch.setattr(admin_router, "refresh_cache", lambda _session: None)
    app = FastAPI()
    app.include_router(admin_router.router)
    app.dependency_overrides[admin_router.get_current_admin] = lambda: sample_user
    app.dependency_overrides[admin_router.get_session] = lambda: _SessionStub()

    response = TestClient(app).patch(
        "/api/admin/experts/aggregator",
        json={"system_prompt": "这是足够长的系统提示词", "expected_version": 6},
    )

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"message", "expert_key", "config_version", "updated_at"}
    assert body["config_version"] == 7
    assert isinstance(body["updated_at"], str)


def test_promote_user_contract(sample_user, monkeypatch):
    """升级管理员：两分支同键（已是管理员 / 刚升级），email 可空。"""

    class _FakeUser:
        username = "bob"
        email = None
        role = "user"

    class _Result:
        def first(self):
            return _FakeUser()

    class _SessionStub:
        def _session_exec(self, _statement):
            return _Result()

        exec = _session_exec

        def add(self, _obj) -> None:
            pass

        def commit(self) -> None:
            pass

    app = FastAPI()
    app.include_router(admin_router.router)
    app.dependency_overrides[admin_router.get_current_admin] = lambda: sample_user
    app.dependency_overrides[admin_router.get_session] = lambda: _SessionStub()

    response = TestClient(app).post("/api/admin/promote-user", json={"email": "b@x.com"})

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"message", "username", "email"}
    assert body["email"] is None


def test_delete_expert_contract(sample_user, monkeypatch):
    from types import SimpleNamespace

    fake_expert = SimpleNamespace(is_system=False, is_dynamic=True, expert_key="custom-1")

    class _Result:
        def first(self):
            return fake_expert

    class _SessionStub:
        def _session_exec(self, _statement):
            return _Result()

        exec = _session_exec

        def add(self, _obj) -> None:
            pass

        def delete(self, _obj) -> None:
            pass

        def commit(self) -> None:
            pass

    monkeypatch.setattr(admin_router, "refresh_cache", lambda _session: None)
    app = FastAPI()
    app.include_router(admin_router.router)
    app.dependency_overrides[admin_router.get_current_admin] = lambda: sample_user
    app.dependency_overrides[admin_router.get_session] = lambda: _SessionStub()

    response = TestClient(app).delete("/api/admin/experts/custom-1")

    assert response.status_code == 200
    assert set(response.json().keys()) == {"message", "expert_key"}


def test_quota_and_concurrency_contract(sample_user, monkeypatch):
    """两个实例级运维参数 PUT：单键回显（配额 None = 不限量）。两路径都走 record_audit。"""

    class _SessionStub:
        def add(self, _obj) -> None:
            pass

        def commit(self) -> None:
            pass

    monkeypatch.setattr("services.run_quota.save_daily_token_quota", lambda _s, value: value)
    monkeypatch.setattr(
        "services.run_concurrency.save_graph_max_concurrency", lambda _s, value: value
    )

    app = FastAPI()
    app.include_router(admin_router.router)
    app.dependency_overrides[admin_router.get_current_admin] = lambda: sample_user
    app.dependency_overrides[admin_router.get_session] = lambda: _SessionStub()
    client = TestClient(app)

    quota = client.put("/api/admin/user-daily-token-quota", json={"daily_token_quota": 100000})
    assert quota.status_code == 200
    assert quota.json() == {"user_daily_token_quota": 100000}

    unlimited = client.put("/api/admin/user-daily-token-quota", json={"daily_token_quota": None})
    assert unlimited.status_code == 200
    assert unlimited.json() == {"user_daily_token_quota": None}

    concurrency = client.put("/api/admin/graph-max-concurrency", json={"graph_max_concurrency": 2})
    assert concurrency.status_code == 200
    assert concurrency.json() == {"graph_max_concurrency": 2}


def test_user_phone_contract(sample_user):
    class _FakeUser:
        phone_number = "+8613800000000"

    class _SessionStub:
        def get(self, _model, _pk):
            return _FakeUser()

    app = FastAPI()
    app.include_router(admin_router.router)
    app.dependency_overrides[admin_router.get_current_admin] = lambda: sample_user
    app.dependency_overrides[admin_router.get_session] = lambda: _SessionStub()

    response = TestClient(app).get("/api/admin/users/u1/phone")

    assert response.status_code == 200
    assert response.json() == {"phone_number": "+8613800000000"}


def test_delete_user_contract(sample_user, monkeypatch):
    """删用户：{message, deleted_threads}；会话清理链路打桩为空。"""

    class _FakeUser:
        id = "u1"
        username = "bob"

    class _Result:
        def all(self):
            return []

    class _SessionStub:
        def get(self, _model, _pk):
            return _FakeUser()

        def _session_exec(self, _statement):
            return _Result()

        exec = _session_exec

        def add(self, _obj) -> None:
            pass

        def commit(self) -> None:
            pass

        def delete(self, _obj) -> None:
            pass

    async def _noop_delete_thread(self, *a, **kw):
        return None

    monkeypatch.setattr(admin_router.ChatThreadService, "delete_thread", _noop_delete_thread)

    app = FastAPI()
    app.include_router(admin_router.router)
    app.dependency_overrides[admin_router.get_current_admin] = lambda: sample_user
    app.dependency_overrides[admin_router.get_session] = lambda: _SessionStub()

    response = TestClient(app).delete("/api/admin/users/u1")

    assert response.status_code == 200
    assert set(response.json().keys()) == {"message", "deleted_threads"}
