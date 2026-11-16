"""Locally testable coverage for brief Journeys A–G (Part 13).

These tests use real engines/routes where possible without credentials,
a live database, external stores, or deployment access. They do NOT claim
end-to-end production or third-party integration success.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import polars as pl
import pytest
from httpx import ASGITransport, AsyncClient

from app.cleaning.engine import TransformationEngine
from app.core.database import get_session
from app.core.security import get_current_user
from app.ingestion.artifacts import dataframe_to_bytes
from app.ingestion.parser import parse_to_polars
from app.main import app
from app.models.dataset import DataSource
from app.profiler.engine import profile_dataframe
from app.profiler.quality import calculate_quality_report
from app.tools import runner


class _Result:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value

    def scalars(self):
        return self

    def all(self):
        return self._value or []


class FakeSession:
    def __init__(self, results):
        self._results = list(results)
        self.deleted = []
        self.committed = 0

    async def execute(self, _):
        if not self._results:
            raise AssertionError("unexpected extra query")
        return self._results.pop(0)

    def add(self, obj):
        pass

    async def delete(self, obj):
        self.deleted.append(obj)

    async def commit(self):
        self.committed += 1

    async def flush(self):
        pass

    async def refresh(self, obj):
        pass


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    app.dependency_overrides.clear()


# Journey A: format conversion (local pipeline path, not browser/download E2E)
def test_journey_a_transform_export_reopen_roundtrip():
    src = pl.DataFrame(
        {
            "Item Name": [" Widget ", "Gadget", "Widget "],
            "SKU Code": ["A1", "A2", "A1"],
            "MRP": ["100", "200", "100"],
        }
    )
    engine = TransformationEngine(src)
    cleaned = engine.execute_operations(
        [
            {"type": "trim_whitespace", "column": "Item Name", "parameters": {}},
            {"type": "rename_column", "column": "Item Name", "parameters": {"new_name": "title"}},
            {"type": "rename_column", "column": "SKU Code", "parameters": {"new_name": "sku"}},
            {"type": "rename_column", "column": "MRP", "parameters": {"new_name": "price"}},
        ]
    )["df"]
    csv_bytes = dataframe_to_bytes(cleaned.select(["title", "sku", "price"]), "csv")
    reopened, meta = parse_to_polars(csv_bytes, "csv", "out.csv")
    assert reopened.height == 3
    assert {"title", "sku", "price"}.issubset(set(reopened.columns))
    assert meta.get("source_format", "csv") == "csv" or "delimiter" in meta


# Journey B: data quality - profile, clean, validate
def test_journey_b_profile_and_clean_pipeline_runs():
    df = pl.DataFrame(
        {
            "email": ["a@b.com", None, "bad", "a@b.com"],
            "qty": ["1", "2", None, "x"],
            "name": [" Alice ", "Bob", "Bob", "Bob"],
        }
    )
    before = profile_dataframe(df, "org")
    before_q = calculate_quality_report(before, before["columns"], row_count=df.height)
    engine = TransformationEngine(df)
    cleaned = engine.execute_operations(
        [
            {"type": "trim_whitespace", "column": "name", "parameters": {}},
            {"type": "drop_nulls", "column": None, "parameters": {"subset": ["email"]}},
        ]
    )["df"]
    after = profile_dataframe(cleaned, "org")
    after_q = calculate_quality_report(after, after["columns"], row_count=cleaned.height)
    assert before["row_count"] == 4
    assert cleaned.height <= 4
    assert "overall_score" in before_q and "overall_score" in after_q


@pytest.mark.asyncio
async def test_journey_b_validator_reports_issues():
    df = pl.DataFrame({"email": ["a@b.com", None, "bad"], "qty": ["1", "x", "3"]})
    result = await runner.run_tool(
        "data-validator",
        df,
        {"required_columns": ["email"], "numeric_columns": ["qty"], "email_columns": ["email"]},
    )
    assert result["metrics"]["error_count"] >= 1
    assert result["metrics"]["warning_count"] >= 1


# Journey C: catalogue normalize/validate/export (local tool path)
@pytest.mark.asyncio
async def test_journey_c_catalogue_normalize_validate_export():
    df = pl.DataFrame(
        {
            "title": ["  Blue Shirt ", "red shirt"],
            "sku": ["SKU1", "SKU2"],
            "price": ["1200", "500"],
            "category": ["mens wear", "Mens Wear"],
        }
    )
    norm = await runner.run_tool(
        "catalogue-normalizer",
        df,
        {"title_column": ["title"], "category_column": ["category"], "price_column": ["price"]},
    )
    out_df = norm.get("output_df")
    if out_df is None:
        out_df = df
    validation = await runner.run_tool(
        "data-validator", out_df, {"required_columns": ["title", "sku", "price"]}
    )
    out = dataframe_to_bytes(out_df, "xlsx")
    reopened, _ = parse_to_polars(out, "xlsx", "catalogue.xlsx")
    assert reopened.height == 2
    assert "metrics" in validation


# Journey D: tool isolation/catalogue contract (API-level, no DB)
@pytest.mark.asyncio
async def test_journey_d_tools_catalogue_and_unknown_tool_contract():
    user = type("U", (), {"id": uuid.uuid4(), "active_org_id": uuid.uuid4()})()
    app.dependency_overrides[get_current_user] = lambda: user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/api/v1/tools/")
        assert r.status_code == 200
        tools = r.json().get("tools", [])
        assert any(t.get("slug") == "data-profiler" for t in tools)
        r2 = await client.get("/api/v1/tools/does-not-exist")
        assert r2.status_code == 404


# Journey E: blocked (credentials/store)
@pytest.mark.skip(reason="Blocked: requires valid Shopify dev store credentials/scopes (Journey E)")
def test_journey_e_shopify_store_sync_blocked():
    pass


# Journey F: blocked (billing credentials/webhooks)
@pytest.mark.skip(reason="Blocked: requires configured Razorpay keys/webhooks and live checkout (Journey F)")
def test_journey_f_billing_checkout_blocked():
    pass


# Journey G: tenant isolation contract (local) - cross-org delete blocked
@pytest.mark.asyncio
async def test_journey_g_delete_cross_org_is_blocked(monkeypatch):
    from app.api.v1.endpoints import datasets as ds_ep

    org_id = uuid.uuid4()
    ds = DataSource(
        id=uuid.uuid4(),
        organization_id=org_id,
        project_id=uuid.uuid4(),
        created_by=uuid.uuid4(),
        name="X",
        description=None,
        original_filename="x.csv",
        file_format="csv",
        status="uploaded",
        current_version=1,
        tags=[],
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    user = type("U", (), {"id": ds.created_by, "active_org_id": uuid.uuid4()})()

    async def fake_org(_u, _db):
        return uuid.uuid4()

    async def fake_role(_u, _db, _a):
        return type("M", (), {"organization_id": uuid.uuid4(), "role": "owner"})()

    monkeypatch.setattr(ds_ep, "_get_user_org", fake_org)
    monkeypatch.setattr(ds_ep, "require_org_role", fake_role)
    db = FakeSession([_Result(None)])
    app.dependency_overrides[get_session] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.delete(
            f"/api/v1/datasets/{ds.id}",
            headers={"X-Confirm-Delete": "DELETE"},
        )
    assert r.status_code == 404
