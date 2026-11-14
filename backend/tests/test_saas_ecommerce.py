"""Comprehensive automated tests for E-Commerce Data Intelligence & Subscriptions."""

import uuid
import hashlib
import hmac
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.database import get_session
from app.core.security import create_access_token
from app.models.user import User
from app.models.organization import Organization, Membership
from app.models.billing import SubscriptionPlan, Subscription, Invoice, Payment, UsageEvent
from app.models.commerce import Supplier, Product, ChannelConnection, ChannelProductListing


class FakeSaaSDatabaseSession:
    def __init__(self):
        self.users = {}
        self.organizations = {}
        self.memberships = []
        self.plans = {}
        self.subscriptions = {}
        self.invoices = {}
        self.payments = {}
        self.usage_events = []
        self.suppliers = {}
        self.products = {}
        self.channel_connections = {}
        self.channel_listings = []

    def add(self, item):
        if not getattr(item, "id", None):
            item.id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        if hasattr(item, "created_at") and getattr(item, "created_at", None) is None:
            item.created_at = now
        if hasattr(item, "updated_at") and getattr(item, "updated_at", None) is None:
            item.updated_at = now
        if isinstance(item, User):
            self.users[item.id] = item
        elif isinstance(item, Organization):
            self.organizations[item.id] = item
        elif isinstance(item, Membership):
            self.memberships.append(item)
        elif isinstance(item, SubscriptionPlan):
            self.plans[item.id] = item
        elif isinstance(item, Subscription):
            self.subscriptions[item.id] = item
        elif isinstance(item, Invoice):
            self.invoices[item.id] = item
        elif isinstance(item, Payment):
            self.payments[item.id] = item
        elif isinstance(item, UsageEvent):
            self.usage_events.append(item)
        elif isinstance(item, Supplier):
            self.suppliers[item.id] = item
        elif isinstance(item, Product):
            self.products[item.id] = item
        elif isinstance(item, ChannelConnection):
            self.channel_connections[item.id] = item
        elif isinstance(item, ChannelProductListing):
            self.channel_listings.append(item)

    def add_all(self, items):
        for i in items:
            self.add(i)

    async def flush(self):
        pass

    async def commit(self):
        pass

    async def rollback(self):
        pass

    async def refresh(self, item):
        pass

    async def execute(self, statement):
        compiled = str(statement)
        params = statement.compile().params if hasattr(statement, "compile") else {}

        # Universal mock result helper
        def make_result(items=None, item=None, scalar_val=0):
            item_list = items if items is not None else ([item] if item is not None else [])
            single = item if item is not None else (item_list[0] if item_list else None)
            return SimpleNamespace(
                scalar=lambda: scalar_val,
                scalar_one=lambda: single if single is not None else scalar_val,
                scalar_one_or_none=lambda: single,
                scalars=lambda: SimpleNamespace(all=lambda: item_list),
                first=lambda: single,
                all=lambda: item_list,
            )

        # 0. Counts and sums (check before table names)
        if "count" in compiled.lower():
            val = 0
            if "products" in compiled.lower():
                val = len(self.products)
            elif "suppliers" in compiled.lower():
                val = len(self.suppliers)
            elif "subscriptions" in compiled.lower():
                val = len(self.subscriptions)
            return make_result(scalar_val=val)
        if "sum" in compiled.lower():
            return make_result(scalar_val=0)

        # 1. User lookup
        if "users.id =" in compiled or "users.id" in compiled:
            uid = next((v for k, v in params.items() if "id" in k), None)
            found = self.users.get(uuid.UUID(str(uid)) if uid else None)
            if not found and self.users:
                found = list(self.users.values())[0]
            return make_result(item=found)

        # 2. Membership query
        if "memberships" in compiled:
            matching = [m for m in self.memberships if m.accepted_at is not None]
            val = matching[0] if matching else None
            return make_result(items=matching, item=val, scalar_val=val.id if val else 0)

        # 3. Subscription Plans
        if "subscription_plans" in compiled:
            code_val = next((v for k, v in params.items() if "code" in k), None)
            if code_val:
                found = next((p for p in self.plans.values() if p.code == code_val), None)
                return make_result(item=found)
            plan_id = next((v for k, v in params.items() if "id" in k), None)
            if plan_id:
                found = self.plans.get(uuid.UUID(str(plan_id)) if plan_id else None)
                return make_result(item=found)
            return make_result(items=list(self.plans.values()))

        # 4. Subscriptions
        if "subscriptions" in compiled:
            all_subs = list(self.subscriptions.values())
            sub = all_subs[0] if all_subs else None
            return make_result(items=all_subs, item=sub)

        # 5. Suppliers
        if "suppliers" in compiled:
            code_val = next((v for k, v in params.items() if "code" in k), None)
            if code_val:
                found = next((s for s in self.suppliers.values() if s.code == code_val), None)
                return make_result(item=found)
            return make_result(items=list(self.suppliers.values()))

        # 6. Products
        if "products" in compiled:
            sku_val = next((v for k, v in params.items() if "sku" in k), None)
            if sku_val and "sku =" in compiled:
                found = next((p for p in self.products.values() if p.sku == sku_val), None)
                return make_result(item=found)
            return make_result(items=list(self.products.values()))

        # 7. Channel Connections
        if "channel_connections" in compiled:
            all_conns = list(self.channel_connections.values())
            conn = all_conns[0] if all_conns else None
            return make_result(items=all_conns, item=conn)

        # 8. Channel Listings
        if "channel_product_listings" in compiled:
            return make_result(items=self.channel_listings)

        # 9. Invoices & Payments
        if "invoices" in compiled:
            return make_result(items=list(self.invoices.values()))
        if "payments" in compiled:
            return make_result(items=list(self.payments.values()))

        return make_result()

    async def scalar(self, statement):
        compiled = str(statement)
        if "count" in compiled.lower():
            if "products" in compiled.lower():
                return len(self.products)
            if "suppliers" in compiled.lower():
                return len(self.suppliers)
            if "subscriptions" in compiled.lower():
                return len(self.subscriptions)
            return 1
        if "sum" in compiled.lower():
            return 0.0
        return 0


