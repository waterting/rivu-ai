"""Track issue lifecycle: stable issue ids, categories and resolution status.

Revision ID: 0009_quality_issue_lifecycle
Revises: 0008_lead_org_scoping
Create Date: 2026-11-16 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0009_quality_issue_lifecycle"
down_revision = "0008_lead_org_scoping"
branch_labels = None
depends_on = None


def _has_table(bind, table: str) -> bool:
    try:
        return sa.inspect(bind).has_table(table)
    except Exception:
        # Offline (--sql) mode has no live connection; emit the DDL for review.
        return True


def _has_column(bind, table: str, column: str) -> bool:
    try:
        return column in {c["name"] for c in sa.inspect(bind).get_columns(table)}
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "quality_issues"):
        return

    if not _has_column(bind, "quality_issues", "issue_id"):
        op.add_column("quality_issues", sa.Column("issue_id", sa.String(length=64), nullable=True))
        op.create_index("idx_quality_issues_issue_id", "quality_issues", ["issue_id"])

    if not _has_column(bind, "quality_issues", "category"):
        op.add_column("quality_issues", sa.Column("category", sa.String(length=80), nullable=True))

    if not _has_column(bind, "quality_issues", "status"):
        op.add_column(
            "quality_issues",
            sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        )
        op.create_index("idx_quality_issues_status", "quality_issues", ["status"])

    if not _has_column(bind, "quality_issues", "resolved_at"):
        op.add_column(
            "quality_issues",
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        )

    if not _has_column(bind, "quality_issues", "resolution_note"):
        op.add_column("quality_issues", sa.Column("resolution_note", sa.Text(), nullable=True))

    if _has_table(bind, "transformation_runs") and not _has_column(
        bind, "transformation_runs", "cells_changed"
    ):
        op.add_column("transformation_runs", sa.Column("cells_changed", sa.Integer(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "quality_issues"):
        for column in ("resolution_note", "resolved_at", "status", "category", "issue_id"):
            if _has_column(bind, "quality_issues", column):
                op.drop_column("quality_issues", column)

        for index in ("idx_quality_issues_status", "idx_quality_issues_issue_id"):
            op.execute(sa.text(f"DROP INDEX IF EXISTS {index}"))

    if _has_table(bind, "transformation_runs") and _has_column(
        bind, "transformation_runs", "cells_changed"
    ):
        op.drop_column("transformation_runs", "cells_changed")
