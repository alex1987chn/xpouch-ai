import re
from pathlib import Path

MIGRATION_DIR = Path(__file__).resolve().parents[1] / "migrations" / "versions"
LEGACY_REVISIONS = {"001", "002", "003", "004", "005"}
TIMESTAMP_REVISION_PATTERN = re.compile(r"^\d{8}_\d{6}$")


def _extract_revision(content: str) -> str | None:
    match = re.search(r"^revision\s*:\s*[^=]+\s*=\s*['\"]([^'\"]+)['\"]", content, re.MULTILINE)
    return match.group(1) if match else None


def test_migration_revision_uses_legacy_or_timestamp_format():
    migration_files = sorted(MIGRATION_DIR.glob("*.py"))
    assert migration_files, "未找到迁移文件"

    for migration_file in migration_files:
        content = migration_file.read_text(encoding="utf-8")
        revision = _extract_revision(content)
        assert revision is not None, f"{migration_file.name} 缺少 revision 定义"
        assert (
            revision in LEGACY_REVISIONS or TIMESTAMP_REVISION_PATTERN.match(revision) is not None
        ), f"{migration_file.name} 使用了非规范 revision: {revision}"


def test_timestamp_migration_filename_starts_with_revision():
    migration_files = sorted(MIGRATION_DIR.glob("*.py"))
    for migration_file in migration_files:
        content = migration_file.read_text(encoding="utf-8")
        revision = _extract_revision(content)
        assert revision is not None
        if revision in LEGACY_REVISIONS:
            continue
        assert migration_file.name.startswith(
            revision
        ), f"{migration_file.name} 文件名应以 revision {revision} 开头"
