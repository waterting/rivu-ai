"""Endpoint-level test for the Business Intelligence route.

Runs against a fake session and a fake storage backend so no database, network
or object store is required.
"""

import uuid
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.v1.endpoints import insights
from app.core.database import get_session
from app.core.security import get_current_user
from app.main import app
from app.models.dataset import DataSource, DatasetVersion
from app.models.profile import ColumnProfile, DataProfile


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
    """Returns queued results in call order."""

    def __init__(self, results):
        self._results = list(results)
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        if not self._results:
            raise AssertionError("unexpected extra query")
        return self._results.pop(0)


class FakeStorage:
    def __init__(self, payload: bytes):
        self._payload = payload

    async def download_file(self, key: str) -> bytes:
        return self._payload


CSV = (
    "order_date,sku,qty,unit_price,unit_cost,stock\n"
    "2026-01-05,A-1,2,100,60,1\n"
    "2026-01-07,A-2,1,200,120,10\n"
    "2026-02-02,A-1,5,100,60,1\n"
    "2026-02-09,A-3,3,50,30,4\n"
).encode()


def _facts():
    rows = [
        ("order_date", "date", "String"),
        ("sku", "string", "String"),
        ("qty", "integer", "Int64"),
        ("unit_price", "currency", "Int64"),
        ("unit_cost", "currency", "Int64"),
        ("stock", "integer", "Int64"),
    ]
    objects = []
    for index, (name, semantic, dtype) in enumerate(rows):
        col = ColumnProfile()
        col.column_index = index
        col.column_name = name
        col.semantic_type = semantic
        col.inferred_type = dtype
        objects.append(col)
    return objects


def _dataset_and_version():
    ds = DataSource()
    ds.id = uuid.uuid4()
    ds.organization_id = uuid.uuid4()
    ds.name = "sales_q1"
    ds.status = "profiled"
    ds.current_version = 1
    ds.original_filename = "sales_q1.csv"

    version = DatasetVersion()
    version.id = uuid.uuid4()
    version.data_source_id = ds.id
    version.version_number = 1
    version.file_format = "csv"
    version.storage_key = "org/ds/v1/sales_q1.csv"
    return ds, version


@pytest.mark.asyncio
async def test_bi_endpoint_computes_metrics_from_rows(monkeypatch):
    ds, version = _dataset_and_version()

    profile = DataProfile()
    profile.id = uuid.uuid4()
    profile.dataset_version_id = version.id

    fake_db = FakeSession(
        [_Result(ds.organization_id), _Result(ds), _Result(version), _Result(profile), _Result(_facts())]
    )
    fake_user = type("U", (), {"id": uuid.uuid4(), "active_org_id": ds.organization_id})()

    monkeypatch.setattr(insights, "get_storage", lambda: FakeStorage(CSV))

    app.dependency_overrides[get_session] = lambda: fake_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/v1/datasets/{ds.id}/bi")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["row_count"] == 4
    assert payload["version"] == 1
    assert payload["truncated"] is False

    metrics = {m["key"]: m for m in payload["metrics"]}
    assert metrics["revenue_total"]["available"] is True
    assert metrics["revenue_total"]["value"] == pytest.approx(1050.0)
    assert metrics["units_total"]["value"] == 11
    assert metrics["gross_margin"]["value"] == pytest.approx(420.0)
    assert metrics["gross_margin"]["margin_pct"] == pytest.approx(40.0)

    assert {row["product"] for row in payload["top_products"]} == {"A-1", "A-2", "A-3"}
    assert {row["period"] for row in payload["demand_trend"]} == {"2026-01", "2026-02"}

    restock = {row["product"]: row for row in payload["restock"]}
    assert restock["A-1"]["gap"] == pytest.approx(6.0)


@pytest.mark.asyncio
async def test_bi_endpoint_reports_processing_instead_of_guessing(monkeypatch):
    ds, version = _dataset_and_version()

    fake_db = FakeSession([_Result(ds.organization_id), _Result(ds), _Result(version), _Result(None)])
    fake_user = type("U", (), {"id": uuid.uuid4(), "active_org_id": ds.organization_id})()

    app.dependency_overrides[get_session] = lambda: fake_db
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/v1/datasets/{ds.id}/bi")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    assert "profiled" in response.json()["detail"]["message"].lower()