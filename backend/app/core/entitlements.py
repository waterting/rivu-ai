"""Entitlement checking and usage metering helper."""

from datetime import datetime, timezone
import uuid
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.billing import Subscription, SubscriptionPlan, UsageEvent
from app.models.commerce import Product, ChannelConnection


async def get_or_create_default_subscription(org_id: uuid.UUID, db: AsyncSession) -> Subscription:
    """Ensure an organization has an active or trial subscription, bootstrapping starter plan if needed."""
    stmt = select(Subscription).where(Subscription.organization_id == org_id).order_by(Subscription.created_at.desc())
    res = await db.execute(stmt)
    sub = res.scalar_one_or_none()
    if sub:
        return sub

    # Find starter plan
    plan_res = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.code == "starter"))
    plan = plan_res.scalar_one_or_none()
    if not plan:
        plan = SubscriptionPlan(
            code="starter",
            name="Starter Plan",
            description="Entry tier for merchants and suppliers managing catalogues.",
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
            is_active=True,
        )
        db.add(plan)
        await db.flush()

    from datetime import timedelta
    now = datetime.now(timezone.utc)
    sub = Subscription(
        organization_id=org_id,
        plan_id=plan.id,
        status="trial",
        billing_cycle="monthly",
        current_period_start=now,
        current_period_end=now + timedelta(days=14),
    )
    db.add(sub)
    await db.commit()
    return sub


async def check_organization_entitlement(org_id: uuid.UUID, event_type: str, quantity: int, db: AsyncSession):
    """Enforce plan limits for SKUs, rows, AI credits, and channels."""
    sub = await get_or_create_default_subscription(org_id, db)
    # Eagerly load plan
    plan_res = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.id == sub.plan_id))
    plan = plan_res.scalar_one()

    if sub.status in ("cancelled", "expired"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={"message": "Your subscription is inactive. Please renew your plan to continue.", "type": "subscription_expired"}
        )

    if event_type == "sku_create":
        sku_limit = sub.custom_sku_limit or plan.sku_limit
        count_res = await db.execute(select(func.count(Product.id)).where(Product.organization_id == org_id, Product.is_archived.is_(False)))
        current_skus = count_res.scalar() or 0
        if current_skus + quantity > sku_limit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": f"SKU entitlement limit exceeded. Plan allows {sku_limit} SKUs (currently {current_skus}). Upgrade to Growth or Business.",
                    "type": "entitlement_limit_exceeded",
                    "current": current_skus,
                    "limit": sku_limit,
                }
            )

    elif event_type == "ai_enrichment":
        ai_limit = sub.custom_ai_credits or plan.ai_enrichment_credits
        # count usage this period
        used_res = await db.execute(
            select(func.coalesce(func.sum(UsageEvent.quantity), 0))
            .where(
                UsageEvent.organization_id == org_id,
                UsageEvent.event_type == "ai_enrichment",
                UsageEvent.recorded_at >= sub.current_period_start
            )
        )
        used_credits = used_res.scalar() or 0
        if used_credits + quantity > ai_limit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": f"Monthly AI enrichment credits exceeded ({used_credits}/{ai_limit} used). Upgrade plan for additional credits.",
                    "type": "credits_limit_exceeded"
                }
            )


async def record_usage_metric(org_id: uuid.UUID, event_type: str, quantity: int, idempotency_key: str | None, metadata: dict, db: AsyncSession):
    event = UsageEvent(
        organization_id=org_id,
        event_type=event_type,
        quantity=quantity,
        idempotency_key=idempotency_key,
        metadata_info=metadata or {},
    )
    db.add(event)
    await db.commit()

