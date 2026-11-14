"""Commerce, Products, Suppliers, and Multi-Channel Endpoints."""

from datetime import datetime, timezone
from typing import Optional, List
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.user import User
from app.models.commerce import (
    Supplier, SupplierMappingRecipe, Product, ProductVariant,
    ChannelConnection, ChannelProductListing
)
from app.schemas.commerce import (
    SupplierCreateRequest, SupplierResponse,
    ProductCreateRequest, ProductUpdateRequest, ProductResponse,
    ChannelConnectRequest, ChannelConnectionResponse, ChannelPublishRequest
)
from app.core.entitlements import check_organization_entitlement, record_usage_metric
from app.core.shopify import ShopifyGraphQLClient

router = APIRouter()


# ──────────────────────────────────────────────
# SUPPLIER DIRECTORY
# ──────────────────────────────────────────────

@router.get("/suppliers", response_model=list[SupplierResponse])
async def list_suppliers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """List all registered suppliers for current organization."""
    org_id = current_user.active_org_id
    stmt = select(Supplier).where(Supplier.organization_id == org_id).order_by(Supplier.name.asc())
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("/suppliers", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    body: SupplierCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """Register a new supplier for catalogue ingestion."""
    org_id = current_user.active_org_id
    
    # Check code uniqueness within org
    existing = await db.execute(select(Supplier).where(Supplier.organization_id == org_id, Supplier.code == body.code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Supplier code '{body.code}' already exists")

    supplier = Supplier(
        organization_id=org_id,
        name=body.name,
        code=body.code.upper().strip(),
        contact_name=body.contact_name,
        contact_email=body.contact_email,
        contact_phone=body.contact_phone,
        website=body.website,
        default_format=body.default_format,
        notes=body.notes,
        is_active=True,
    )
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)
    return supplier


# ──────────────────────────────────────────────
# PIM / PRODUCT CATALOGUE
# ──────────────────────────────────────────────

@router.get("/products", response_model=list[ProductResponse])
async def list_products(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=250),
    search: Optional[str] = None,
    category: Optional[str] = None,
    is_valid: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """Search, filter, and paginate through canonical PIM product records."""
    org_id = current_user.active_org_id
    stmt = select(Product).where(Product.organization_id == org_id, Product.is_archived.is_(False))

    if search:
        search_term = f"%{search.strip()}%"
        stmt = stmt.where(or_(Product.title.ilike(search_term), Product.sku.ilike(search_term), Product.brand.ilike(search_term)))
    if category:
        stmt = stmt.where(Product.category == category)
    if is_valid is not None:
        stmt = stmt.where(Product.is_valid == is_valid)

    stmt = stmt.order_by(Product.created_at.desc()).offset((page - 1) * limit).limit(limit)
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """Create a new product in the organization's PIM catalogue with entitlement check."""
    org_id = current_user.active_org_id

    # 1. Enforce subscription entitlement limit
    await check_organization_entitlement(org_id=org_id, event_type="sku_create", quantity=1, db=db)

    # 2. Check SKU uniqueness
    existing = await db.execute(
        select(Product).where(Product.organization_id == org_id, Product.sku == body.sku, Product.is_archived.is_(False))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Product with SKU '{body.sku}' already exists.")

    # 3. Calculate completeness score and validation
    errors = []
    warnings = []
    if not body.title or len(body.title.strip()) < 3:
        errors.append("Title must be at least 3 characters")
    if body.mrp is not None and body.selling_price is not None and body.selling_price > body.mrp:
        warnings.append("Selling price is higher than MRP")
    if not body.primary_image_url:
        warnings.append("No primary image specified")
    
    score = 100.0
    if errors:
        score -= 40.0
    if warnings:
        score -= (len(warnings) * 15.0)
    score = max(0.0, score)

    product = Product(
        organization_id=org_id,
        supplier_id=body.supplier_id,
        sku=body.sku.strip(),
        parent_sku=body.parent_sku,
        barcode=body.barcode,
        brand=body.brand,
        category=body.category,
        subcategory=body.subcategory,
        title=body.title.strip(),
        short_description=body.short_description,
        description=body.description,
        material=body.material,
        colour=body.colour,
        size=body.size,
        weight_kg=body.weight_kg,
        dimensions_cm=body.dimensions_cm,
        mrp=body.mrp,
        selling_price=body.selling_price,
        cost_price=body.cost_price,
        tax_rate=body.tax_rate,
        stock_quantity=body.stock_quantity,
        primary_image_url=body.primary_image_url,
        additional_image_urls=body.additional_image_urls,
        custom_attributes=body.custom_attributes,
        is_valid=len(errors) == 0,
        validation_errors=errors,
        validation_warnings=warnings,
        completeness_score=score,
        is_approved=False,
    )
    db.add(product)
    await db.flush()

    # Add variants if any
    for v in body.variants:
        variant = ProductVariant(
            parent_product_id=product.id,
            variant_sku=v.variant_sku.strip(),
            barcode=v.barcode,
            title=v.title,
            option1_name=v.option1_name,
            option1_value=v.option1_value,
            option2_name=v.option2_name,
            option2_value=v.option2_value,
            selling_price=v.selling_price or body.selling_price,
            mrp=v.mrp or body.mrp,
            stock_quantity=v.stock_quantity,
            image_url=v.image_url or body.primary_image_url,
        )
        db.add(variant)

    await record_usage_metric(
        org_id=org_id,
        event_type="sku_created",
        quantity=1,
        idempotency_key=f"sku_create_{product.id}",
        metadata={"sku": product.sku},
        db=db
    )

    await db.commit()
    await db.refresh(product)
    return product


# ──────────────────────────────────────────────
# COMMERCE CHANNELS & SHOPIFY INTEGRATION
# ──────────────────────────────────────────────

@router.get("/channels", response_model=list[ChannelConnectionResponse])
async def list_channel_connections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """List all connected store sales channels."""
    org_id = current_user.active_org_id
    stmt = select(ChannelConnection).where(ChannelConnection.organization_id == org_id)
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("/channels/connect", response_model=ChannelConnectionResponse)
async def connect_channel(
    body: ChannelConnectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """Connect a Shopify store or other sales channel."""
    org_id = current_user.active_org_id

    status_result = "connected"
    if body.channel_type.lower() == "shopify":
        client = ShopifyGraphQLClient(store_url=body.store_url, access_token=body.access_token)
        try:
            await client.verify_connection()
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Shopify connection verification failed: {exc}")

    connection = ChannelConnection(
        organization_id=org_id,
        channel_type=body.channel_type.lower(),
        name=body.name,
        store_url=body.store_url,
        access_token_encrypted=body.access_token, # Server-side only
        api_key_encrypted=body.api_key,
        api_secret_encrypted=body.api_secret,
        status=status_result,
        last_sync_at=datetime.now(timezone.utc),
    )
    db.add(connection)
    await db.commit()
    await db.refresh(connection)
    return connection


@router.post("/channels/publish", response_model=dict)
async def publish_products_to_channel(
    body: ChannelPublishRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """Publish selected products to a connected sales channel (defaults to DRAFT on storefront)."""
    org_id = current_user.active_org_id

    # 1. Verify channel connection
    conn_res = await db.execute(
        select(ChannelConnection).where(ChannelConnection.id == body.channel_connection_id, ChannelConnection.organization_id == org_id)
    )
    conn = conn_res.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Channel connection not found")

    # 2. Fetch products
    prod_res = await db.execute(
        select(Product).where(Product.id.in_(body.product_ids), Product.organization_id == org_id)
    )
    products = prod_res.scalars().all()
    if not products:
        raise HTTPException(status_code=400, detail="No valid products selected for publishing")

    results = []
    client = ShopifyGraphQLClient(store_url=conn.store_url, access_token=conn.access_token_encrypted or "")

    for p in products:
        try:
            # Sync product as draft
            shopify_res = await client.create_draft_product({
                "title": p.title,
                "description": p.description or p.short_description,
                "brand": p.brand,
                "category": p.category,
                "tags": p.tags,
                "publish_live": not body.publish_as_draft,
            })
            ext_id = shopify_res.get("product", {}).get("id")

            # Upsert channel listing record
            listing_stmt = select(ChannelProductListing).where(
                ChannelProductListing.channel_connection_id == conn.id,
                ChannelProductListing.product_id == p.id
            )
            l_res = await db.execute(listing_stmt)
            listing = l_res.scalar_one_or_none()
            if not listing:
                listing = ChannelProductListing(
                    channel_connection_id=conn.id,
                    product_id=p.id,
                    external_product_id=ext_id,
                    listing_status="draft" if body.publish_as_draft else "active",
                    sync_status="synced",
                    last_synced_at=datetime.now(timezone.utc),
                )
                db.add(listing)
            else:
                listing.external_product_id = ext_id
                listing.listing_status = "draft" if body.publish_as_draft else "active"
                listing.sync_status = "synced"
                listing.last_synced_at = datetime.now(timezone.utc)

            results.append({"sku": p.sku, "status": "success", "external_id": ext_id})
        except Exception as exc:
            results.append({"sku": p.sku, "status": "failed", "error": str(exc)})

    conn.last_sync_at = datetime.now(timezone.utc)
    await record_usage_metric(
        org_id=org_id,
        event_type="channel_sync",
        quantity=len(results),
        idempotency_key=f"sync_{conn.id}_{datetime.now().timestamp()}",
        metadata={"channel": conn.channel_type, "count": len(results)},
        db=db
    )
    await db.commit()

    return {
        "channel": conn.name,
        "channel_type": conn.channel_type,
        "total_requested": len(products),
        "results": results,
    }

