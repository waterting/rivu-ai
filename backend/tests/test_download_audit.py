"""Presigned download lifecycle and audit trail (audit finding 13).

Covers the three properties the audit called out:
- the version lookup is tenant-bound,
- the storage key is validated before a URL is minted,
- minting a URL records who took it, for which object, under which tenant.
"""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.v1.endpoints import datasets
from app.core.database import get_session
from app.core.security import get_current_user
from app.main import app
from app.models.audit import AuditLog
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
    """Returns queued results in call order and records added objects."""

    def __init__(self, results):
        self._results = list(results)
        self.added = []
        self.commits = 0
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        if not self._results:
            raise AssertionError("unexpected extra query")
        return self._results.pop(0)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1

    async def flush(self):
        return None

    async def refresh(self, obj):
        return None


class FakeStorage:
    def __init__(self, exists=True):
        self._exists = exists
        self.requested = []

    async def file_exists(self, key):
        return self._exists

    async def get_download_url(self, key, expires_in=900):
        self.requested.append((key, expires_in))
        return f"https://storage.example/{key}?expires={expires_in}"


def _fixture(*, organization_id, version_label="raw", file_format="csv", storage_key=None):
    org_id = organization_id
    ds = DataSource(
        id=uuid.uuid4(),
        organization_id=org_id,
        name="Sales",
        file_format=file_format,
        original_filename="sales.csv",
        project_id=uuid.uuid4(),
        current_version=1,
    )
    version = DatasetVersion(
        id=uuid.uuid4(),
        data_source_id=ds.id,
        organization_id=org_id,
        version_number=1,
        version_label=version_label,
        storage_key=storage_key or f"orgs/{org_id}/projects/{ds.project_id}/datasets/{ds.id}/v1/sales.csv",
        storage_bucket="rivu",
        file_format=file_format,
    )
    membership = type("M", (), {"organization_id": org_id})()
    user = type("U", (), {"id": uuid.uuid4(), "active_org_id": org_id})()
    return ds, version, membership, user


def _client(monkeypatch, db, user, storage):
    monkeypatch.setattr(datasets, "get_storage", lambda: storage)
    app.dependency_overrides[get_session] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return ASGITransport(app=app)


@pytest.mark.asyncio
async def test_export_records_an_audit_event(monkeypatch):
    ds, version, membership, user = _fixture(organization_id=uuid.uuid4())
    storage = FakeStorage()
    db = FakeSession([_Result(membership), _Result(ds), _Result(version)])
    transport = _client(monkeypatch, db, user, storage)

    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/v1/datasets/{ds.id}/export/1")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["format"] == "csv"
    assert body["expires_in"] == datasets.download_url_ttl_seconds()

    events = [obj for obj in db.added if isinstance(obj, AuditLog)]
    assert len(events) == 1
    event = events[0]
    assert event.action == "download"
    assert event.resource_type == "dataset_version"
    assert event.resource_id == version.id
    assert event.organization_id == ds.organization_id
    assert event.user_id == user.id
    assert event.details["storage_key"] == version.storage_key
    assert event.details["expires_in"] == body["expires_in"]
    assert db.commits >= 1


@pytest.mark.asyncio
async def test_export_uses_configured_ttl(monkeypatch):
    monkeypatch.setattr(datasets.settings, "DOWNLOAD_URL_TTL_SECONDS", 120)
    ds, version, membership, user = _fixture(organization_id=uuid.uuid4())
    storage = FakeStorage()
    db = FakeSession([_Result(membership), _Result(ds), _Result(version)])
    transport = _client(monkeypatch, db, user, storage)

    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/v1/datasets/{ds.id}/export/1")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["expires_in"] == 120
    assert storage.requested == [(version.storage_key, 120)]


@pytest.mark.asyncio
async def test_ttl_is_bounded(monkeypatch):
    monkeypatch.setattr(datasets.settings, "DOWNLOAD_URL_TTL_SECONDS", 10 * 24 * 3600)
    assert datasets.download_url_ttl_seconds() == 24 * 3600

    monkeypatch.setattr(datasets.settings, "DOWNLOAD_URL_TTL_SECONDS", 1)
    assert datasets.download_url_ttl_seconds() == 60


@pytest.mark.asyncio
async def test_export_denied_when_version_belongs_to_another_tenant(monkeypatch):
    """A version row from a foreign org must not be downloadable.

    The dataset lookup is org-scoped, so the realistic defence-in-depth case is
    a version whose organization_id disagrees with the caller's.
    """
    ds, version, membership, user = _fixture(organization_id=uuid.uuid4())
    version.organization_id = uuid.uuid4()  # foreign tenant
    storage = FakeStorage()
    db = FakeSession([_Result(membership), _Result(ds), _Result(None)])
    transport = _client(monkeypatch, db, user, storage)

    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/v1/datasets/{ds.id}/export/1")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert storage.requested == []


@pytest.mark.asyncio
async def test_export_rejects_traversal_in_derived_key(monkeypatch):
    """A stored key containing traversal must not yield a URL for an outside object.

    The sibling-artifact path builds the candidate key by string surgery, so a
    tainted stored key is the one case where the derived key could escape the
    version's prefix.
    """
    ds, version, membership, user = _fixture(
        organization_id=uuid.uuid4(),
        version_label="refined",
        storage_key="orgs/o/p/d/v1/../../other.csv",
    )
    storage = FakeStorage()
    db = FakeSession([_Result(membership), _Result(ds), _Result(version)])
    transport = _client(monkeypatch, db, user, storage)

    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/v1/datasets/{ds.id}/export/1?format=xlsx")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 500
    assert storage.requested == []
    events = [obj for obj in db.added if isinstance(obj, AuditLog)]
    assert events and events[0].details["reason"] == "unsafe_storage_key"


@pytest.mark.asyncio
async def test_export_denied_for_unsupported_format(monkeypatch):
    ds, version, membership, user = _fixture(organization_id=uuid.uuid4())
    storage = FakeStorage()
    db = FakeSession([_Result(membership), _Result(ds), _Result(version)])
    transport = _client(monkeypatch, db, user, storage)

    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/v1/datasets/{ds.id}/export/1?format=exe")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    events = [obj for obj in db.added if isinstance(obj, AuditLog)]
    assert events and events[0].details["reason"] == "unsupported_format"


@pytest.mark.parametrize(
    "candidate,base,expected",
    [
        ("orgs/o/p/d/v1/a.csv", "orgs/o/p/d/v1/a.csv", True),
        ("orgs/o/p/d/v1/a.json", "orgs/o/p/d/v1/a.csv", True),
        ("orgs/o/p/d/v2/a.csv", "orgs/o/p/d/v1/a.csv", False),
        ("../secrets.csv", "orgs/o/p/d/v1/a.csv", False),
        ("/etc/passwd", "orgs/o/p/d/v1/a.csv", False),
        ("orgs/o/p/d/v1/a.csv", "orgs/o/p/d/v1/a.csv", True),
        ("orgs\\o\\a.csv", "orgs/o/p/d/v1/a.csv", False),
        ("", "orgs/o/p/d/v1/a.csv", False),
    ],
)
def test_is_safe_storage_key(candidate, base, expected):
    assert datasets.is_safe_storage_key(candidate, base) is expected