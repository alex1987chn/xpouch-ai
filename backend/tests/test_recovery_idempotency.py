from datetime import datetime

import pytest

from models import Thread
from services.chat.recovery_service import RecoveryService
from utils.exceptions import AppError


class _FakeSession:
    def __init__(self, thread: Thread):
        self._thread = thread

    def get(self, model, thread_id: str):
        if model is Thread and thread_id == self._thread.id:
            return self._thread
        return None

    def add(self, _obj):
        return None

    def commit(self):
        return None


def test_build_resume_key_prefers_idempotency_key():
    key = RecoveryService._build_resume_key(
        thread_id="t1",
        plan_version=3,
        message_id="m1",
        idempotency_key="idem-1",
    )
    assert key == "idem-1"


def test_build_resume_key_falls_back_to_message_id():
    key = RecoveryService._build_resume_key(
        thread_id="t1",
        plan_version=3,
        message_id="m1",
        idempotency_key=None,
    )
    assert key == "msg:m1"


def test_inflight_same_key_is_rejected_as_duplicate():
    RecoveryService._enter_inflight_resume("thread-1", "k1")
    with pytest.raises(AppError, match="重复提交"):
        RecoveryService._enter_inflight_resume("thread-1", "k1")


def test_inflight_different_key_is_rejected_as_in_progress():
    RecoveryService._enter_inflight_resume("thread-1", "k1")
    with pytest.raises(AppError, match="已有恢复流程在执行"):
        RecoveryService._enter_inflight_resume("thread-1", "k2")


def test_mark_thread_running_and_idle():
    thread = Thread(
        id="thread-1",
        title="t",
        user_id="u1",
        agent_type="default",
        agent_id="sys-default-chat",
        status="idle",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    service = RecoveryService(_FakeSession(thread))

    service._mark_thread_running("thread-1")
    assert thread.status == "running"

    service._mark_thread_idle("thread-1")
    assert thread.status == "idle"
