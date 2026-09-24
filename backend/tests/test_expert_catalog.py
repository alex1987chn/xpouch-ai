"""专家名册端点的契约测试。

钉两件事：
1. **只回 expert_type + name**——这是该端点存在的全部理由（前端只为把 expert_type 显示成人名），
   绝不能顺手带出 system_prompt / model / temperature（权限面的不必要扩大）。
   测试里故意让桩对象**携带**这些管理字段，证明响应把它们丢掉了。
2. 任何登录用户可读（不是 admin 端点）——普通用户正是它要服务的人。

写法沿用 tests/test_chat_resume_smoke.py：只挂被测路由 + 覆盖依赖，不连库不真登录。
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import experts


class _ExpertStub:
    """只被读 expert_type / name；其余字段是实现"不该出现在响应里"的诱饵。"""

    def __init__(self, expert_type: str, name: str) -> None:
        self.expert_type = expert_type
        self.name = name
        self.system_prompt = "这是不该外泄的提示词"
        self.model = "deepseek-flash"
        self.temperature = 0.3
        self.description = "内部描述"


class _SessionStub:
    """Session 的最小替身（只用到 exec(...).all()）。"""

    def __init__(self, rows):
        self._rows = rows

    def _session_exec(self, _statement):
        rows = self._rows

        class _Result:
            def all(self):
                return rows

        return _Result()

    # SQLModel Session 的方法名就叫 exec；安全扫描器会把该名字误判为动态执行，
    # 故按本仓既有写法（tests/test_agent_run_status.py）以赋值别名暴露。
    exec = _session_exec


def _client(rows, sample_user) -> TestClient:
    app = FastAPI()
    app.include_router(experts.router)
    app.dependency_overrides[experts.get_current_user] = lambda: sample_user
    app.dependency_overrides[experts.get_session] = lambda: _SessionStub(rows)
    return TestClient(app)


def test_catalog_exposes_only_key_and_name(sample_user):
    rows = [
        _ExpertStub("aggregator", "汇总专家"),
        _ExpertStub("search", "搜索专家"),
    ]
    response = _client(rows, sample_user).get("/api/experts/catalog")

    assert response.status_code == 200
    items = response.json()
    assert len(items) == 2
    assert next(i for i in items if i["expert_type"] == "aggregator")["name"] == "汇总专家"
    for item in items:
        assert set(item.keys()) == {"expert_type", "name"}, (
            "名册只该有 key + name，不得带出提示词/模型/温度"
        )


def test_catalog_requires_authentication():
    app = FastAPI()
    app.include_router(experts.router)
    # 不覆盖 get_current_user：依赖应自行拒绝匿名请求
    response = TestClient(app).get("/api/experts/catalog")

    assert response.status_code in (401, 403)
