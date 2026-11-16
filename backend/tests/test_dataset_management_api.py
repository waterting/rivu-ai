"""Dataset management API: list, records, rename, duplicate, archive/restore, delete.

Regression tests for Part 3 workspace gaps. Uses dependency overrides and a fake
session so they run without a live database.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import get_session
from app.core.security import get_current_user
from app.main import app
from app.models.dataset import DataSource, DatasetVersion


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
        self.added = []
        self.committed = 0

    async def execute(self, statement):
        if not self._results:
            raise AssertionError("unexpected extra query")
        return self._results.pop(0)

    def add(self, obj):
        self.added.append(obj)

    async def delete(self, obj):
        self.deleted.append(obj)

    async def commit(self):
        self.committed += 1

    async def flush(self):
        if self.added and getattr(self.added[-1], "id", None) is None:
            self.added[-1].id = uuid.uuid4()

    async def refresh(self, obj):
        return None


def _fixture(status: str = "uploaded"):
    org_id = uuid.uuid4()
    ds = DataSource(
        id=uuid.uuid4(),
        organization_id=org_id,
        project_id=uuid.uuid4(),
        created_by=uuid.uuid4(),
        name="Sales Data",
        description="desc",
        original_filename="sales.csv",
        file_format="csv",
        status=status,
        current_version=1,
        tags=[],
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    version = DatasetVersion(
        id=uuid.uuid4(),
        data_source_id=ds.id,
        organization_id=org_id,
        version_number=1,
        version_label="v1",
        storage_key=f"orgs/{org_id}/datasets/{ds.id}/v1/sales.csv",
        file_format="csv",
        file_size_bytes=1234,
        row_count=10,
        column_count=4,
        quality_score=88.0,
        quality_delta=None,
        created_at=datetime.now(timezone.utc),
    )
    user = type("U", (), {"id": ds.created_by, "active_org_id": org_id})()
    membership = type(
        "M",
        (),
        {"organization_id": org_id, "role": "owner", "user_id": user.id, "is_active": True},
    )()
    return ds, version, user, membership


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_delete_dataset_requires_confirmation():
    ds, _version, user, _membership = _fixture()
    db = FakeSession([_Result(ds)])
    app.dependency_overrides[get_session] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.delete(f"/api/v1/datasets/{ds.id}")
    assert r.status_code == 400
    body = r.json()
    assert body["detail"]["type"] == "confirmation_required"
    assert db.deleted == []
    assert db.committed == 0


@pytest.mark.asyncio
async def test_delete_dataset_removes_record_and_calls_storage(monkeypatch):
    ds, version, user, _membership = _fixture()
    from app.api.v1.endpoints import datasets as ds_ep

    async def fake_org(_u, _db):
        return ds.organization_id

    async def fake_role(_u, _db, _allowed):
        return type("M", (), {"organization_id": ds.organization_id, "role": "owner"})()

    deleted_keys: list[str] = []

    class FakeStorage:
        async def delete_file(self, key):
            deleted_keys.append(key)

    monkeypatch.setattr(ds_ep, "_get_user_org", fake_org)
    monkeypatch.setattr(ds_ep, "require_org_role", fake_role)
    monkeypatch.setattr(ds_ep, "get_storage", lambda: FakeStorage())

    db = FakeSession([_Result(ds), _Result([version])])
    app.dependency_overrides[get_session] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.delete(
            f"/api/v1/datasets/{ds.id}",
            headers={"X-Confirm-Delete": "DELETE"},
        )

    assert r.status_code == 204
    assert ds in db.deleted
    assert db.committed >= 1
    assert deleted_keys == [version.storage_key]


@pytest.mark.asyncio
async def test_delete_dataset_404_for_other_org(monkeypatch):
    ds, _version, user, _membership = _fixture()
    from app.api.v1.endpoints import datasets as ds_ep

    async def fake_org(_u, _db):
        return uuid.uuid4()

    async def fake_role(_u, _db, _allowed):
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
    assert db.deleted == []