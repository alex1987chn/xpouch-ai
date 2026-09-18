"""system 路由响应契约（T2 阶段一 · 批次 3）：探活 / 模型列表 / 全局偏好 / 用量汇总。

全键断言锁住响应形态；handler 里的延迟 import（providers_config、llm_factory）
按源模块打桩，模块顶层导入的偏好读写打在 system 命名空间上。
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import system as system_router


def _client(sample_user) -> TestClient:
    app = FastAPI()
    app.include_router(system_router.router)
    app.dependency_overrides[system_router.get_current_user_with_auth] = lambda: sample_user
    app.dependency_overrides[system_router.get_session] = lambda: object()
    return app


def test_root_and_health_shape(sample_user):
    app = _client(sample_user)
    client = TestClient(app)

    root = client.get("/api/")
    assert root.status_code == 200
    assert set(root.json().keys()) == {"status", "message"}

    health = client.get("/api/health")
    assert health.status_code == 200
    body = health.json()
    assert set(body.keys()) == {"status", "timestamp"}
    assert isinstance(body["timestamp"], str)


def test_models_list_contract(sample_user, monkeypatch):
    """模型列表条目 8 键锁定（providers.yaml models 段投影）。"""
    monkeypatch.setattr(
        "providers_config.get_available_models",
        lambda: [
            {
                "id": "deepseek-flash",
                "provider": "deepseek",
                "provider_name": "DeepSeek",
                "model": "deepseek-v4-flash",
                "name": "DeepSeek Flash",
                "context_window": 32768,
                "thinking_toggle": True,
                "vision": False,
            }
        ],
    )

    response = TestClient(_client(sample_user)).get("/api/models")

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"models"}
    assert set(body["models"][0].keys()) == {
        "id",
        "provider",
        "provider_name",
        "model",
        "name",
        "context_window",
        "thinking_toggle",
        "vision",
    }


def test_get_user_settings_contract(sample_user, monkeypatch):
    """偏好读取：{preferences(2键), default_model(2键)}。"""
    monkeypatch.setattr(
        system_router,
        "load_model_preferences",
        lambda _session: {"simple_model": None, "simple_thinking": "auto"},
    )
    monkeypatch.setattr("providers_config.get_provider_config", lambda _name: {"name": "DeepSeek"})
    monkeypatch.setattr("utils.llm_factory.get_default_model", lambda: "deepseek-flash")

    response = TestClient(_client(sample_user)).get("/api/user/settings")

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"preferences", "default_model"}
    assert set(body["preferences"].keys()) == {"simple_model", "simple_thinking"}
    assert set(body["default_model"].keys()) == {"id", "name"}


def test_update_user_settings_contract(sample_user, monkeypatch):
    """偏好写入（仅 ADMIN）：响应只回 preferences。"""
    monkeypatch.setattr(
        "providers_config.get_available_models",
        lambda: [{"id": "deepseek-flash"}],
    )
    monkeypatch.setattr(
        system_router,
        "save_model_preferences",
        lambda _session, *, simple_model, simple_thinking: {
            "simple_model": simple_model,
            "simple_thinking": simple_thinking,
        },
    )

    app = _client(sample_user)
    # PUT 端点的角色依赖是装饰时内联创建的 require_role(...) 闭包，
    # 从源 router 保留的 APIRoute（include 后 app.routes 只见嵌套包装）取原对象做覆盖
    put_route = next(
        r
        for r in system_router.router.routes
        if getattr(r, "path", None) == "/api/user/settings"
        and "PUT" in getattr(r, "methods", set())
    )
    admin_dep = next(d.call for d in put_route.dependant.dependencies if d.name == "current_user")
    app.dependency_overrides[admin_dep] = lambda: sample_user

    response = TestClient(app).put(
        "/api/user/settings",
        json={"simple_model": "deepseek-flash", "simple_thinking": "auto"},
    )

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"preferences"}
    assert body["preferences"] == {"simple_model": "deepseek-flash", "simple_thinking": "auto"}


def test_usage_summary_contract(sample_user):
    """用量汇总：today / total 双口径，各 4 键全为整数。"""

    class _Result:
        def one(self):
            return (0, 0, 0, 0)

    class _SessionStub:
        def _session_exec(self, _statement):
            return _Result()

        exec = _session_exec

    app = _client(sample_user)
    app.dependency_overrides[system_router.get_session] = lambda: _SessionStub()

    response = TestClient(app).get("/api/usage/summary")

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"today", "total"}
    bucket_keys = {"runs", "total_tokens", "prompt_tokens", "completion_tokens"}
    assert set(body["today"].keys()) == bucket_keys
    assert set(body["total"].keys()) == bucket_keys
