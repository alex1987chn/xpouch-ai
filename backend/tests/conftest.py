import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from models import User  # noqa: E402
from services.chat.recovery_service import RecoveryService  # noqa: E402


@pytest.fixture
def sample_user() -> User:
    return User(id="test-user", username="tester")


@pytest.fixture(autouse=True)
def reset_recovery_inflight_state() -> None:
    RecoveryService._inflight_resume_by_thread.clear()
