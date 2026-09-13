"""新增 run_stream_frame —— 运行期 SSE 帧的瞬态持久化（批次 D / 决定 1）

用途：让 SSE 续传在进程重启后仍然成立，并为多实例部署铺路。
与 runevent 的分工：runevent 是永久审计账本（里程碑，只追加不删）；
本表是瞬态传输缓冲（逐条 SSE 线，含 token 级增量），run 终态即清理。

唯一索引 (run_id, seq) 是重放有序性的基础；created_at 索引供 TTL 清扫。

Revision ID: 20260913_000200
Revises: 20260913_000100
Create Date: 2026-09-13
"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260913_000200"
down_revision: str | None = "20260913_000100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS run_stream_frame (
            id SERIAL PRIMARY KEY,
            run_id VARCHAR(64) NOT NULL REFERENCES agentrun(id),
            seq INTEGER NOT NULL,
            wire TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_run_stream_frame_run_seq "
        "ON run_stream_frame (run_id, seq)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_run_stream_frame_created_at ON run_stream_frame (created_at)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS run_stream_frame")
