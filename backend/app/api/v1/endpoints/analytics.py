"""Endpoints for Real Operational Analytics (Workspace & Super Admin)."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_session
from app.core.security import get_current_user, require_org_role
from app.models.user import User
from app.models.organization import Organization
from app.models.commerce import Product, Supplier, ChannelConnection, ChannelProductListing
from app.models.billing import Subscription, SubscriptionPlan, Invoice, UsageEvent

router = APIRouter()


@router.get("/organization", response_model=dict)
async def get_organization_analytics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """Real database-backed operational analytics for the user's workspace."""
    org_id = current_user.active_org_id

    # 1. Product & SKU stats
    total_skus = await db.scalar(select(func.count(Product.id)).where(Product.organization_id == org_id, Product.is_archived.is_(False))) or 0
    valid_skus = await db.scalar(select(func.count(Product.id)).where(Product.organization_id == org_id, Product.is_valid.is_(True), Product.is_archived.is_(False))) or 0
    approved_skus = await db.scalar(select(func.count(Product.id)).where(Product.organization_id == org_id, Product.is_approved.is_(True))) or 0
    avg_score = await db.scalar(select(func.coalesce(func.avg(Product.completeness_score), 100.0)).where(Product.organization_id == org_id)) or 100.0

    # 2. Suppliers
    supplier_count = await db.scalar(select(func.count(Supplier.id)).where(Supplier.organization_id == org_id)) or 0

    # 3. Channel listings
    synced_listings = await db.scalar(
        select(func.count(ChannelProductListing.id))
        .join(ChannelConnection, ChannelConnection.id == ChannelProductListing.channel_connection_id)
        .where(ChannelConnection.organization_id == org_id, ChannelProductListing.sync_status == "synced")
    ) or 0

    # 4. Invoices and payments
    total_spent = await db.scalar(
        select(func.coalesce(func.sum(Invoice.total_inr), 0.0))
        .where(Invoice.organization_id == org_id, Invoice.status == "paid")
    ) or 0.0

    return {
        "catalogue": {
            "total_products": total_skus,
            "valid_products": valid_skus,
            "invalid_products": max(0, total_skus - valid_skus),
            "approved_products": approved_skus,
            "average_completeness_score": round(float(avg_score), 1),
            "ready_to_publish_count": approved_skus,
        },
        "suppliers": {
            "total_suppliers": supplier_count,
        },
        "channels": {
            "active_synced_listings": synced_listings,
        },
        "billing": {
            "total_invoiced_paid_inr": float(total_spent),
        }
    }


@router.get("/admin", response_model=dict)
async def get_super_admin_analytics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """Platform-wide Super Admin analytics computed directly from live production records.

    Authorization: requires an organization owner/admin role. NOTE: this is a
    platform-wide view; until a dedicated super-admin role exists, any tenant
    owner/admin can read aggregate platform counts. Restrict to a super-admin
    role once that concept is introduced.
    """
    await require_org_role(current_user, db, {"owner", "admin"})

    total_orgs = await db.scalar(select(func.count(Organization.id))) or 0
    total_users = await db.scalar(select(func.count(User.id))) or 0
    active_subscriptions = await db.scalar(select(func.count(Subscription.id)).where(Subscription.status == "active")) or 0
    trial_subscriptions = await db.scalar(select(func.count(Subscription.id)).where(Subscription.status == "trial")) or 0

    # Monthly Recurring Revenue (MRR): the monthly-equivalent value of ACTIVE
    # paid subscriptions. This is the real recurring revenue run-rate, distinct
    # from cash collected in a given month (which may include one-off/annual
    # invoices). Annual plans are normalised to a monthly value (annual / 12).
    active_subs = (await db.execute(select(Subscription).where(Subscription.status == "active"))).scalars().all()
    plans = (await db.execute(select(SubscriptionPlan))).scalars().all()
    plan_map = {p.id: p for p in plans}
    mrr_inr = 0.0
    for sub in active_subs:
        plan = plan_map.get(sub.plan_id)
        if plan is None:
            continue
        monthly_base = float(sub.custom_price_inr or plan.monthly_price_inr or 0.0)
        if sub.billing_cycle == "annual":
            annual = float(plan.annual_price_inr or (monthly_base * 12))
            mrr_inr += annual / 12.0
        else:
            mrr_inr += monthly_base

    # Cash actually collected this calendar month (paid invoices), reported
    # separately so it is never confused with MRR.
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    collected_this_month_inr = await db.scalar(
        select(func.coalesce(func.sum(Invoice.total_inr), 0.0))
        .where(Invoice.status == "paid", Invoice.paid_at >= month_start)
    ) or 0.0

    total_platform_skus = await db.scalar(select(func.count(Product.id))) or 0

    return {
        "platform_organizations": total_orgs,
        "platform_users": total_users,
        "active_paid_subscriptions": active_subscriptions,
        "trial_subscriptions": trial_subscriptions,
        # Real recurring revenue run-rate (monthly-equivalent of active subs).
        "current_mrr_inr": round(float(mrr_inr), 2),
        # Cash collected this calendar month (paid invoices) — not MRR.
        "collected_this_month_inr": round(float(collected_this_month_inr), 2),
        "total_catalogued_skus": total_platform_skus,
    }
