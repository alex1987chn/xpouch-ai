"""时区 aware 化：全部领域时间列 timestamp -> timestamptz

Revision ID: 20260922_000100
Revises: 20260918_000300
Create Date: 2026-09-22

背景（2026-09-22 aware 化专项）：
- v3.4.4~v3.5.4 采用"全库 UTC naive + timestamp 列 + 前端补 Z 解析"，
  属逆生态的非常规做法（sqlmodel 0.0.45 对 naive 值强校验即上游信号）。
- 本迁移把全部领域表时间列转为 timestamptz：存量值全部按 UTC 语义解释
  （USING ... AT TIME ZONE 'UTC'，零损失转换）；模型侧由 sqlmodel 0.0.45
  的默认映射（UTCDateTime = DateTime(timezone=True)）对齐。
- langgraph checkpoint 运行时表不在 alembic 管辖（env.py include_object
  已排除），不受本迁移影响。
- 注意：个别历史混合写入行（±8h 偏差）转换前后语义不变（按 UTC 解释），
  维持"有意不迁移"的既定口径。
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260922_000100"
down_revision: str | None = "20260918_000300"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLUMNS: list[tuple[str, str]] = [
    ("agentrun", "cancelled_at"),
    ("agentrun", "completed_at"),
    ("agentrun", "created_at"),
    ("agentrun", "deadline_at"),
    ("agentrun", "last_heartbeat_at"),
    ("agentrun", "lease_expires_at"),
    ("agentrun", "started_at"),
    ("agentrun", "timed_out_at"),
    ("agentrun", "updated_at"),
    ("artifact", "created_at"),
    ("auditlog", "created_at"),
    ("executionplan", "completed_at"),
    ("executionplan", "created_at"),
    ("executionplan", "updated_at"),
    ("mcp_servers", "created_at"),
    ("mcp_servers", "updated_at"),
    ("message", "timestamp"),
    ("run_stream_frame", "created_at"),
    ("runevent", "timestamp"),
    ("share_token", "created_at"),
    ("share_token", "revoked_at"),
    ("skilltemplate", "created_at"),
    ("skilltemplate", "updated_at"),
    ("subtask", "completed_at"),
    ("subtask", "created_at"),
    ("subtask", "started_at"),
    ("subtask", "updated_at"),
    ("system_setting", "updated_at"),
    ("systemexpert", "created_at"),
    ("systemexpert", "updated_at"),
    ("thread", "created_at"),
    ("thread", "updated_at"),
    ("toolpolicy", "created_at"),
    ("toolpolicy", "updated_at"),
    ("user", "created_at"),
    ("user", "last_login_at"),
    ("user", "token_expires_at"),
    ("user", "updated_at"),
    ("user", "verification_code_expires_at"),
    ("user", "verification_code_last_sent_at"),
    ("user", "verification_code_locked_until"),
    ("user", "verification_code_send_count_reset_at"),
    ("user_memories", "created_at"),
    ("user_settings", "updated_at"),
]


def upgrade() -> None:
    for table, column in _COLUMNS:
        # "user" 是 PG 保留字，标识符统一加引号
        op.execute(
            f'ALTER TABLE "{table}" ALTER COLUMN "{column}" '
            f"TYPE timestamptz USING \"{column}\" AT TIME ZONE 'UTC'"
        )


def downgrade() -> None:
    for table, column in reversed(_COLUMNS):
        op.execute(
            f'ALTER TABLE "{table}" ALTER COLUMN "{column}" '
            f"TYPE timestamp WITHOUT TIME ZONE USING \"{column}\" AT TIME ZONE 'UTC'"
        )
