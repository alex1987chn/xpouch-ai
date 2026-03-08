import pytest

from services.chat.recovery_service import RecoveryService
from utils.exceptions import AppError


@pytest.fixture(autouse=True)
def _clear_inflight_resume_state():
    RecoveryService._inflight_resume_by_run.clear()
    yield
    RecoveryService._inflight_resume_by_run.clear()


def test_build_resume_key_prefers_idempotency_key():
    key = RecoveryService._build_resume_key(
        run_id="r1",
        plan_version=3,
        message_id="m1",
        idempotency_key="idem-1",
    )
    assert key == "idem-1"


def test_build_resume_key_falls_back_to_message_id():
    key = RecoveryService._build_resume_key(
        run_id="r1",
        plan_version=3,
        message_id="m1",
        idempotency_key=None,
    )
    assert key == "msg:m1"


def test_inflight_same_key_is_rejected_as_duplicate():
    RecoveryService._enter_inflight_resume("run-1", "k1")
    with pytest.raises(AppError, match="重复提交"):
        RecoveryService._enter_inflight_resume("run-1", "k1")


def test_inflight_different_key_is_rejected_as_in_progress():
    RecoveryService._enter_inflight_resume("run-1", "k1")
    with pytest.raises(AppError, match="已有恢复流程在执行"):
        RecoveryService._enter_inflight_resume("run-1", "k2")
