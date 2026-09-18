"""批次 1（T2 阶段一）响应契约测试：agents 五端点 + 模板导出两端点。

给这些端点补 response_model 后，用「全键断言」钉住响应形态——
response_model 会按模型过滤返回值里未声明的键，若日后路由/service
新增返回键而模型没跟上，本文件立刻红（这正是闸门要抓的漂移）。

写法沿用 tests/test_expert_catalog.py：只挂被测路由 + 覆盖依赖，不连库。
"""

from datetime import datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient

from models import CustomAgent
from routers import agents as agents_router
from routers import library as library_router
from routers import public as public_router
from schemas.custom_agent import AgentSummaryResponse, CustomAgentResponse
from schemas.template_import_export import (
    TemplateExportData,
    TemplateExportMeta,
    TemplateExportSchema,
    XpouchTemplateHeader,
)
from services.chat.share_service import ShareService

AGENT_RESPONSE_KEYS = set(CustomAgentResponse.model_fields.keys())
AGENT_SUMMARY_KEYS = set(AgentSummaryResponse.model_fields.keys())


def _agent_fixture() -> CustomAgent:
    return CustomAgent(
        id="agent-1",
        user_id="test-user",
        name="测试智能体",
        description=None,
        system_prompt="你是助手",
        model_id="deepseek-flash",
        is_default=False,
        category="综合",
        is_public=False,
        conversation_count=3,
        created_at=datetime(2026, 9, 18, 8, 0, 0),
        updated_at=datetime(2026, 9, 18, 9, 0, 0),
    )


def _agents_client(sample_user, session=None) -> TestClient:
    """只挂 agents 路由 + 覆盖依赖；session 由调用方决定（桩或占位）。"""
    app = FastAPI()
    app.include_router(agents_router.router)
    app.dependency_overrides[agents_router.get_current_user] = lambda: sample_user
    app.dependency_overrides[agents_router.get_session] = lambda: session or object()
    return TestClient(app)


def test_agent_crud_returns_untouched_dto(sample_user, monkeypatch):
    """create/get/update 直返 ORM → CustomAgentResponse 须全字段透传（含 from_attributes 生效）。"""
    agent = _agent_fixture()
    for method, path, verb in (
        ("create_custom_agent", "/api/agents", "post"),
        ("get_custom_agent", "/api/agents/agent-1", "get"),
        ("update_custom_agent", "/api/agents/agent-1", "put"),
    ):
        monkeypatch.setattr(agents_router.AgentService, method, lambda self, *a, **kw: agent)
        client = _agents_client(sample_user)
        if verb == "get":
            response = client.get(path)
        else:
            response = getattr(client, verb)(
                path, json={"name": "x", "systemPrompt": "s", "modelId": "m"}
            )

        assert response.status_code == 200, method
        body = response.json()
        assert set(body.keys()) == AGENT_RESPONSE_KEYS, method
        assert body["name"] == "测试智能体"
        assert body["conversation_count"] == 3


def test_agent_list_items_contract(sample_user):
    """真实 service + 桩 session：列表项是 service 手工组装的 12 键 dict，时间已 isoformat。

    桩 session 对任何查询都回同一个结果对象——service 第一发查询取 .one()（计数），
    第二发取 .all()（行），与真实调用序一致。
    """

    class _Result:
        def one(self):
            return (1,)  # Row 形状：sqlalchemy select 的单列聚合经 [0] 解包

        def all(self):
            return [_agent_fixture()]

    class _SessionStub:
        def _session_exec(self, _statement):
            return _Result()

        # SQLModel Session 的方法名就叫 exec；按本仓测试惯例以赋值别名暴露
        exec = _session_exec

    response = _agents_client(sample_user, session=_SessionStub()).get("/api/agents")

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"items", "total", "page", "page_size", "pages"}
    assert body["total"] == 1
    assert set(body["items"][0].keys()) == AGENT_SUMMARY_KEYS, (
        "列表项形态漂移：service 新增/删除了键，须同步 AgentSummaryResponse"
    )
    assert isinstance(body["items"][0]["created_at"], str)
    assert body["items"][0]["description"] == ""


def test_agent_delete_contract(sample_user, monkeypatch):
    """删除响应的两键形态：ok + 级联删除的会话数（service 方法是 async）。"""

    async def _fake_delete(self, *a, **kw):
        return {"ok": True, "deleted_threads_count": 2}

    monkeypatch.setattr(agents_router.AgentService, "delete_custom_agent", _fake_delete)

    response = _agents_client(sample_user).delete("/api/agents/agent-1")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "deleted_threads_count": 2}


def _export_schema_fixture() -> TemplateExportSchema:
    return TemplateExportSchema(
        xpouch_template=XpouchTemplateHeader(
            version="1.0", schema_url="https://xpouch.ai/schema/template-v1.json"
        ),
        template=TemplateExportData(
            template_key="demo",
            name="演示模板",
            starter_prompt="开始",
        ),
        meta=TemplateExportMeta(exported_at=datetime(2026, 9, 18, 8, 0, 0)),
    )


def test_template_export_contract(sample_user, monkeypatch):
    """认证导出端点：TemplateExportSchema 三键原样透传。"""
    fixture = _export_schema_fixture()
    monkeypatch.setattr(
        library_router, "build_template_export", lambda template, exported_by=None: fixture
    )

    class _Result:
        def first(self):
            return object()  # 非即可；模板本体不参与（build_template_export 已桩掉）

    class _SessionStub:
        def _session_exec(self, _statement):
            return _Result()

        exec = _session_exec

    app = FastAPI()
    app.include_router(library_router.router)
    app.dependency_overrides[library_router.get_current_user] = lambda: sample_user
    app.dependency_overrides[library_router.get_session] = lambda: _SessionStub()

    response = TestClient(app).get("/api/library/templates/demo/export")

    assert response.status_code == 200
    assert set(response.json().keys()) == {"xpouch_template", "template", "meta"}
    assert response.json()["template"]["template_key"] == "demo"


def test_public_shared_template_contract(monkeypatch):
    """公开分享端点（无认证）：同一导出 schema 的三键透传。

    注意：端点内部是延迟 import（函数体内 from ... import ShareService），
    所以桩必须打在 ShareService 类的方法上，而非路由模块的名字上。
    """
    fixture = _export_schema_fixture()
    monkeypatch.setattr(
        library_router, "build_template_export", lambda template, exported_by=None: fixture
    )
    monkeypatch.setattr(ShareService, "resolve_template", lambda self, _token: object())

    app = FastAPI()
    app.include_router(public_router.router)

    response = TestClient(app).get("/api/public/templates/shared/some-token")

    assert response.status_code == 200
    assert set(response.json().keys()) == {"xpouch_template", "template", "meta"}
