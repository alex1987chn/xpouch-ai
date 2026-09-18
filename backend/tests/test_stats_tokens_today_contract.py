"""tokens-today 端点响应契约（T2 阶段一 · 批次 6）。

工作台底栏每 3 秒轮询此端点（quota 为 null 表示不限量）——
键集与类型是前端进度条真实语义的依据，全键锁定。
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import stats as stats_router


class _AnySession:
    """配额/用量查询均被桩掉，session 占位即可。"""


def _client(sample_user) -> TestClient:
    app = FastAPI()
    app.include_router(stats_router.router)
    app.dependency_overrides[stats_router.get_current_user] = lambda: sample_user
    app.dependency_overrides[stats_router.get_session] = lambda: _AnySession()
    return TestClient(app)


def test_tokens_today_contract(sample_user, monkeypatch):
    # get_today_token_usage 顶层导入绑定在 stats 命名空间；配额读取是 handler 内延迟 import
    monkeypatch.setattr(stats_router, "get_today_token_usage", lambda _db, user_id: 123456)
    monkeypatch.setattr("services.run_quota.load_daily_token_quota", lambda _db: 1_000_000)

    response = _client(sample_user).get("/api/admin/stats/tokens-today")

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"today_tokens", "daily_token_quota"}
    assert body["today_tokens"] == 123456
    assert body["daily_token_quota"] == 1_000_000


def test_tokens_today_unlimited_quota_is_null(sample_user, monkeypatch):
    monkeypatch.setattr(stats_router, "get_today_token_usage", lambda _db, user_id: 0)
    monkeypatch.setattr("services.run_quota.load_daily_token_quota", lambda _db: None)

    response = _client(sample_user).get("/api/admin/stats/tokens-today")

    assert response.status_code == 200
    body = response.json()
    assert body["today_tokens"] == 0
    assert body["daily_token_quota"] is None
