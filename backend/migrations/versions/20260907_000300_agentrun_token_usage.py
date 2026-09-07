"""agentrun 增加 token 用量列

B5 用量可视化：各专家任务完成后把 usage_metadata 增量累加到所在 run
（crud/agent_run.py::add_run_token_usage）。router/aggregator 的小额调用
暂不计入，总量为近似值（文档已注明）。

Revision ID: 20260907_000300
Revises: 20260907_000200
Create Date: 2026-09-07
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260907_000300"
down_revision: str | None = "20260907_000200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agentrun",
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "agentrun",
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "agentrun",
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    op.drop_column("agentrun", "total_tokens")
    op.drop_column("agentrun", "completion_tokens")
    op.drop_column("agentrun", "prompt_tokens")
