"""Record Tools Centre executions so every tool run is traceable.

Revision ID: 0013_tool_executions
Revises: 0012_worker_heartbeats
Create Date: 2026-11-16 00:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0013_tool_executions"
down_revision = "0012_worker_heartbeats"
branch_labels = None
depends_on = None


def _has_table(bind, table: str) -> bool:
    """True only when inspection positively confirms the table exists.

    Offline ``--sql`` rendering against a mock connection cannot inspect, so this
    returns False and the DDL is still emitted. Defaulting to True there would
    silently drop CREATE TABLE from the rendered script.
    """
    try:
        return sa.inspect(bind).has_table(table)
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "tool_executions"):
        return

    op.create_table(
        "tool_executions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "dataset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("data_sources.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "dataset_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("dataset_versions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("tool_slug", sa.String(length=60), nullable=False),
        sa.Column("tool_name", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="completed"),
        sa.Column("config", postgresql.JSONB(), nullable=False),
        sa.Column("result_summary", postgresql.JSONB(), nullable=False),
        sa.Column("rows_in", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_out", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("has_output", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_tool_executions_organization_id", "tool_executions", ["organization_id"])
    op.create_index("ix_tool_executions_dataset_id", "tool_executions", ["dataset_id"])
    op.create_index("ix_tool_executions_dataset_version_id", "tool_executions", ["dataset_version_id"])
    op.create_index("ix_tool_executions_tool_slug", "tool_executions", ["tool_slug"])


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "tool_executions"):
        return
    op.drop_index("ix_tool_executions_tool_slug", table_name="tool_executions")
    op.drop_index("ix_tool_executions_dataset_version_id", table_name="tool_executions")
    op.drop_index("ix_tool_executions_dataset_id", table_name="tool_executions")
    op.drop_index("ix_tool_executions_organization_id", table_name="tool_executions")
    op.drop_table("tool_executions")