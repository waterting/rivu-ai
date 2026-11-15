"""Persist detected CSV encoding and delimiter on each dataset version.

Revision ID: 0011_dataset_version_encoding_delimiter
Revises: 0010_dataset_column_role_overrides
Create Date: 2026-11-16 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0011_dataset_version_encoding_delimiter"
down_revision = "0010_dataset_column_role_overrides"
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
    if not _has_table(bind, "dataset_versions"):
        return

    if not _has_column(bind, "dataset_versions", "encoding"):
        op.add_column("dataset_versions", sa.Column("encoding", sa.String(length=40), nullable=True))

    if not _has_column(bind, "dataset_versions", "delimiter"):
        op.add_column(
            "dataset_versions", sa.Column("delimiter", sa.String(length=8), nullable=True)
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "dataset_versions"):
        return

    for column in ("delimiter", "encoding"):
        if _has_column(bind, "dataset_versions", column):
            op.drop_column("dataset_versions", column)