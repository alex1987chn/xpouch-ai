from datetime import datetime

import pytest

from models import CustomAgent, Thread
from services.agent_service import AgentService


class _ExecResult:
    def __init__(self, all_value=None):
        self._all_value = all_value if all_value is not None else []

    def all(self):
        return self._all_value


class _FakeSession:
    def __init__(self, threads: list[Thread], agent: CustomAgent):
        self.threads = threads
        self.agent = agent
        self.deleted = []
        self.commit_called = False

    def exec(self, _statement):
        return _ExecResult(all_value=self.threads)

    def delete(self, obj):
        self.deleted.append(obj)

    def commit(self):
        self.commit_called = True


@pytest.mark.asyncio
async def test_delete_custom_agent_uses_safe_thread_deletion(monkeypatch):
    agent = CustomAgent(
        id="agent-1",
        user_id="user-1",
        name="writer",
        system_prompt="system prompt",
        model_id="deepseek-chat",
        is_default=False,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    threads = [
        Thread(
            id="thread-1",
            title="t1",
            user_id="user-1",
            agent_type="custom",
            agent_id="agent-1",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        ),
        Thread(
            id="thread-2",
            title="t2",
            user_id="user-1",
            agent_type="custom",
            agent_id="agent-1",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        ),
    ]
    session = _FakeSession(threads=threads, agent=agent)
    service = AgentService(session)
    deleted_thread_ids: list[str] = []

    monkeypatch.setattr(
        "services.agent_service.get_owned_custom_agent_or_404",
        lambda _session, _agent_id, _user_id: agent,
    )

    class _FakeThreadService:
        def __init__(self, db):
            assert db is session

        async def delete_thread(self, thread_id: str, user_id: str) -> bool:
            assert user_id == "user-1"
            deleted_thread_ids.append(thread_id)
            return True

    monkeypatch.setattr("services.chat.thread_service.ChatThreadService", _FakeThreadService)

    result = await service.delete_custom_agent("agent-1", "user-1")

    assert result == {"ok": True, "deleted_threads_count": 2}
    assert deleted_thread_ids == ["thread-1", "thread-2"]
    assert session.deleted == [agent]
    assert session.commit_called is True
