"""
迁移命名规范检查：revision 文件须符合 NNN_description 或 YYYYMMDD_HHMMSS_description。
见 .ai/CHANGE_CONTRACT.md 与 code review 报告 7.3。
"""

import re
from pathlib import Path

import pytest

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations" / "versions"

# NNN_snake_case_description.py 或 YYYYMMDD_HHMMSS_snake_case_description.py
PATTERN_NUMERIC = re.compile(r"^\d{3}_[a-z0-9_]+\.py$")
PATTERN_TIMESTAMP = re.compile(r"^\d{8}_\d{6}_[a-z0-9_]+\.py$")


def test_migration_filenames_follow_convention():
    """所有 migrations/versions/*.py（除 __init__）须符合命名规范。"""
    if not MIGRATIONS_DIR.exists():
        pytest.skip("migrations/versions not found")
    bad = []
    for path in MIGRATIONS_DIR.glob("*.py"):
        if path.name.startswith("__"):
            continue
        name = path.name
        if not (PATTERN_NUMERIC.match(name) or PATTERN_TIMESTAMP.match(name)):
            bad.append(name)
    assert not bad, (
        "以下迁移文件名不符合规范（应为 NNN_description.py 或 YYYYMMDD_HHMMSS_description.py）："
        + ", ".join(bad)
    )
