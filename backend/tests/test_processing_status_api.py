"""The job-status API and the retry action.

These cover the contract the UI depends on:
- /processing-status is tenant-scoped and reports the real job state;
- retry only re-queues when a retry is actually permitted, and never fabricates
  a result or resets the attempt counter;
- the worker writes a heartbeat so the API can tell "queued" from "abandoned".
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
from app.models.quality import Job


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
        self.added = []
        self.committed = 0
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        if not self._results:
            raise AssertionError("unexpected extra query")
        return self._results.pop(0)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.committed += 1

    async def flush(self):
        return None

    async def refresh(self, obj):
        return None


def _fixture():
    org_id = uuid.uuid4()
    ds = DataSource(
        id=uuid.uuid4(),
        organization_id=org_id,
        name="Sales",
        file_format="csv",
        original_filename="sales.csv",
        project_id=uuid.uuid4(),
        current_version=1,
    )
    version = DatasetVersion(
        id=uuid.uuid4(),
        data_source_id=ds.id,
        organization_id=org_id,
        version_number=1,
        version_label="raw",
        storage_key="k",
        storage_bucket="rivu",
        file_format="csv",
    )
    membership = type("M", (), {"organization_id": org_id})()
    user = type("U", (), {"id": uuid.uuid4(), "active_org_id": org_id})()
    return ds, version, membership, user


def _job(version, ds, **overrides):
    fields = dict(
        id=uuid.uuid4(),
        organization_id=ds.organization_id,
        job_type="profile",
        status="failed",
        data_source_id=ds.id,
        dataset_version_id=version.id,
        priority=5,
        attempts=1,
        max_attempts=3,
        progress_pct=60,
        queued_at=datetime.now(timezone.utc),
        error_message="Failed to parse file: bad header",
    )
    fields.update(overrides)
    return Job(**fields)


def _install(db, membership, user):
    app.dependency_overrides[get_session] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return ASGITransport(app=app)


def _teardown():
    app.dependency_overrides.pop(get_session, None)
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_processing_status_endpoint_reports_failed_job():
    ds, version, membership, user = _fixture()
    job = _job(version, ds)
    # dataset_for -> membership, dataset; then version; then the service queries.
    db = FakeSession(
        [
            _Result(membership),
            _Result(ds),
            _Result(version),   # current version lookup
            _Result(version),   # service version lookup
            _Result(ds),        # service dataset lookup
            _Result(None),      # profile
            _Result(None),      # quality
            _Result(job),       # job
            _Result(None),      # heartbeat -> no worker
        ]
    )
    transport = _install(db, membership, user)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/v1/datasets/{ds.id}/processing-status")
    finally:
        _teardown()

    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "failed"
    assert body["terminal"] is True
    assert body["error"] == "Failed to parse file: bad header"
    assert body["can_retry"] is True
    assert body["job_id"] == str(job.id)


@pytest.mark.asyncio
async def test_retry_requeues_failed_job_without_resetting_attempts():
    ds, version, membership, user = _fixture()
    job = _job(version, ds, attempts=1, max_attempts=3)
    db = FakeSession(
        [
            _Result(membership),
            _Result(ds),
            _Result(version),
            _Result(job),
        ]
    )
    transport = _install(db, membership, user)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(f"/api/v1/datasets/{ds.id}/retry-processing")
    finally:
        _teardown()

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    assert body["attempt"] == 2
    # The attempt counter is preserved so the retry budget still bounds retries.
    assert job.attempts == 1
    assert job.error_message is None
    assert job.started_at is None
    assert job.completed_at is None
    assert job.progress_pct == 0
    assert db.committed == 1


@pytest.mark.asyncio
async def test_retry_is_rejected_when_attempts_are_exhausted():
    ds, version, membership, user = _fixture()
    job = _job(version, ds, attempts=3, max_attempts=3)
    db = FakeSession([_Result(membership), _Result(ds), _Result(version), _Result(job)])
    transport = _install(db, membership, user)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(f"/api/v1/datasets/{ds.id}/retry-processing")
    finally:
        _teardown()

    assert response.status_code == 429
    # The job must not have been touched.
    assert job.status == "failed"
    assert db.committed == 0


@pytest.mark.asyncio
async def test_retry_is_rejected_while_the_job_is_still_running():
    ds, version, membership, user = _fixture()
    job = _job(version, ds, status="processing", attempts=1)
    db = FakeSession([_Result(membership), _Result(ds), _Result(version), _Result(job)])
    transport = _install(db, membership, user)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(f"/api/v1/datasets/{ds.id}/retry-processing")
    finally:
        _teardown()

    assert response.status_code == 409
    assert job.status == "processing"
    assert db.committed == 0


@pytest.mark.asyncio
async def test_retry_is_rejected_for_a_completed_job():
    ds, version, membership, user = _fixture()
    job = _job(version, ds, status="completed", attempts=1)
    db = FakeSession([_Result(membership), _Result(ds), _Result(version), _Result(job)])
    transport = _install(db, membership, user)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(f"/api/v1/datasets/{ds.id}/retry-processing")
    finally:
        _teardown()

    assert response.status_code == 409