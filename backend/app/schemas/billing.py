"""Pydantic schemas for Subscriptions, Billing, Invoices, and Usage."""

from datetime import datetime
from typing import Optional, List
import uuid
from pydantic import BaseModel, Field


class PlanResponse(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    description: Optional[str] = None
    monthly_price_inr: int
    annual_price_inr: Optional[int] = None
    currency: str = "INR"
    sku_limit: int
    monthly_rows_limit: int
    max_file_size_mb: int
    user_seats_limit: int
    catalogues_limit: int
    channels_limit: int
    ai_enrichment_credits: int
    api_access: bool
    custom_integrations: bool
    support_tier: str
    is_active: bool

    model_config = {"from_attributes": True}


class SubscriptionResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    plan: PlanResponse
    status: str
    billing_cycle: str
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool
    custom_price_inr: Optional[int] = None
    custom_sku_limit: Optional[int] = None

    model_config = {"from_attributes": True}


class UsageSummaryResponse(BaseModel):
    organization_id: uuid.UUID
    plan_code: str
    sku_count: int
    sku_limit: int
    rows_processed_this_month: int
    rows_limit: int
    ai_enrichments_used: int
    ai_enrichments_limit: int
    channel_connections_count: int
    channels_limit: int
    can_create_sku: bool
    can_process_rows: bool
    can_enrich_ai: bool


class CreateSubscriptionRequest(BaseModel):
    plan_code: str # starter, growth, business, enterprise
    billing_cycle: str = "monthly" # monthly, annual
    customer_gstin: Optional[str] = None
    customer_address: Optional[str] = None


class RazorpayOrderResponse(BaseModel):
    order_id: str
    amount_inr: float
    currency: str = "INR"
    key_id: str
    subscription_id: uuid.UUID
    invoice_id: uuid.UUID


class VerifyPaymentRequest(BaseModel):
    subscription_id: uuid.UUID
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str


class InvoiceResponse(BaseModel):
    id: uuid.UUID
    invoice_number: str
    customer_name: str
    customer_email: str
    customer_gstin: Optional[str] = None
    subtotal_inr: float
    cgst_inr: float
    sgst_inr: float
    igst_inr: float
    total_inr: float
    status: str
    created_at: datetime
    paid_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
