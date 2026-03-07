from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import chat


def test_resume_endpoint_smoke(sample_user, monkeypatch):
    app = FastAPI()
    app.include_router(chat.router)

    async def _fake_get_current_user():
        return sample_user

    def _fake_get_session():
        yield object()

    async def _fake_resume_chat(self, **_kwargs):
        return {"status": "ok", "message": "smoke"}

    app.dependency_overrides[chat.get_current_user] = _fake_get_current_user
    app.dependency_overrides[chat.get_session] = _fake_get_session
    monkeypatch.setattr(chat.RecoveryService, "resume_chat", _fake_resume_chat)

    client = TestClient(app)
    response = client.post(
        "/api/chat/resume",
        json={
            "thread_id": "thread-smoke",
            "run_id": "run-smoke-001",
            "approved": True,
            "plan_version": 1,
            "idempotency_key": "resume-smoke-001",
            "message_id": "msg-smoke-001",
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_resume_endpoint_validates_idempotency_key_length(sample_user, monkeypatch):
    app = FastAPI()
    app.include_router(chat.router)

    async def _fake_get_current_user():
        return sample_user

    def _fake_get_session():
        yield object()

    async def _fake_resume_chat(self, **_kwargs):
        return {"status": "ok", "message": "smoke"}

    app.dependency_overrides[chat.get_current_user] = _fake_get_current_user
    app.dependency_overrides[chat.get_session] = _fake_get_session
    monkeypatch.setattr(chat.RecoveryService, "resume_chat", _fake_resume_chat)

    client = TestClient(app)
    response = client.post(
        "/api/chat/resume",
        json={
            "thread_id": "thread-smoke",
            "run_id": "run-smoke-001",
            "approved": True,
            "plan_version": 1,
            "idempotency_key": "short",
        },
    )

    assert response.status_code == 422
