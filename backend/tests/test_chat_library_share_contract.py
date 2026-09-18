"""批次 4（T2 阶段一）响应契约：chat 删除/产物/分享/HITL恢复 + library 删除/分享 + MCP 工具列表。

全键断言锁形态；service 一律打桩（真实 dict 形态已由各 service 的
回归面覆盖，这里钉的是「response_model 不过滤键」这层闸门）。
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from models import User, UserRole
from routers import chat as chat_router
from routers import library as library_router
from routers import mcp as mcp_router
from services.chat.share_service import ShareService


def _admin() -> User:
    return User(id="admin-1", username="boss", role=UserRole.ADMIN)


def _client_for(router_module) -> TestClient:
    app = FastAPI()
    app.include_router(router_module.router)
    app.dependency_overrides[router_module.get_current_user] = lambda: _admin()
    app.dependency_overrides[router_module.get_session] = lambda: object()
    return TestClient(app)


def test_delete_thread_contract(monkeypatch):
    async def _fake_delete(self, *a, **kw):
        return None

    monkeypatch.setattr(chat_router.ChatThreadService, "delete_thread", _fake_delete)

    response = _client_for(chat_router).delete("/api/threads/t1")

    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_artifact_detail_contract(monkeypatch):
    detail = {
        "id": "a1",
        "thread_id": "t1",
        "type": "code",
        "title": None,
        "content": "print(1)" + "...",
        "language": "python",
        "sort_order": 0,
        "sub_task_id": "st1",
        "content_length": 12,
        "created_at": "2026-09-18T00:00:00",
    }

    async def _fake_detail(self, *a, **kw):
        return detail

    monkeypatch.setattr(chat_router.ArtifactService, "get_artifact_detail", _fake_detail)

    response = _client_for(chat_router).get("/api/artifacts/a1")

    assert response.status_code == 200
    assert set(response.json().keys()) == set(detail.keys()), "产物详情键漂移"


def test_artifact_share_and_revoke_contract(monkeypatch):
    def _fake_create(self, *a, **kw):
        return {
            "token": "tok",
            "path": "/s/tok",
            "artifact_id": "a1",
            "created_at": "2026-09-18T00:00:00",
        }

    monkeypatch.setattr(chat_router.ShareService, "create_share", _fake_create)

    created = _client_for(chat_router).post("/api/artifacts/a1/share")
    assert created.status_code == 200
    assert set(created.json().keys()) == {"token", "path", "artifact_id", "created_at"}

    def _fake_revoke(self, *a, **kw):
        return {"revoked": 2}

    monkeypatch.setattr(chat_router.ShareService, "revoke_shares", _fake_revoke)

    revoked = _client_for(chat_router).delete("/api/artifacts/a1/share")
    assert revoked.status_code == 200
    assert revoked.json() == {"revoked": 2}


def test_chat_resume_terminate_and_revising_contract(monkeypatch):
    async def _fake_cancelled(self, *a, **kw):
        return {"status": "cancelled", "message": "计划已被用户拒绝"}

    monkeypatch.setattr(chat_router.RecoveryService, "resume_chat", _fake_cancelled)

    cancelled = _client_for(chat_router).post(
        "/api/chat/resume", json={"thread_id": "t1", "run_id": "r1", "action": "terminate"}
    )
    assert cancelled.status_code == 200
    # RM 三键恒在、值可空：terminate 分支 execution_plan_id 为 null
    assert set(cancelled.json().keys()) == {"status", "message", "execution_plan_id"}
    assert cancelled.json()["execution_plan_id"] is None

    async def _fake_revising(self, *a, **kw):
        return {
            "status": "revising",
            "execution_plan_id": "ep1",
            "message": "规划专家正在按你的反馈修订计划",
        }

    async def _noop_job(self, *a, **kw):
        return None

    monkeypatch.setattr(chat_router.RecoveryService, "resume_chat", _fake_revising)
    monkeypatch.setattr(chat_router.RecoveryService, "run_revision_job", _noop_job)

    revising = _client_for(chat_router).post(
        "/api/chat/resume", json={"thread_id": "t1", "run_id": "r1", "action": "revise"}
    )
    assert revising.status_code == 200
    assert set(revising.json().keys()) == {"status", "execution_plan_id", "message"}


def test_delete_template_contract():
    from models import SkillTemplate

    class _SessionStub:
        def get(self, _model, _pk):
            return SkillTemplate(
                template_key="demo", name="演示", starter_prompt="开始", is_builtin=False
            )

        def delete(self, _obj) -> None:
            pass

        def commit(self) -> None:
            pass

    app = FastAPI()
    app.include_router(library_router.router)
    app.dependency_overrides[library_router.get_current_user] = lambda: _admin()
    app.dependency_overrides[library_router.get_session] = lambda: _SessionStub()

    response = TestClient(app).delete("/api/library/templates/demo")

    assert response.status_code == 200
    assert response.json() == {"success": True}


def test_template_share_and_revoke_contract(monkeypatch):
    """handler 内延迟 import ShareService：桩打在类方法上（与 import 处无关）。
    handler 先查模板存在性，session 桩回非 None 即可（模板本体不参与）。"""

    class _Result:
        def first(self):
            return object()

    class _SessionStub:
        def _session_exec(self, _statement):
            return _Result()

        exec = _session_exec

    app = FastAPI()
    app.include_router(library_router.router)
    app.dependency_overrides[library_router.get_current_user] = lambda: _admin()
    app.dependency_overrides[library_router.get_session] = lambda: _SessionStub()

    def _fake_create(self, *a, **kw):
        return {"token": "tok", "path": "/api/public/templates/shared/tok", "template_key": "demo"}

    monkeypatch.setattr(ShareService, "create_template_share", _fake_create)

    created = TestClient(app).post("/api/library/templates/demo/share")
    assert created.status_code == 200
    assert set(created.json().keys()) == {"token", "path", "template_key"}

    def _fake_revoke(self, *a, **kw):
        return {"revoked": 3}

    monkeypatch.setattr(ShareService, "revoke_template_shares", _fake_revoke)

    revoked = TestClient(app).delete("/api/library/templates/demo/share")
    assert revoked.status_code == 200
    assert revoked.json() == {"revoked": 3}


def test_mcp_tools_contract(monkeypatch):
    """实时工具列表条目 2 键；连接客户端整桩替换。"""

    class _FakeTool:
        name = "search"
        description = "搜索工具"

    class _FakeClient:
        def __init__(self, _config) -> None:
            pass

        async def get_tools(self):
            return [_FakeTool()]

    class _FakeServer:
        is_active = True
        name = "local"
        sse_url = "http://127.0.0.1:8080/sse"
        transport = "sse"

    async def _fake_validate(_url):
        return True, None

    monkeypatch.setattr(mcp_router, "get_mcp_server_or_404", lambda _s, _id: _FakeServer())
    monkeypatch.setattr(mcp_router, "validate_mcp_url", _fake_validate)
    monkeypatch.setattr(mcp_router, "MultiServerMCPClient", _FakeClient)

    response = _client_for(mcp_router).get("/api/mcp/servers/srv1/tools")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert set(body[0].keys()) == {"name", "description"}