@pytest.fixture
def fake_saas_db():
    session = FakeSaaSDatabaseSession()
    # Seed default starter plan
    plan = SubscriptionPlan(
        id=uuid.uuid4(),
        code="starter",
        name="Starter Plan",
        monthly_price_inr=4999,
        sku_limit=1000,
        monthly_rows_limit=50000,
        max_file_size_mb=100,
        channels_limit=1,
        ai_enrichment_credits=250,
        support_tier="standard",
    )
    session.add(plan)
    return session


@pytest.fixture
def test_user_and_token(fake_saas_db):
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    user = User(
        id=user_id,
        email="merchant@acme.com",
        username="acme_merchant",
        full_name="Acme Merchant",
        status="active",
        token_version=0,
    )
    org = Organization(id=org_id, name="Acme Store", slug="acme-store", owner_id=user_id)
    membership = Membership(organization_id=org_id, user_id=user_id, role="owner", accepted_at=object())
    
    fake_saas_db.add(user)
    fake_saas_db.add(org)
    fake_saas_db.add(membership)

    token = create_access_token(user_id, {"org_id": str(org_id), "tv": 0})
    return {"user": user, "org": org, "token": token}


@pytest.mark.asyncio
async def test_list_subscription_plans(fake_saas_db):
    """Ensure subscription plans starting at ₹4,999/mo can be retrieved."""
    async def _test_session():
        yield fake_saas_db

    app.dependency_overrides[get_session] = _test_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/billing/plans")
            assert resp.status_code == 200
            plans = resp.json()
            assert len(plans) >= 1
            starter = next(p for p in plans if p["code"] == "starter")
            assert starter["monthly_price_inr"] == 4999
            assert starter["sku_limit"] == 1000
    finally:
        app.dependency_overrides.pop(get_session, None)


@pytest.mark.asyncio
async def test_create_supplier_and_product(fake_saas_db, test_user_and_token):
    """Create supplier and canonical SKU in PIM catalogue."""
    async def _test_session():
        yield fake_saas_db

    app.dependency_overrides[get_session] = _test_session
    token = test_user_and_token["token"]
    headers = {"Authorization": f"Bearer {token}"}

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Create Supplier
            sup_resp = await client.post("/api/v1/commerce/suppliers", json={
                "name": "Tata Consumer Products",
                "code": "TATA01",
                "contact_email": "distributor@tata.com",
                "default_format": "csv"
            }, headers=headers)
            assert sup_resp.status_code == 201
            sup_data = sup_resp.json()
            assert sup_data["code"] == "TATA01"

            # 2. Create Product
            prod_resp = await client.post("/api/v1/commerce/products", json={
                "sku": "TATA-TEA-500G",
                "title": "Tata Tea Premium 500g",
                "brand": "Tata Tea",
                "category": "Beverages",
                "mrp": 290.0,
                "selling_price": 275.0,
                "stock_quantity": 150,
                "primary_image_url": "https://images.unsplash.com/photo-1544787219-7f47ccb76574"
            }, headers=headers)
            assert prod_resp.status_code == 201
            prod_data = prod_resp.json()
            assert prod_data["sku"] == "TATA-TEA-500G"
            assert prod_data["is_valid"] is True
            assert prod_data["completeness_score"] == 100.0
    finally:
        app.dependency_overrides.pop(get_session, None)


