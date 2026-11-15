"""Add organization_id to leads (tenant-isolate the CRM pipeline).

Revision ID: 0008_lead_org_scoping
Revises: 0007_ecommerce_platform
Create Date: 2026-11-15 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008_lead_org_scoping"
down_revision = "0007_ecommerce_platform"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    return column in {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("leads"):
        return
    if _has_column(bind, "leads", "organization_id"):
        return

    op.add_column(
        "leads",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    # Backfill any pre-existing rows to a stable sentinel is not possible without a
    # known org; leave NULL and let the application create new, org-scoped leads.
    op.create_index("ix_leads_organization_id", "leads", ["organization_id"])
    op.create_foreign_key(
        "fk_leads_organization_id",
        "leads",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("leads"):
        return
    if not _has_column(bind, "leads", "organization_id"):
        return
    op.drop_constraint("fk_leads_organization_id", "leads", type_="foreignkey")
    op.drop_index("ix_leads_organization_id", table_name="leads")
    op.drop_column("leads", "organization_id")