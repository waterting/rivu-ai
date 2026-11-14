"""SQLAlchemy Models for E-Commerce Product Information Management (PIM), Suppliers, and Channels."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Float, Boolean, DateTime, ForeignKey, Enum as SAEnum, func, JSON, Numeric, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Supplier(Base):
    """Supplier directory and configuration for multi-supplier catalogue ingestion."""
    __tablename__ = "suppliers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    contact_name: Mapped[str | None] = mapped_column(String(150))
    contact_email: Mapped[str | None] = mapped_column(String(320))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    website: Mapped[str | None] = mapped_column(String(255))
    default_format: Mapped[str] = mapped_column(String(50), default="csv") # csv, xlsx, json, indiamart_excel
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now(), onupdate=func.now())

    products: Mapped[list["Product"]] = relationship(back_populates="supplier")
    mapping_recipes: Mapped[list["SupplierMappingRecipe"]] = relationship(back_populates="supplier")

    def __init__(self, **kwargs):
        defaults = {
            "default_format": "csv",
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        for k, v in defaults.items():
            if k not in kwargs:
                kwargs[k] = v
        super().__init__(**kwargs)


class SupplierMappingRecipe(Base):
    """Saved, learned mapping recipes per supplier for repeated batch ingestion."""
    __tablename__ = "supplier_mapping_recipes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    source_columns: Mapped[list] = mapped_column(JSONB, default=list) # Raw headers seen in supplier files
    mapping_rules: Mapped[dict] = mapped_column(JSONB, default=dict) # source_col -> canonical_col
    confidence_score: Mapped[float] = mapped_column(Float, default=1.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now(), onupdate=func.now())

    supplier: Mapped["Supplier"] = relationship(back_populates="mapping_recipes")


class Product(Base):
    """Canonical E-Commerce Product record in Rivu PIM."""
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="SET NULL"), index=True
    )
    
    # Identity
    sku: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    parent_sku: Mapped[str | None] = mapped_column(String(100), index=True)
    barcode: Mapped[str | None] = mapped_column(String(100), index=True) # EAN, UPC, GTIN
    supplier_sku: Mapped[str | None] = mapped_column(String(100))
    brand: Mapped[str | None] = mapped_column(String(100), index=True)
    manufacturer: Mapped[str | None] = mapped_column(String(150))
    model: Mapped[str | None] = mapped_column(String(100))
    
    # Core Product Info
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    short_description: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(200), index=True)
    subcategory: Mapped[str | None] = mapped_column(String(200))
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    
    # Specifications & Attributes
    material: Mapped[str | None] = mapped_column(String(100))
    colour: Mapped[str | None] = mapped_column(String(50))
    size: Mapped[str | None] = mapped_column(String(50))
    weight_kg: Mapped[float | None] = mapped_column(Float)
    dimensions_cm: Mapped[str | None] = mapped_column(String(100)) # L x W x H
    custom_attributes: Mapped[dict] = mapped_column(JSONB, default=dict)
    
    # Commercial & Inventory
    mrp: Mapped[float | None] = mapped_column(Numeric(12, 2))
    selling_price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    cost_price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(10), default="INR")
    tax_rate: Mapped[float | None] = mapped_column(Float) # GST % (e.g. 18.0)
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0)
    inventory_status: Mapped[str] = mapped_column(String(50), default="in_stock") # in_stock, out_of_stock, backorder
    
    # Media
    primary_image_url: Mapped[str | None] = mapped_column(String(1000))
    additional_image_urls: Mapped[list] = mapped_column(JSONB, default=list)
    
    # Data Quality & Operations
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    validation_errors: Mapped[list] = mapped_column(JSONB, default=list)
    validation_warnings: Mapped[list] = mapped_column(JSONB, default=list)
    completeness_score: Mapped[float] = mapped_column(Float, default=100.0) # 0.0 to 100.0%
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now(), onupdate=func.now())

    supplier: Mapped["Supplier"] = relationship(back_populates="products")
    variants: Mapped[list["ProductVariant"]] = relationship(back_populates="parent_product", cascade="all, delete-orphan")
    channel_listings: Mapped[list["ChannelProductListing"]] = relationship(back_populates="product", cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        defaults = {
            "currency": "INR",
            "tags": [],
            "custom_attributes": {},
            "additional_image_urls": [],
            "stock_quantity": 0,
            "inventory_status": "in_stock",
            "is_valid": True,
            "validation_errors": [],
            "validation_warnings": [],
            "completeness_score": 100.0,
            "is_approved": False,
            "is_archived": False,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        for k, v in defaults.items():
            if k not in kwargs:
                kwargs[k] = v
        super().__init__(**kwargs)


class ProductVariant(Base):
    """Product Variants (SKU, Size, Color, Price, Stock)."""
    __tablename__ = "product_variants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    variant_sku: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    barcode: Mapped[str | None] = mapped_column(String(100))
    title: Mapped[str | None] = mapped_column(String(255))
    option1_name: Mapped[str | None] = mapped_column(String(50)) # e.g. "Size"
    option1_value: Mapped[str | None] = mapped_column(String(50)) # e.g. "XL"
    option2_name: Mapped[str | None] = mapped_column(String(50)) # e.g. "Color"
    option2_value: Mapped[str | None] = mapped_column(String(50)) # e.g. "Navy"
    
    selling_price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    mrp: Mapped[float | None] = mapped_column(Numeric(12, 2))
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0)
    image_url: Mapped[str | None] = mapped_column(String(1000))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())

    parent_product: Mapped["Product"] = relationship(back_populates="variants")

    def __init__(self, **kwargs):
        defaults = {
            "stock_quantity": 0,
            "created_at": datetime.now(timezone.utc),
        }
        for k, v in defaults.items():
            if k not in kwargs:
                kwargs[k] = v
        super().__init__(**kwargs)


class ChannelConnection(Base):
    """Store connection credentials and settings for Shopify, WooCommerce, etc."""
    __tablename__ = "channel_connections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    channel_type: Mapped[str] = mapped_column(String(50), nullable=False) # shopify, woocommerce, indiamart
    name: Mapped[str] = mapped_column(String(150), nullable=False) # e.g. "My Shopify Store"
    store_url: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Secure Token / Auth (encrypted or server-side only)
    access_token_encrypted: Mapped[str | None] = mapped_column(Text)
    api_key_encrypted: Mapped[str | None] = mapped_column(Text)
    api_secret_encrypted: Mapped[str | None] = mapped_column(Text)
    webhook_secret: Mapped[str | None] = mapped_column(String(255))
    
    status: Mapped[str] = mapped_column(String(50), default="disconnected") # connected, disconnected, error, rate_limited
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sync_settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now(), onupdate=func.now())

    listings: Mapped[list["ChannelProductListing"]] = relationship(back_populates="channel_connection", cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        defaults = {
            "status": "disconnected",
            "sync_settings": {},
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        for k, v in defaults.items():
            if k not in kwargs:
                kwargs[k] = v
        super().__init__(**kwargs)


class ChannelProductListing(Base):
    """Mapping between canonical Rivu product and external commerce channel item."""
    __tablename__ = "channel_product_listings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    channel_connection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("channel_connections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    
    external_product_id: Mapped[str | None] = mapped_column(String(150), index=True) # Shopify GID / Product ID
    listing_status: Mapped[str] = mapped_column(String(50), default="draft") # draft, active, archived, failed
    sync_status: Mapped[str] = mapped_column(String(50), default="pending") # pending, synced, error
    last_error: Mapped[str | None] = mapped_column(Text)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now(), onupdate=func.now())

    channel_connection: Mapped["ChannelConnection"] = relationship(back_populates="listings")
    product: Mapped["Product"] = relationship(back_populates="channel_listings")

    def __init__(self, **kwargs):
        defaults = {
            "listing_status": "draft",
            "sync_status": "pending",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        for k, v in defaults.items():
            if k not in kwargs:
                kwargs[k] = v
        super().__init__(**kwargs)