@pytest.mark.asyncio
async def test_connect_shopify_and_publish_draft(fake_saas_db, test_user_and_token):
    """Test Shopify GraphQL channel connection and draft product publishing."""
    async def _test_session():
        yield fake_saas_db

    app.dependency_overrides[get_session] = _test_session
    token = test_user_and_token["token"]
    headers = {"Authorization": f"Bearer {token}"}

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Connect channel
            conn_resp = await client.post("/api/v1/commerce/channels/connect", json={
                "channel_type": "shopify",
                "name": "Acme Official Store",
                "store_url": "acme-official.myshopify.com",
                "access_token": "shpat_sandbox_test_token"
            }, headers=headers)
            assert conn_resp.status_code == 200
            conn_data = conn_resp.json()
            conn_id = conn_data["id"]

            # Add product to session
            prod_id = uuid.uuid4()
            fake_saas_db.add(Product(
                id=prod_id,
                organization_id=test_user_and_token["org"].id,
                sku="SHOE-SNEAKER-01",
                title="Canvas Low-Top Sneaker",
                brand="Rivu Footwear",
                category="Shoes",
                is_valid=True,
            ))

            # Publish to channel as draft
            pub_resp = await client.post("/api/v1/commerce/channels/publish", json={
                "channel_connection_id": conn_id,
                "product_ids": [str(prod_id)],
                "publish_as_draft": True
            }, headers=headers)
            assert pub_resp.status_code == 200
            pub_data = pub_resp.json()
            assert pub_data["total_requested"] == 1
            assert pub_data["results"][0]["status"] == "success"
    finally:
        app.dependency_overrides.pop(get_session, None)


@pytest.mark.asyncio
async def test_subscription_and_payment_flow(fake_saas_db, test_user_and_token, monkeypatch):
    """Initiate subscription order and verify payment activation with a real HMAC signature."""
    # Configure a real secret so the genuine cryptographic verification path is
    # exercised end to end (no test-signature bypass).
    from app.core import razorpay as rz
    from app.core.config import settings

    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "test_secret_key_for_hmac", raising=False)
    monkeypatch.setattr(settings, "RAZORPAY_ALLOW_TEST_SIGNATURES", False, raising=False)

    async def _test_session():
        yield fake_saas_db

    app.dependency_overrides[get_session] = _test_session
    token = test_user_and_token["token"]
    headers = {"Authorization": f"Bearer {token}"}

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Subscribe
            sub_resp = await client.post("/api/v1/billing/subscribe", json={
                "plan_code": "starter",
                "billing_cycle": "monthly",
                "customer_gstin": "27AAPCA1234F1Z5"
            }, headers=headers)
            assert sub_resp.status_code == 200
            order_data = sub_resp.json()
            assert "order_id" in order_data
            assert order_data["amount_inr"] > 4999 # Includes 18% GST

            payment_id = "pay_test_12345"
            order_id = order_data["order_id"]
            message = f"{order_id}|{payment_id}".encode()
            real_signature = hmac.new(b"test_secret_key_for_hmac", message, hashlib.sha256).hexdigest()

            # Verify payment with the correctly computed signature
            verify_resp = await client.post("/api/v1/billing/verify-payment", json={
                "subscription_id": order_data["subscription_id"],
                "razorpay_payment_id": payment_id,
                "razorpay_order_id": order_id,
                "razorpay_signature": real_signature
            }, headers=headers)
            assert verify_resp.status_code == 200

            # A forged signature must be rejected
            bad_resp = await client.post("/api/v1/billing/verify-payment", json={
                "subscription_id": order_data["subscription_id"],
                "razorpay_payment_id": payment_id,
                "razorpay_order_id": order_id,
                "razorpay_signature": "deadbeef" * 8
            }, headers=headers)
            assert bad_resp.status_code == 400
            assert verify_resp.json()["status"] == "success"
    finally:
        app.dependency_overrides.pop(get_session, None)


@pytest.mark.asyncio
async def test_operational_analytics_endpoints(fake_saas_db, test_user_and_token):
    """Test organization and Super Admin analytics calculation."""
    async def _test_session():
        yield fake_saas_db

    app.dependency_overrides[get_session] = _test_session
    token = test_user_and_token["token"]
    headers = {"Authorization": f"Bearer {token}"}

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            org_analytics = await client.get("/api/v1/analytics/organization", headers=headers)
            assert org_analytics.status_code == 200
            data = org_analytics.json()
            assert "catalogue" in data
            assert "average_completeness_score" in data["catalogue"]

            admin_analytics = await client.get("/api/v1/analytics/admin", headers=headers)
            assert admin_analytics.status_code == 200
            assert "current_month_mrr_inr" in admin_analytics.json()
    finally:
        app.dependency_overrides.pop(get_session, None)
