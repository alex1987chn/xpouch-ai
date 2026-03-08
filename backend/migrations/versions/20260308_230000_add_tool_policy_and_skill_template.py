"""add tool policy and skill template tables

Revision ID: 20260308_230000
Revises: 20260308_150000_add_run_event_ledger
Create Date: 2026-03-08 23:00:00
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine import Connection
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision: str = "20260308_230000"
down_revision: str | None = "20260308_150000"
branch_labels: str | None = None
depends_on: str | None = None


def _table_exists(conn: Connection, table_name: str) -> bool:
    return Inspector.from_engine(conn).has_table(table_name)


def _index_names(conn: Connection, table_name: str) -> set[str]:
    if not _table_exists(conn, table_name):
        return set()
    return {index["name"] for index in Inspector.from_engine(conn).get_indexes(table_name)}


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(conn, "toolpolicy"):
        op.create_table(
            "toolpolicy",
            sa.Column("id", sa.String(length=255), nullable=False),
            sa.Column("tool_name", sa.String(length=128), nullable=False),
            sa.Column("source", sa.String(length=32), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("risk_tier", sa.String(length=16), nullable=False, server_default="medium"),
            sa.Column(
                "approval_required",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
            sa.Column("allowed_experts", sa.JSON(), nullable=True),
            sa.Column("blocked_experts", sa.JSON(), nullable=True),
            sa.Column("policy_note", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
    toolpolicy_indexes = _index_names(conn, "toolpolicy")
    if "ix_toolpolicy_source" not in toolpolicy_indexes:
        op.create_index("ix_toolpolicy_source", "toolpolicy", ["source"], unique=False)
    if "idx_toolpolicy_tool_name_source" not in toolpolicy_indexes:
        op.create_index(
            "idx_toolpolicy_tool_name_source",
            "toolpolicy",
            ["tool_name", "source"],
            unique=True,
        )

    if not _table_exists(conn, "skilltemplate"):
        op.create_table(
            "skilltemplate",
            sa.Column("id", sa.String(length=255), nullable=False),
            sa.Column("template_key", sa.String(length=128), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("category", sa.String(length=64), nullable=False),
            sa.Column("starter_prompt", sa.String(), nullable=False),
            sa.Column("system_hint", sa.String(), nullable=True),
            sa.Column("recommended_mode", sa.String(length=32), nullable=False),
            sa.Column("suggested_tags", sa.JSON(), nullable=True),
            sa.Column("tool_hints", sa.JSON(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
    skilltemplate_indexes = _index_names(conn, "skilltemplate")
    if "ix_skilltemplate_category" not in skilltemplate_indexes:
        op.create_index("ix_skilltemplate_category", "skilltemplate", ["category"], unique=False)
    if "ix_skilltemplate_recommended_mode" not in skilltemplate_indexes:
        op.create_index(
            "ix_skilltemplate_recommended_mode",
            "skilltemplate",
            ["recommended_mode"],
            unique=False,
        )
    if "idx_skilltemplate_template_key" not in skilltemplate_indexes:
        op.create_index(
            "idx_skilltemplate_template_key",
            "skilltemplate",
            ["template_key"],
            unique=True,
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "skilltemplate"):
        indexes = _index_names(conn, "skilltemplate")
        for index_name in (
            "idx_skilltemplate_template_key",
            "ix_skilltemplate_recommended_mode",
            "ix_skilltemplate_category",
        ):
            if index_name in indexes:
                op.drop_index(index_name, table_name="skilltemplate")
        op.drop_table("skilltemplate")

    if _table_exists(conn, "toolpolicy"):
        indexes = _index_names(conn, "toolpolicy")
        for index_name in ("idx_toolpolicy_tool_name_source", "ix_toolpolicy_source"):
            if index_name in indexes:
                op.drop_index(index_name, table_name="toolpolicy")
        op.drop_table("toolpolicy")
