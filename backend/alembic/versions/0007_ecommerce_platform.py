"""Add PIM, billing, channels, and custom solutions tables.

Revision ID: 0007_ecommerce_platform
Revises: 0006_google_oauth
Create Date: 2026-11-15 00:25:00
"""
from alembic import context, op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect

revision = "0007_ecommerce_platform"
down_revision = "0006_google_oauth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Widen alembic_version.version_num from Alembic's default VARCHAR(32) so
    # longer revision identifiers cannot break the version stamp. Idempotent:
    # only widens if the column is narrower than 255.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'alembic_version'
                  AND column_name = 'version_num'
                  AND character_maximum_length < 255
            ) THEN
                ALTER TABLE alembic_version
                    ALTER COLUMN version_num TYPE VARCHAR(255);
            END IF;
        END $$;
        """
    )
    if context.is_offline_mode():
        # Subscription Plans
        op.create_table(
            "subscription_plans",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("code", sa.String(50), nullable=False, unique=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("description", sa.String(500), nullable=True),
            sa.Column("monthly_price_inr", sa.Integer(), nullable=False),
            sa.Column("annual_price_inr", sa.Integer(), nullable=True),
            sa.Column("currency", sa.String(10), server_default="INR", nullable=False),
            sa.Column("sku_limit", sa.Integer(), server_default="1000", nullable=False),
            sa.Column("monthly_rows_limit", sa.Integer(), server_default="50000", nullable=False),
            sa.Column("max_file_size_mb", sa.Integer(), server_default="100", nullable=False),
            sa.Column("user_seats_limit", sa.Integer(), server_default="3", nullable=False),
            sa.Column("catalogues_limit", sa.Integer(), server_default="5", nullable=False),
            sa.Column("channels_limit", sa.Integer(), server_default="1", nullable=False),
            sa.Column("ai_enrichment_credits", sa.Integer(), server_default="250", nullable=False),
            sa.Column("api_access", sa.Boolean(), server_default=sa.false(), nullable=False),
            sa.Column("custom_integrations", sa.Boolean(), server_default=sa.false(), nullable=False),
            sa.Column("support_tier", sa.String(50), server_default="standard", nullable=False),
            sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_subscription_plans_code", "subscription_plans", ["code"])

        # Subscriptions
        op.create_table(
            "subscriptions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subscription_plans.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("status", sa.String(50), server_default="trial", nullable=False),
            sa.Column("billing_cycle", sa.String(20), server_default="monthly", nullable=False),
            sa.Column("current_period_start", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=False),
            sa.Column("cancel_at_period_end", sa.Boolean(), server_default=sa.false(), nullable=False),
            sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("custom_price_inr", sa.Integer(), nullable=True),
            sa.Column("custom_sku_limit", sa.Integer(), nullable=True),
            sa.Column("custom_rows_limit", sa.Integer(), nullable=True),
            sa.Column("custom_ai_credits", sa.Integer(), nullable=True),
            sa.Column("gateway_provider", sa.String(50), server_default="razorpay", nullable=False),
            sa.Column("gateway_subscription_id", sa.String(100), nullable=True),
            sa.Column("gateway_customer_id", sa.String(100), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_subscriptions_org", "subscriptions", ["organization_id"])
        op.create_index("idx_subscriptions_status", "subscriptions", ["status"])

        # Usage Events
        op.create_table(
            "usage_events",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("event_type", sa.String(50), nullable=False),
            sa.Column("quantity", sa.Integer(), server_default="1", nullable=False),
            sa.Column("idempotency_key", sa.String(120), unique=True, nullable=True),
            sa.Column("metadata_info", postgresql.JSONB(), server_default="{}", nullable=False),
            sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_usage_events_org", "usage_events", ["organization_id"])
        op.create_index("idx_usage_events_type", "usage_events", ["event_type"])

        # Invoices
        op.create_table(
            "invoices",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("subscription_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subscriptions.id", ondelete="SET NULL"), nullable=True),
            sa.Column("invoice_number", sa.String(100), unique=True, nullable=False),
            sa.Column("customer_name", sa.String(200), nullable=False),
            sa.Column("customer_email", sa.String(320), nullable=False),
            sa.Column("customer_gstin", sa.String(20), nullable=True),
            sa.Column("customer_address", sa.String(500), nullable=True),
            sa.Column("provider_gstin", sa.String(20), nullable=True),
            sa.Column("subtotal_inr", sa.Numeric(12, 2), nullable=False),
            sa.Column("cgst_inr", sa.Numeric(12, 2), server_default="0.0", nullable=False),
            sa.Column("sgst_inr", sa.Numeric(12, 2), server_default="0.0", nullable=False),
            sa.Column("igst_inr", sa.Numeric(12, 2), server_default="0.0", nullable=False),
            sa.Column("total_inr", sa.Numeric(12, 2), nullable=False),
            sa.Column("status", sa.String(50), server_default="issued", nullable=False),
            sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("pdf_url", sa.String(500), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_invoices_org", "invoices", ["organization_id"])
        op.create_index("idx_invoices_number", "invoices", ["invoice_number"])

        # Payments
        op.create_table(
            "payments",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("subscription_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subscriptions.id", ondelete="SET NULL"), nullable=True),
            sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True),
            sa.Column("amount_inr", sa.Numeric(12, 2), nullable=False),
            sa.Column("currency", sa.String(10), server_default="INR", nullable=False),
            sa.Column("status", sa.String(50), server_default="pending", nullable=False),
            sa.Column("gateway_provider", sa.String(50), server_default="razorpay", nullable=False),
            sa.Column("gateway_payment_id", sa.String(100), unique=True, nullable=True),
            sa.Column("gateway_order_id", sa.String(100), nullable=True),
            sa.Column("gateway_signature", sa.String(255), nullable=True),
            sa.Column("failure_reason", sa.String(500), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_payments_org", "payments", ["organization_id"])
        op.create_index("idx_payments_gateway_id", "payments", ["gateway_payment_id"])

        # Suppliers
        op.create_table(
            "suppliers",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("code", sa.String(50), nullable=False),
            sa.Column("contact_name", sa.String(150), nullable=True),
            sa.Column("contact_email", sa.String(320), nullable=True),
            sa.Column("contact_phone", sa.String(50), nullable=True),
            sa.Column("website", sa.String(255), nullable=True),
            sa.Column("default_format", sa.String(50), server_default="csv", nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_suppliers_org", "suppliers", ["organization_id"])
        op.create_index("idx_suppliers_code", "suppliers", ["code"])

        # Supplier Mapping Recipes
        op.create_table(
            "supplier_mapping_recipes",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("supplier_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("source_columns", postgresql.JSONB(), server_default="[]", nullable=False),
            sa.Column("mapping_rules", postgresql.JSONB(), server_default="{}", nullable=False),
            sa.Column("confidence_score", sa.Float(), server_default="1.0", nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_supplier_recipes_org", "supplier_mapping_recipes", ["organization_id"])
        op.create_index("idx_supplier_recipes_supplier", "supplier_mapping_recipes", ["supplier_id"])

        # Products
        op.create_table(
            "products",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("supplier_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True),
            sa.Column("sku", sa.String(100), nullable=False),
            sa.Column("parent_sku", sa.String(100), nullable=True),
            sa.Column("barcode", sa.String(100), nullable=True),
            sa.Column("supplier_sku", sa.String(100), nullable=True),
            sa.Column("brand", sa.String(100), nullable=True),
            sa.Column("manufacturer", sa.String(150), nullable=True),
            sa.Column("model", sa.String(100), nullable=True),
            sa.Column("title", sa.String(500), nullable=False),
            sa.Column("short_description", sa.Text(), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("category", sa.String(200), nullable=True),
            sa.Column("subcategory", sa.String(200), nullable=True),
            sa.Column("tags", postgresql.JSONB(), server_default="[]", nullable=False),
            sa.Column("material", sa.String(100), nullable=True),
            sa.Column("colour", sa.String(50), nullable=True),
            sa.Column("size", sa.String(50), nullable=True),
            sa.Column("weight_kg", sa.Float(), nullable=True),
            sa.Column("dimensions_cm", sa.String(100), nullable=True),
            sa.Column("custom_attributes", postgresql.JSONB(), server_default="{}", nullable=False),
            sa.Column("mrp", sa.Numeric(12, 2), nullable=True),
            sa.Column("selling_price", sa.Numeric(12, 2), nullable=True),
            sa.Column("cost_price", sa.Numeric(12, 2), nullable=True),
            sa.Column("currency", sa.String(10), server_default="INR", nullable=False),
            sa.Column("tax_rate", sa.Float(), nullable=True),
            sa.Column("stock_quantity", sa.Integer(), server_default="0", nullable=False),
            sa.Column("inventory_status", sa.String(50), server_default="in_stock", nullable=False),
            sa.Column("primary_image_url", sa.String(1000), nullable=True),
            sa.Column("additional_image_urls", postgresql.JSONB(), server_default="[]", nullable=False),
            sa.Column("is_valid", sa.Boolean(), server_default=sa.true(), nullable=False),
            sa.Column("validation_errors", postgresql.JSONB(), server_default="[]", nullable=False),
            sa.Column("validation_warnings", postgresql.JSONB(), server_default="[]", nullable=False),
            sa.Column("completeness_score", sa.Float(), server_default="100.0", nullable=False),
            sa.Column("is_approved", sa.Boolean(), server_default=sa.false(), nullable=False),
            sa.Column("is_archived", sa.Boolean(), server_default=sa.false(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_products_org", "products", ["organization_id"])
        op.create_index("idx_products_sku", "products", ["sku"])
        op.create_index("idx_products_brand", "products", ["brand"])
        op.create_index("idx_products_category", "products", ["category"])

        # Product Variants
        op.create_table(
            "product_variants",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("parent_product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
            sa.Column("variant_sku", sa.String(100), nullable=False),
            sa.Column("barcode", sa.String(100), nullable=True),
            sa.Column("title", sa.String(255), nullable=True),
            sa.Column("option1_name", sa.String(50), nullable=True),
            sa.Column("option1_value", sa.String(50), nullable=True),
            sa.Column("option2_name", sa.String(50), nullable=True),
            sa.Column("option2_value", sa.String(50), nullable=True),
            sa.Column("selling_price", sa.Numeric(12, 2), nullable=True),
            sa.Column("mrp", sa.Numeric(12, 2), nullable=True),
            sa.Column("stock_quantity", sa.Integer(), server_default="0", nullable=False),
            sa.Column("image_url", sa.String(1000), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_product_variants_product", "product_variants", ["parent_product_id"])
        op.create_index("idx_product_variants_sku", "product_variants", ["variant_sku"])

        # Channel Connections
        op.create_table(
            "channel_connections",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("channel_type", sa.String(50), nullable=False),
            sa.Column("name", sa.String(150), nullable=False),
            sa.Column("store_url", sa.String(255), nullable=False),
            sa.Column("access_token_encrypted", sa.Text(), nullable=True),
            sa.Column("api_key_encrypted", sa.Text(), nullable=True),
            sa.Column("api_secret_encrypted", sa.Text(), nullable=True),
            sa.Column("webhook_secret", sa.String(255), nullable=True),
            sa.Column("status", sa.String(50), server_default="disconnected", nullable=False),
            sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("sync_settings", postgresql.JSONB(), server_default="{}", nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_channel_conn_org", "channel_connections", ["organization_id"])

        # Channel Product Listings
        op.create_table(
            "channel_product_listings",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("channel_connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("channel_connections.id", ondelete="CASCADE"), nullable=False),
            sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
            sa.Column("external_product_id", sa.String(150), nullable=True),
            sa.Column("listing_status", sa.String(50), server_default="draft", nullable=False),
            sa.Column("sync_status", sa.String(50), server_default="pending", nullable=False),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_channel_listings_conn", "channel_product_listings", ["channel_connection_id"])
        op.create_index("idx_channel_listings_prod", "channel_product_listings", ["product_id"])

        # Custom Solution Projects
        op.create_table(
            "custom_solution_projects",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("client_contact_name", sa.String(150), nullable=True),
            sa.Column("client_contact_email", sa.String(320), nullable=True),
            sa.Column("sku_volume_estimate", sa.Integer(), server_default="5000", nullable=False),
            sa.Column("data_sources", postgresql.JSONB(), server_default="[]", nullable=False),
            sa.Column("target_platforms", postgresql.JSONB(), server_default="[]", nullable=False),
            sa.Column("one_time_implementation_fee_inr", sa.Integer(), server_default="50000", nullable=False),
            sa.Column("monthly_subscription_fee_inr", sa.Integer(), server_default="14999", nullable=False),
            sa.Column("status", sa.String(50), server_default="inquiry", nullable=False),
            sa.Column("deliverables", postgresql.JSONB(), server_default="[]", nullable=False),
            sa.Column("timeline_weeks", sa.Integer(), server_default="4", nullable=False),
            sa.Column("assigned_lead_engineer", sa.String(150), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_custom_projects_org", "custom_solution_projects", ["organization_id"])
        op.create_index("idx_custom_projects_status", "custom_solution_projects", ["status"])

        # Project Milestones
        op.create_table(
            "project_milestones",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("custom_solution_projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("status", sa.String(50), server_default="pending", nullable=False),
            sa.Column("target_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_project_milestones_proj", "project_milestones", ["project_id"])

        # Leads CRM
        op.create_table(
            "leads",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("company_name", sa.String(200), nullable=False),
            sa.Column("contact_person", sa.String(150), nullable=False),
            sa.Column("email", sa.String(320), nullable=False),
            sa.Column("phone", sa.String(50), nullable=True),
            sa.Column("business_type", sa.String(100), server_default="distributor", nullable=False),
            sa.Column("sku_volume_estimate", sa.Integer(), server_default="1000", nullable=False),
            sa.Column("selling_channels", postgresql.JSONB(), server_default="[]", nullable=False),
            sa.Column("source_channel", sa.String(100), nullable=True),
            sa.Column("problem_description", sa.Text(), nullable=True),
            sa.Column("pipeline_stage", sa.String(50), server_default="lead_identified", nullable=False),
            sa.Column("estimated_contract_value_inr", sa.Integer(), server_default="0", nullable=False),
            sa.Column("interest_level", sa.String(50), server_default="medium", nullable=False),
            sa.Column("next_follow_up", sa.DateTime(timezone=True), nullable=True),
            sa.Column("owner", sa.String(100), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("lost_reason", sa.String(255), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_leads_company", "leads", ["company_name"])
        op.create_index("idx_leads_email", "leads", ["email"])
        op.create_index("idx_leads_stage", "leads", ["pipeline_stage"])
        return

    # Online mode with inspector checks
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    new_tables = [
        "subscription_plans", "subscriptions", "usage_events", "invoices", "payments",
        "suppliers", "supplier_mapping_recipes", "products", "product_variants",
        "channel_connections", "channel_product_listings",
        "custom_solution_projects", "project_milestones", "leads"
    ]
    # In live database, Base.metadata.create_all handles dynamic table creation if auto-schema enabled,
    # or Alembic migration applies when tables not present.
    for table_name in new_tables:
        if table_name not in existing_tables:
            # Let metadata create missing tables safely
            from app.core.database import Base
            if table_name in Base.metadata.tables:
                Base.metadata.tables[table_name].create(bind, checkfirst=True)


def downgrade() -> None:
    pass
