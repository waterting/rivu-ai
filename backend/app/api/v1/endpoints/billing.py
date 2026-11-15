"""Endpoints for Subscriptions, Plans, Usage Metering and Invoicing."""

from datetime import datetime, timedelta, timezone
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.user import User
from app.models.billing import SubscriptionPlan, Subscription, Invoice, Payment, UsageEvent
from app.models.commerce import Product, ChannelConnection
from app.schemas.billing import (
    PlanResponse, SubscriptionResponse, UsageSummaryResponse,
    CreateSubscriptionRequest, RazorpayOrderResponse, VerifyPaymentRequest,
    InvoiceResponse
)
from app.core.razorpay import RazorpayService
from app.core.config import settings
from app.core.entitlements import get_or_create_default_subscription

router = APIRouter()
razorpay_service = RazorpayService()


@router.get("/plans", response_model=list[PlanResponse])
async def list_plans(db: AsyncSession = Depends(get_session)):
    """List available public subscription tiers."""
    stmt = select(SubscriptionPlan).where(SubscriptionPlan.is_active.is_(True)).order_by(SubscriptionPlan.monthly_price_inr.asc())
    res = await db.execute(stmt)
    plans = res.scalars().all()
    if not plans:
        # Seed standard tiers if empty
        starter = SubscriptionPlan(
            code="starter",
            name="Starter Plan",
            description="For growing e-commerce sellers and small suppliers.",
            monthly_price_inr=4999,
            annual_price_inr=49990,
            sku_limit=1000,
            monthly_rows_limit=50000,
            max_file_size_mb=100,
            user_seats_limit=3,
            catalogues_limit=5,
            channels_limit=1,
            ai_enrichment_credits=250,
            support_tier="standard",
        )
        growth = SubscriptionPlan(
            code="growth",
            name="Growth Plan",
            description="For multi-channel merchants and active wholesalers.",
            monthly_price_inr=14999,
            annual_price_inr=149990,
            sku_limit=5000,
            monthly_rows_limit=250000,
            max_file_size_mb=250,
            user_seats_limit=10,
            catalogues_limit=25,
            channels_limit=3,
            ai_enrichment_credits=1500,
            api_access=True,
            support_tier="priority",
        )
        business = SubscriptionPlan(
            code="business",
            name="Business Plan",
            description="For high-volume distributors and large SKU catalogues (8,000+ SKUs).",
            monthly_price_inr=49999,
            annual_price_inr=499990,
            sku_limit=25000,
            monthly_rows_limit=1000000,
            max_file_size_mb=500,
            user_seats_limit=25,
            catalogues_limit=100,
            channels_limit=10,
            ai_enrichment_credits=10000,
            api_access=True,
            custom_integrations=True,
            support_tier="dedicated",
        )
        enterprise = SubscriptionPlan(
            code="enterprise",
            name="Enterprise Custom",
            description="Dedicated architecture, unlimited pipelines, customized integrations.",
            monthly_price_inr=249999,
            annual_price_inr=2499990,
            sku_limit=100000,
            monthly_rows_limit=10000000,
            max_file_size_mb=1000,
            user_seats_limit=100,
            catalogues_limit=500,
            channels_limit=50,
            ai_enrichment_credits=50000,
            api_access=True,
            custom_integrations=True,
            support_tier="dedicated_account_manager",
        )
        db.add_all([starter, growth, business, enterprise])
        await db.commit()
        res = await db.execute(stmt)
        plans = res.scalars().all()
    return plans


@router.get("/current", response_model=dict)
async def get_current_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """Get active subscription and entitlement state for user's organization."""
    org_id = current_user.active_org_id
    sub = await get_or_create_default_subscription(org_id, db)
    plan_res = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.id == sub.plan_id))
    plan = plan_res.scalar_one()

    return {
        "id": str(sub.id),
        "organization_id": str(sub.organization_id),
        "status": sub.status,
        "billing_cycle": sub.billing_cycle,
        "current_period_start": sub.current_period_start.isoformat(),
        "current_period_end": sub.current_period_end.isoformat(),
        "cancel_at_period_end": sub.cancel_at_period_end,
        "plan": {
            "id": str(plan.id),
            "code": plan.code,
            "name": plan.name,
            "monthly_price_inr": sub.custom_price_inr or plan.monthly_price_inr,
            "sku_limit": sub.custom_sku_limit or plan.sku_limit,
            "monthly_rows_limit": sub.custom_rows_limit or plan.monthly_rows_limit,
            "channels_limit": plan.channels_limit,
            "ai_enrichment_credits": sub.custom_ai_credits or plan.ai_enrichment_credits,
            "support_tier": plan.support_tier,
        }
    }


