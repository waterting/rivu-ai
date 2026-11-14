"""SQLAlchemy Models for Subscriptions, Billing, Usage Metering and Invoicing."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Float, Boolean, DateTime, ForeignKey, Enum as SAEnum, func, JSON, Numeric
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True) # starter, growth, business, enterprise
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    monthly_price_inr: Mapped[int] = mapped_column(Integer, nullable=False) # e.g. 4999, 14999, 49999, 249999
    annual_price_inr: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(10), default="INR")
    
    # Entitlements
    sku_limit: Mapped[int] = mapped_column(Integer, default=1000)
    monthly_rows_limit: Mapped[int] = mapped_column(Integer, default=50000)
    max_file_size_mb: Mapped[int] = mapped_column(Integer, default=100)
    user_seats_limit: Mapped[int] = mapped_column(Integer, default=3)
    catalogues_limit: Mapped[int] = mapped_column(Integer, default=5)
    channels_limit: Mapped[int] = mapped_column(Integer, default=1) # e.g., Shopify, WooCommerce
    ai_enrichment_credits: Mapped[int] = mapped_column(Integer, default=250)
    api_access: Mapped[bool] = mapped_column(Boolean, default=False)
    custom_integrations: Mapped[bool] = mapped_column(Boolean, default=False)
    support_tier: Mapped[str] = mapped_column(String(50), default="standard") # standard, priority, dedicated
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now(), onupdate=func.now())

    subscriptions: Mapped[list["Subscription"]] = relationship(back_populates="plan")

    def __init__(self, **kwargs):
        defaults = {
            "currency": "INR",
            "sku_limit": 1000,
            "monthly_rows_limit": 50000,
            "max_file_size_mb": 100,
            "user_seats_limit": 3,
            "catalogues_limit": 5,
            "channels_limit": 1,
            "ai_enrichment_credits": 250,
            "api_access": False,
            "custom_integrations": False,
            "support_tier": "standard",
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        for k, v in defaults.items():
            if k not in kwargs:
                kwargs[k] = v
        super().__init__(**kwargs)


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subscription_plans.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(50), default="trial", nullable=False, index=True
    ) # trial, active, past_due, paused, cancelled, expired, pending_payment
    
    billing_cycle: Mapped[str] = mapped_column(String(20), default="monthly") # monthly, annual
    current_period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
    current_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    
    # Custom plan overrides for enterprise clients (up to ₹2,49,999/mo)
    custom_price_inr: Mapped[int | None] = mapped_column(Integer)
    custom_sku_limit: Mapped[int | None] = mapped_column(Integer)
    custom_rows_limit: Mapped[int | None] = mapped_column(Integer)
    custom_ai_credits: Mapped[int | None] = mapped_column(Integer)
    
    # Gateway reference
    gateway_provider: Mapped[str] = mapped_column(String(50), default="razorpay")
    gateway_subscription_id: Mapped[str | None] = mapped_column(String(100), index=True)
    gateway_customer_id: Mapped[str | None] = mapped_column(String(100))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now(), onupdate=func.now())

    # Relationships
    plan: Mapped["SubscriptionPlan"] = relationship(back_populates="subscriptions")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="subscription")
    payments: Mapped[list["Payment"]] = relationship(back_populates="subscription")

    def __init__(self, **kwargs):
        defaults = {
            "status": "trial",
            "billing_cycle": "monthly",
            "cancel_at_period_end": False,
            "gateway_provider": "razorpay",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        for k, v in defaults.items():
            if k not in kwargs:
                kwargs[k] = v
        super().__init__(**kwargs)


class UsageEvent(Base):
    """Usage metering records for SKU creation, rows processed, AI enrichments, channel syncs."""
    __tablename__ = "usage_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # event_types: rows_processed, sku_created, sku_updated, ai_enrichment, channel_sync, export_generated
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), unique=True, index=True)
    metadata_info: Mapped[dict] = mapped_column(JSONB, default=dict)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now(), index=True)


class Invoice(Base):
    """GST-compliant invoice ledger."""
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="SET NULL")
    )
    invoice_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    
    # Billing entities
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    customer_email: Mapped[str] = mapped_column(String(320), nullable=False)
    customer_gstin: Mapped[str | None] = mapped_column(String(20))
    customer_address: Mapped[str | None] = mapped_column(String(500))
    
    provider_gstin: Mapped[str | None] = mapped_column(String(20))
    
    # Financials (in INR paisa or exact INR float)
    subtotal_inr: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    cgst_inr: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    sgst_inr: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    igst_inr: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    total_inr: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    
    status: Mapped[str] = mapped_column(String(50), default="issued") # issued, paid, voided, refunded
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pdf_url: Mapped[str | None] = mapped_column(String(500))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())

    subscription: Mapped["Subscription"] = relationship(back_populates="invoices")
    payments: Mapped[list["Payment"]] = relationship(back_populates="invoice")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="SET NULL")
    )
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL")
    )
    
    amount_inr: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="INR")
    status: Mapped[str] = mapped_column(String(50), default="pending", index=True) # pending, captured, failed, refunded
    
    gateway_provider: Mapped[str] = mapped_column(String(50), default="razorpay")
    gateway_payment_id: Mapped[str | None] = mapped_column(String(100), unique=True, index=True)
    gateway_order_id: Mapped[str | None] = mapped_column(String(100), index=True)
    gateway_signature: Mapped[str | None] = mapped_column(String(255))
    failure_reason: Mapped[str | None] = mapped_column(String(500))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())

    subscription: Mapped["Subscription"] = relationship(back_populates="payments")
    invoice: Mapped["Invoice"] = relationship(back_populates="payments")

    subscription: Mapped["Subscription"] = relationship(back_populates="payments")
    invoice: Mapped["Invoice"] = relationship(back_populates="payments")
