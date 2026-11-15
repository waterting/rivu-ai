"""Persist manual column-role overrides per dataset.

Revision ID: 0010_dataset_column_role_overrides
Revises: 0009_quality_issue_lifecycle
Create Date: 2026-11-16 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0010_dataset_column_role_overrides"
down_revision = "0009_quality_issue_lifecycle"
branch_labels = None
depends_on = None


def _has_table(bind, table: str) -> bool:
    try:
        return sa.inspect(bind).has_table(table)
    except Exception:
        return True


def _has_column(bind, table: str, column: str) -> bool:
    try:
        return column in {c["name"] for c in sa.inspect(bind).get_columns(table)}
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "data_sources"):
        return
    if _has_column(bind, "data_sources", "column_role_overrides"):
        return
    op.add_column(
        "data_sources",
        sa.Column(
            "column_role_overrides",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "data_sources"):
        return
    if not _has_column(bind, "data_sources", "column_role_overrides"):
        return
    op.drop_column("data_sources", "column_role_overrides")