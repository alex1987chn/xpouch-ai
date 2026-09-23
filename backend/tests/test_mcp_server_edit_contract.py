"""MCP 服务器编辑契约：transport 可改、组合通电测试、缓存立即失效。

回归背景（2026-09-23）：PATCH 端点收了 MCPServerUpdate.transport 却不应用，
改 URL 时的连接测试还沿用旧协议——「sse → streamable_http 迁移」在后端
就走不通（本次高德端点迁移只能直改库绕过）。且 CREATE/PATCH/DELETE 落库
后都不失效 mcp_tools_service 缓存，专家在 5 分钟 TTL 窗口内仍按旧清单
发现/调用工具。

本文件锁住：协议迁移按「最终 URL + 最终协议」组合测试；三个写端点
落库后必失效工具缓存。
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from models.mcp import MCPServer
from routers import mcp as mcp_router


def _server_fixture() -> MCPServer:
    return MCPServer(
        id="srv-1",
        name="amap",
        description=None,
        sse_url="https://mcp.example.com/sse?key=k",
        transport="sse",
        is_active=True,
        connection_status="connected",
    )


class _SessionStub:
    """最小会话替身：唯一性查询一律「无冲突」，写操作静默成功。"""

    def __init__(self, server: MCPServer | None):
        self._server = server

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
        return self._server

    def delete(self, _obj) -> None:
        pass


class _Recorder:
    """记录通电测试与缓存失效的调用。"""

    def __init__(self):
        self.connection_calls: list[tuple[str, str]] = []
        self.invalidate_calls = 0

    async def fake_test_connection(self, url: str, transport: str | None = None):
        self.connection_calls.append((url, transport))
        return True, ""

    async def fake_invalidate(self):
        self.invalidate_calls += 1


def _stub_network(recorder: _Recorder, monkeypatch) -> None:
    """外联全部打桩：URL 校验放行、通电测试可记录、缓存失效可计数。"""

    async def _validate(url: str):
        return True, ""

    monkeypatch.setattr(mcp_router, "validate_mcp_url", _validate)
    monkeypatch.setattr(mcp_router, "test_mcp_connection", recorder.fake_test_connection)
    monkeypatch.setattr(mcp_router.mcp_tools_service, "invalidate_cache", recorder.fake_invalidate)


def _client(server: MCPServer | None, recorder: _Recorder) -> TestClient:
    def _admin_override():
        return object()

    def _session_override():
        return _SessionStub(server)

    app = FastAPI()
    app.include_router(mcp_router.router)
    app.dependency_overrides[mcp_router.get_current_admin] = _admin_override
    app.dependency_overrides[mcp_router.get_session] = _session_override
    return TestClient(app)


def test_patch_transport_only_uses_final_combo(monkeypatch):
    """只改协议（URL 不变）：按「旧 URL + 新协议」组合通电测试并落库。"""
    server = _server_fixture()
    recorder = _Recorder()
    _stub_network(recorder, monkeypatch)

    with _client(server, recorder) as client:
        resp = client.patch("/api/mcp/servers/srv-1", json={"transport": "streamable_http"})

    assert resp.status_code == 200
    # 组合测试参数：URL 维持旧值，transport 用新值（旧实现根本不测协议变化）
    assert recorder.connection_calls == [(server.sse_url, "streamable_http")]
    assert server.transport == "streamable_http"
    assert recorder.invalidate_calls == 1


def test_patch_url_and_transport_tested_together(monkeypatch):
    """URL 与协议同时改：按最终组合测试（旧实现用旧协议测新 URL）。"""
    server = _server_fixture()
    recorder = _Recorder()
    _stub_network(recorder, monkeypatch)
    new_url = "https://mcp.example.com/mcp?key=k"

    with _client(server, recorder) as client:
        resp = client.patch(
            "/api/mcp/servers/srv-1", json={"sse_url": new_url, "transport": "streamable_http"}
        )

    assert resp.status_code == 200
    assert recorder.connection_calls == [(new_url, "streamable_http")]
    assert server.sse_url == new_url
    assert server.transport == "streamable_http"


def test_patch_name_only_skips_connection_test(monkeypatch):
    """只改名称：不触发通电测试，但仍失效工具缓存（名称是发现链路配置哈希的组成部分）。"""
    server = _server_fixture()
    recorder = _Recorder()
    _stub_network(recorder, monkeypatch)

    with _client(server, recorder) as client:
        resp = client.patch("/api/mcp/servers/srv-1", json={"name": "高德地图"})

    assert resp.status_code == 200
    assert recorder.connection_calls == []
    assert server.name == "高德地图"
    assert recorder.invalidate_calls == 1


def test_patch_failed_connection_rejects(monkeypatch):
    """组合测试失败：抛 ValidationError 拒绝，字段不落库。"""
    server = _server_fixture()
    recorder = _Recorder()
    _stub_network(recorder, monkeypatch)

    async def _fail(url: str, transport: str | None = None):
        recorder.connection_calls.append((url, transport))
        return False, "connect timeout"

    monkeypatch.setattr(mcp_router, "test_mcp_connection", _fail)

    with _client(server, recorder) as client, pytest.raises(mcp_router.ValidationError):
        client.patch("/api/mcp/servers/srv-1", json={"transport": "streamable_http"})

    assert recorder.connection_calls == [(server.sse_url, "streamable_http")]
    assert server.transport == "sse"


def test_create_and_delete_invalidate_cache(monkeypatch):
    """CREATE/DELETE 落库后失效工具缓存：新服务器立即可被发现、已删服务器立即退出。"""
    recorder = _Recorder()
    _stub_network(recorder, monkeypatch)

    payload = {
        "name": "amap",
        "sse_url": "https://mcp.example.com/mcp?key=k",
        "transport": "streamable_http",
    }
    with _client(None, recorder) as client:
        resp = client.post("/api/mcp/servers", json=payload)
        assert resp.status_code == 201
        assert recorder.invalidate_calls == 1

    with _client(_server_fixture(), recorder) as client:
        resp = client.delete("/api/mcp/servers/srv-1")
        assert resp.status_code == 204
        assert recorder.invalidate_calls == 2
