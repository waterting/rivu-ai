"""Pydantic schemas for Products, Suppliers, and Channel Operations."""

from datetime import datetime
from typing import Optional, List, Dict, Any
import uuid
from pydantic import BaseModel, Field


# --- Supplier Schemas ---

class SupplierCreateRequest(BaseModel):
    name: str
    code: str
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    website: Optional[str] = None
    default_format: str = "csv"
    notes: Optional[str] = None


class SupplierResponse(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    default_format: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Product & Variant Schemas ---

class ProductVariantCreate(BaseModel):
    variant_sku: str
    barcode: Optional[str] = None
    title: Optional[str] = None
    option1_name: Optional[str] = None
    option1_value: Optional[str] = None
    option2_name: Optional[str] = None
    option2_value: Optional[str] = None
    selling_price: Optional[float] = None
    mrp: Optional[float] = None
    stock_quantity: int = 0
    image_url: Optional[str] = None


class ProductCreateRequest(BaseModel):
    sku: str
    title: str
    supplier_id: Optional[uuid.UUID] = None
    parent_sku: Optional[str] = None
    barcode: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    short_description: Optional[str] = None
    description: Optional[str] = None
    material: Optional[str] = None
    colour: Optional[str] = None
    size: Optional[str] = None
    weight_kg: Optional[float] = None
    dimensions_cm: Optional[str] = None
    mrp: Optional[float] = None
    selling_price: Optional[float] = None
    cost_price: Optional[float] = None
    tax_rate: Optional[float] = 18.0
    stock_quantity: int = 0
    primary_image_url: Optional[str] = None
    additional_image_urls: List[str] = []
    custom_attributes: Dict[str, Any] = {}
    variants: List[ProductVariantCreate] = []


class ProductUpdateRequest(BaseModel):
    title: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None
    mrp: Optional[float] = None
    selling_price: Optional[float] = None
    stock_quantity: Optional[int] = None
    description: Optional[str] = None
    is_approved: Optional[bool] = None


class ProductResponse(BaseModel):
    id: uuid.UUID
    sku: str
    parent_sku: Optional[str] = None
    barcode: Optional[str] = None
    brand: Optional[str] = None
    title: str
    category: Optional[str] = None
    mrp: Optional[float] = None
    selling_price: Optional[float] = None
    stock_quantity: int
    primary_image_url: Optional[str] = None
    is_valid: bool
    validation_errors: List[Any] = []
    validation_warnings: List[Any] = []
    completeness_score: float
    is_approved: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Channel Connection & Sync Schemas ---

class ChannelConnectRequest(BaseModel):
    channel_type: str # shopify, woocommerce
    name: str
    store_url: str
    access_token: str
    api_key: Optional[str] = None
    api_secret: Optional[str] = None


class ChannelConnectionResponse(BaseModel):
    id: uuid.UUID
    channel_type: str
    name: str
    store_url: str
    status: str
    last_sync_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChannelPublishRequest(BaseModel):
    channel_connection_id: uuid.UUID
    product_ids: List[uuid.UUID]
    publish_as_draft: bool = True
