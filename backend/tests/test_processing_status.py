"""Processing status must reflect the job, not the absence of an artifact.

The bug this guards: the dataset page polled /profile and /quality and treated
any 202 as "still working". A job that failed, or a queue with no worker
listening, therefore produced the same infinite loading screen forever.

These tests pin the real behaviour:
- a queued job with no live worker reports "stalled", not "processing";
- a failed job reports "failed" with its error and a bounded retry;
- a processing job reports its real stage and progress;
- a completed job reports "completed";
- worker liveness is derived from the heartbeat, not assumed.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.models.dataset import DataSource, DatasetVersion
from app.models.profile import DataProfile
from app.models.quality import Job, QualityReport
from app.models.worker import WorkerHeartbeat
from app.services.processing_status import processing_status, worker_liveness


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

    async def commit(self):
        return None

    async def flush(self):
        return None


def _fixture(**overrides):
    org_id = uuid.uuid4()
    ds = DataSource(
        id=uuid.uuid4(),
        organization_id=org_id,
        name="Sales",
        file_format="csv",
        original_filename="sales.csv",
        project_id=uuid.uuid4(),
        current_version=1,
        status=overrides.pop("dataset_status", "uploaded"),
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
    return ds, version


def _job(version_id, data_source_id, org_id, **overrides):
    fields = dict(
        id=uuid.uuid4(),
        organization_id=org_id,
        job_type="profile",
        status="queued",
        data_source_id=data_source_id,
        dataset_version_id=version_id,
        priority=5,
        attempts=0,
        max_attempts=3,
        progress_pct=0,
        queued_at=datetime.now(timezone.utc),
        started_at=None,
        completed_at=None,
    )
    fields.update(overrides)
    return Job(**fields)


def _heartbeat(age_seconds: int):
    return WorkerHeartbeat(
        worker_id="w-1",
        hostname="worker-1",
        last_seen_at=datetime.now(timezone.utc) - timedelta(seconds=age_seconds),
        started_at=datetime.now(timezone.utc) - timedelta(hours=1),
        jobs_claimed=3,
    )


def _sessions(*, dataset, version, profile=None, quality=None, job=None, heartbeat=None):
    """Queue the queries in the exact order processing_status issues them."""
    return FakeSession(
        [
            _Result(version),      # version lookup
            _Result(dataset),      # dataset lookup
            _Result(profile),      # profile existence
            _Result(quality),      # quality existence
            _Result(job),          # job for this version
            _Result(job),          # fallback job by dataset (only if first is None)
            _Result(heartbeat),    # worker liveness
        ]
    )


def _remove_fallback(db: FakeSession):
    """The second job query only runs when the version-scoped job is None."""
    pass


@pytest.mark.asyncio
async def test_queued_job_without_worker_is_stalled_not_processing():
    ds, version = _fixture()
    job = _job(version.id, ds.id, ds.organization_id, status="queued", attempts=0)
    db = _sessions(dataset=ds, version=version, profile=None, quality=None, job=job, heartbeat=None)
    # version, dataset, profile, quality, job, (fallback job), heartbeat
    db._results = [_Result(version), _Result(ds), _Result(None), _Result(None), _Result(job), _Result(None)]

    status = await processing_status(db, ds.id, version.id)

    assert status["state"] == "stalled"
    assert status["reason"] == "no_worker"
    assert status["terminal"] is False
    assert "No processing worker" in status["message"]
    assert status["worker"]["online"] is False


@pytest.mark.asyncio
async def test_queued_job_with_live_worker_is_queued():
    ds, version = _fixture()
    job = _job(version.id, ds.id, ds.organization_id, status="queued", attempts=0)
    db = _sessions(dataset=ds, version=version, job=job, heartbeat=_heartbeat(1))
    db._results = [_Result(version), _Result(ds), _Result(None), _Result(None), _Result(job), _Result(_heartbeat(1))]

    status = await processing_status(db, ds.id, version.id)

    assert status["state"] == "queued"
    assert status["terminal"] is False
    assert status["worker"]["online"] is True
    assert status["worker"]["age_seconds"] is not None


@pytest.mark.asyncio
async def test_processing_job_reports_real_stage_and_progress():
    ds, version = _fixture()
    job = _job(
        version.id,
        ds.id,
        ds.organization_id,
        status="processing",
        attempts=1,
        progress_pct=60,
        progress_message="Calculating quality score...",
        started_at=datetime.now(timezone.utc) - timedelta(seconds=5),
    )
    db = FakeSession(
        [
            _Result(version),
            _Result(ds),
            _Result(None),
            _Result(None),
            _Result(job),
            _Result(_heartbeat(1)),
        ]
    )

    status = await processing_status(db, ds.id, version.id)

    assert status["state"] == "processing"
    assert status["stage"] == "quality"
    assert status["progress_pct"] == 60
    assert status["message"] == "Calculating quality score..."
    assert status["terminal"] is False
    assert status["can_retry"] is False


@pytest.mark.asyncio
async def test_processing_job_with_dead_worker_is_stalled():
    ds, version = _fixture()
    job = _job(
        version.id,
        ds.id,
        ds.organization_id,
        status="processing",
        attempts=1,
        progress_pct=60,
        started_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    db = FakeSession(
        [
            _Result(version),
            _Result(ds),
            _Result(None),
            _Result(None),
            _Result(job),
            _Result(None),
        ]
    )

    status = await processing_status(db, ds.id, version.id)

    assert status["state"] == "stalled"
    assert status["reason"] == "worker_lost"
    assert "no longer responding" in status["message"]


@pytest.mark.asyncio
async def test_failed_job_is_terminal_and_carries_the_error():
    ds, version = _fixture()
    job = _job(
        version.id,
        ds.id,
        ds.organization_id,
        status="failed",
        attempts=1,
        max_attempts=3,
        error_message="Failed to parse file: invalid CSV header",
        completed_at=datetime.now(timezone.utc),
    )
    db = FakeSession(
        [
            _Result(version),
            _Result(ds),
            _Result(None),
            _Result(None),
            _Result(job),
            _Result(_heartbeat(1)),
        ]
    )

    status = await processing_status(db, ds.id, version.id)

    assert status["state"] == "failed"
    assert status["terminal"] is True
    assert status["error"] == "Failed to parse file: invalid CSV header"
    # Attempts remain available, so the UI may offer a retry.
    assert status["can_retry"] is True


@pytest.mark.asyncio
async def test_failed_job_with_no_attempts_left_cannot_retry():
    ds, version = _fixture()
    job = _job(
        version.id,
        ds.id,
        ds.organization_id,
        status="failed",
        attempts=3,
        max_attempts=3,
        error_message="boom",
        completed_at=datetime.now(timezone.utc),
    )
    db = FakeSession(
        [
            _Result(version),
            _Result(ds),
            _Result(None),
            _Result(None),
            _Result(job),
            _Result(_heartbeat(1)),
        ]
    )

    status = await processing_status(db, ds.id, version.id)

    assert status["state"] == "failed"
    assert status["can_retry"] is False


@pytest.mark.asyncio
async def test_completed_job_is_terminal_success():
    ds, version = _fixture()
    profile = DataProfile(id=uuid.uuid4(), dataset_version_id=version.id, row_count=10, column_count=3)
    quality = QualityReport(id=uuid.uuid4(), dataset_version_id=version.id, overall_score=90, total_issues=0)
    job = _job(
        version.id,
        ds.id,
        ds.organization_id,
        status="completed",
        attempts=1,
        progress_pct=100,
        completed_at=datetime.now(timezone.utc),
    )
    db = FakeSession(
        [
            _Result(version),
            _Result(ds),
            _Result(profile),
            _Result(quality),
            _Result(job),
            _Result(_heartbeat(1)),
        ]
    )

    status = await processing_status(db, ds.id, version.id)

    assert status["state"] == "completed"
    assert status["stage"] == "complete"
    assert status["terminal"] is True
    assert status["profile_ready"] is True
    assert status["quality_ready"] is True


@pytest.mark.asyncio
async def test_worker_liveness_uses_the_stale_window():
    stale = settings.WORKER_HEARTBEAT_STALE_SECONDS

    none_seen = await worker_liveness(FakeSession([_Result(None)]))
    assert none_seen.online is False
    assert none_seen.age_seconds is None

    fresh = await worker_liveness(FakeSession([_Result(_heartbeat(1))]))
    assert fresh.online is True
    assert fresh.worker_id == "w-1"

    stale_seen = await worker_liveness(FakeSession([_Result(_heartbeat(stale + 5))]))
    assert stale_seen.online is False
    assert stale_seen.age_seconds is not None and stale_seen.age_seconds > stale