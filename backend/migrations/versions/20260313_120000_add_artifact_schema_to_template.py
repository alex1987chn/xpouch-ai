"""
Add artifact schema fields to SkillTemplate

Revision: 20260313_120000
Revises: 20260308_230000
Create Date: 2026-03-13

Changes:
- Add expected_artifact_types column (JSON)
- Add artifact_schema_hint column (TEXT)
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260313_120000"
down_revision: str | None = "20260308_230000"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Add artifact schema fields to skilltemplate table."""
    # Check if columns already exist
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {col["name"] for col in inspector.get_columns("skilltemplate")}

    if "expected_artifact_types" not in columns:
        op.add_column(
            "skilltemplate",
            sa.Column("expected_artifact_types", sa.JSON(), nullable=True),
        )

    if "artifact_schema_hint" not in columns:
        op.add_column(
            "skilltemplate",
            sa.Column("artifact_schema_hint", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    """Remove artifact schema fields from skilltemplate table."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {col["name"] for col in inspector.get_columns("skilltemplate")}

    if "artifact_schema_hint" in columns:
        op.drop_column("skilltemplate", "artifact_schema_hint")

    if "expected_artifact_types" in columns:
        op.drop_column("skilltemplate", "expected_artifact_types")