@router.get("/usage", response_model=UsageSummaryResponse)
async def get_usage_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """Real-time usage metering vs. subscription allowances."""
    org_id = current_user.active_org_id
    sub = await get_or_create_default_subscription(org_id, db)
    plan_res = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.id == sub.plan_id))
    plan = plan_res.scalar_one()

    sku_limit = sub.custom_sku_limit or plan.sku_limit
    rows_limit = sub.custom_rows_limit or plan.monthly_rows_limit
    ai_limit = sub.custom_ai_credits or plan.ai_enrichment_credits

    # Count real database items
    sku_count_res = await db.execute(
        select(func.count(Product.id)).where(Product.organization_id == org_id, Product.is_archived.is_(False))
    )
    current_skus = sku_count_res.scalar() or 0

    channel_count_res = await db.execute(
        select(func.count(ChannelConnection.id)).where(ChannelConnection.organization_id == org_id)
    )
    channel_count = channel_count_res.scalar() or 0

    # Aggregate usage events for current billing cycle
    rows_res = await db.execute(
        select(func.coalesce(func.sum(UsageEvent.quantity), 0))
        .where(
            UsageEvent.organization_id == org_id,
            UsageEvent.event_type.in_(["rows_processed", "catalogue_upload"]),
            UsageEvent.recorded_at >= sub.current_period_start
        )
    )
    rows_processed = rows_res.scalar() or 0

    ai_res = await db.execute(
        select(func.coalesce(func.sum(UsageEvent.quantity), 0))
        .where(
            UsageEvent.organization_id == org_id,
            UsageEvent.event_type == "ai_enrichment",
            UsageEvent.recorded_at >= sub.current_period_start
        )
    )
    ai_used = ai_res.scalar() or 0

    return UsageSummaryResponse(
        organization_id=org_id,
        plan_code=plan.code,
        sku_count=current_skus,
        sku_limit=sku_limit,
        rows_processed_this_month=rows_processed,
        rows_limit=rows_limit,
        ai_enrichments_used=ai_used,
        ai_enrichments_limit=ai_limit,
        channel_connections_count=channel_count,
        channels_limit=plan.channels_limit,
        can_create_sku=current_skus < sku_limit,
        can_process_rows=rows_processed < rows_limit,
        can_enrich_ai=ai_used < ai_limit,
    )


@router.post("/subscribe", response_model=RazorpayOrderResponse)
async def create_subscription_order(
    body: CreateSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """Initiate a subscription change or renewal and generate a GST-compliant invoice and Razorpay order."""
    org_id = current_user.active_org_id

    plan_res = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.code == body.plan_code))
    plan = plan_res.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Selected subscription plan not found")

    amount = plan.monthly_price_inr if body.billing_cycle == "monthly" else (plan.annual_price_inr or plan.monthly_price_inr * 10)
    
    # 18% GST calculation (9% CGST + 9% SGST intra-state or 18% IGST)
    subtotal = float(amount)
    gst_rate = 0.18
    tax_amount = round(subtotal * gst_rate, 2)
    cgst = round(tax_amount / 2, 2)
    sgst = round(tax_amount / 2, 2)
    total_inr = round(subtotal + tax_amount, 2)

    sub = await get_or_create_default_subscription(org_id, db)
    sub.plan_id = plan.id
    sub.billing_cycle = body.billing_cycle

    invoice_number = f"INV-{datetime.now().strftime('%Y%m')}-{str(uuid.uuid4())[:8].upper()}"
    invoice = Invoice(
        organization_id=org_id,
        subscription_id=sub.id,
        invoice_number=invoice_number,
        customer_name=current_user.full_name or current_user.username,
        customer_email=current_user.email,
        customer_gstin=body.customer_gstin,
        customer_address=body.customer_address,
        provider_gstin=(settings.BUSINESS_GSTIN or "").strip(),
        subtotal_inr=subtotal,
        cgst_inr=cgst,
        sgst_inr=sgst,
        igst_inr=0.0,
        total_inr=total_inr,
        status="issued",
        due_date=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(invoice)
    await db.flush()

    # Generate Razorpay order
    receipt = f"rcpt_{invoice.invoice_number}"
    order = razorpay_service.create_order(amount_inr=total_inr, receipt=receipt)

    payment = Payment(
        organization_id=org_id,
        subscription_id=sub.id,
        invoice_id=invoice.id,
        amount_inr=total_inr,
        currency="INR",
        status="pending",
        gateway_provider="razorpay",
        gateway_order_id=order.get("id"),
    )
    db.add(payment)
    await db.commit()

    return RazorpayOrderResponse(
        order_id=order["id"],
        amount_inr=total_inr,
        currency="INR",
        key_id=razorpay_service.key_id,
        subscription_id=sub.id,
        invoice_id=invoice.id,
    )


@router.post("/verify-payment", response_model=dict)
async def verify_payment(
    body: VerifyPaymentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """Verify cryptographic payment signature and activate paid subscription."""
    valid = razorpay_service.verify_payment_signature(
        payment_id=body.razorpay_payment_id,
        order_id=body.razorpay_order_id,
        signature=body.razorpay_signature,
    )
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Invalid payment signature. Verification failed.", "type": "signature_verification_failed"}
        )

    # Find pending payment
    stmt = select(Payment).where(
        Payment.gateway_order_id == body.razorpay_order_id,
        Payment.subscription_id == body.subscription_id
    )
    res = await db.execute(stmt)
    payment = res.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Order payment record not found")

    payment.status = "captured"
    payment.gateway_payment_id = body.razorpay_payment_id
    payment.gateway_signature = body.razorpay_signature

    # Mark invoice as paid
    if payment.invoice_id:
        inv_res = await db.execute(select(Invoice).where(Invoice.id == payment.invoice_id))
        invoice = inv_res.scalar_one_or_none()
        if invoice:
            invoice.status = "paid"
            invoice.paid_at = datetime.now(timezone.utc)

    # Activate subscription for billing period
    sub_res = await db.execute(select(Subscription).where(Subscription.id == body.subscription_id))
    sub = sub_res.scalar_one()
    now = datetime.now(timezone.utc)
    sub.status = "active"
    sub.current_period_start = now
    duration_days = 365 if sub.billing_cycle == "annual" else 30
    sub.current_period_end = now + timedelta(days=duration_days)

    await db.commit()
    return {
        "status": "success",
        "message": "Payment verified. Subscription successfully activated.",
        "subscription_status": sub.status,
        "valid_until": sub.current_period_end.isoformat(),
    }


@router.get("/invoices", response_model=list[InvoiceResponse])
async def list_invoices(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """List historical GST invoices for the organization."""
    org_id = current_user.active_org_id
    stmt = select(Invoice).where(Invoice.organization_id == org_id).order_by(Invoice.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()

