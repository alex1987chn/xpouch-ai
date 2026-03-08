import os
import sys
from pathlib import Path

# 🔥 在导入任何 backend 模块前，先设置测试环境变量
# 注意：database.py 限制为 PostgreSQL 方言，这里用 postgresql+psycopg 作为兜底
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://xpouch_test:test_pass@localhost:5432/xpouch_test",
)
os.environ.setdefault("MINIMAX_API_KEY", "test-key")
os.environ.setdefault("DEEPSEEK_API_KEY", "test-key")
os.environ.setdefault("MOONSHOT_API_KEY", "test-key")
os.environ.setdefault("SILICON_API_KEY", "test-key")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-ci-only")

import pytest  # noqa: E402

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
    RecoveryService._inflight_resume_by_run.clear()
