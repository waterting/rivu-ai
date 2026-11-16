"""Track worker liveness so a missing worker is visible, not silent.

Revision ID: 0012_worker_heartbeats
Revises: 0011_dataset_version_encoding_delimiter
Create Date: 2026-11-16 00:00:00
"""

from alembic import op
import sqlalchemy as sa

revision = "0012_worker_heartbeats"
down_revision = "0011_dataset_version_encoding_delimiter"
branch_labels = None
depends_on = None


def _has_table(bind, table: str) -> bool:
    """True only when inspection positively confirms the table exists.

    When the bind cannot be inspected (offline ``--sql`` rendering against a
    mock connection) this returns False so the DDL is still emitted. Defaulting
    to True there would silently drop CREATE TABLE from the rendered script,
    which is the one artifact CI actually diffs.
    """
    try:
        return sa.inspect(bind).has_table(table)
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "worker_heartbeats"):
        return

    op.create_table(
        "worker_heartbeats",
        sa.Column("worker_id", sa.String(length=120), primary_key=True),
        sa.Column("hostname", sa.String(length=255), nullable=True),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("jobs_claimed", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "worker_heartbeats"):
        return
    op.drop_table("worker_heartbeats")