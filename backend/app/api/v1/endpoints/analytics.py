"""Endpoints for Real Operational Analytics (Workspace & Super Admin)."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.user import User
from app.models.organization import Organization
from app.models.commerce import Product, Supplier, ChannelConnection, ChannelProductListing
from app.models.billing import Subscription, Invoice, UsageEvent

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
    """Platform-wide Super Admin analytics computed directly from live production records."""
    total_orgs = await db.scalar(select(func.count(Organization.id))) or 0
    total_users = await db.scalar(select(func.count(User.id))) or 0
    active_subscriptions = await db.scalar(select(func.count(Subscription.id)).where(Subscription.status == "active")) or 0
    trial_subscriptions = await db.scalar(select(func.count(Subscription.id)).where(Subscription.status == "trial")) or 0

    # Monthly Recurring Revenue (MRR) from real active paid subscriptions
    mrr_inr = await db.scalar(
        select(func.coalesce(func.sum(Invoice.total_inr), 0.0))
        .where(Invoice.status == "paid", Invoice.paid_at >= datetime.now(timezone.utc).replace(day=1))
    ) or 0.0

    total_platform_skus = await db.scalar(select(func.count(Product.id))) or 0

    return {
        "platform_organizations": total_orgs,
        "platform_users": total_users,
        "active_paid_subscriptions": active_subscriptions,
        "trial_subscriptions": trial_subscriptions,
        "current_month_mrr_inr": float(mrr_inr),
        "total_catalogued_skus": total_platform_skus,
    }
