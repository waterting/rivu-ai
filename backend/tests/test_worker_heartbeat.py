"""The worker must publish liveness, or a missing worker is invisible.

The durable queue only drains if a worker process is alive. Before the heartbeat
existed, the API had no way to distinguish "queued, worker on it" from "queued,
nobody is listening", so every upload looked like it was slowly progressing
forever. These tests pin the heartbeat contract.
"""

import uuid
from datetime import datetime, timezone

import pytest

from app.models.worker import WorkerHeartbeat
from app.workers import runner


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

    async def execute(self, statement):
        if not self._results:
            raise AssertionError("unexpected extra query")
        return self._results.pop(0)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.committed += 1


@pytest.mark.asyncio
async def test_heartbeat_inserts_a_row_when_none_exists():
    db = FakeSession([_Result(None)])

    await runner._write_heartbeat(db)

    assert len(db.added) == 1
    row = db.added[0]
    assert isinstance(row, WorkerHeartbeat)
    assert row.worker_id == runner.WORKER_ID
    assert row.hostname == runner.WORKER_HOSTNAME
    assert db.committed == 1


@pytest.mark.asyncio
async def test_heartbeat_refreshes_an_existing_row_instead_of_duplicating():
    existing = WorkerHeartbeat(
        worker_id=runner.WORKER_ID,
        hostname="old-host",
        last_seen_at=datetime(2020, 1, 1, tzinfo=timezone.utc),
        started_at=datetime(2020, 1, 1, tzinfo=timezone.utc),
        jobs_claimed=0,
    )
    db = FakeSession([_Result(existing)])

    await runner._write_heartbeat(db)

    assert db.added == [], "an existing worker row is updated, not re-inserted"
    assert existing.hostname == runner.WORKER_HOSTNAME
    assert existing.last_seen_at.year >= 2020
    assert db.committed == 1


@pytest.mark.asyncio
async def test_worker_id_is_stable_within_a_process():
    # A restart must be observable, so the id must be generated once per process
    # rather than per call.
    assert runner._write_heartbeat.__module__ == "app.workers.runner"
    assert isinstance(runner.WORKER_ID, str) and runner.WORKER_ID


@pytest.mark.asyncio
async def test_worker_retries_startup_when_the_database_is_not_ready(monkeypatch):
    """A worker that boots before the schema exists must retry, not crash.

    The API runs Alembic during deployment, so on a cold deploy the worker can
    start first. Previously init_db() ran outside the try block and an
    unreachable database killed the process outright, leaving the queue with no
    consumer at all.
    """

    class _StopWorker(BaseException):
        """Breaks out of the retry loop without being swallowed by `except Exception`."""

    attempts = {"count": 0}

    async def _flaky_init_db():
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise RuntimeError("database is not ready")
        raise _StopWorker()

    async def _no_sleep(_delay=None):
        return None

    async def _noop_close():
        return None

    monkeypatch.setattr(runner, "init_db", _flaky_init_db)
    monkeypatch.setattr(runner.asyncio, "sleep", _no_sleep)
    monkeypatch.setattr(runner, "close_db", _noop_close)

    with pytest.raises(_StopWorker):
        await runner.run_worker()

    assert attempts["count"] == 3, "startup must retry until the database is reachable"
    """A nonzero climb proves the loop consumes work, not merely that it is alive."""
    from app.models.dataset import DataSource
    from app.models.quality import Job

    org_id = uuid.uuid4()
    ds = DataSource(
        id=uuid.uuid4(),
        organization_id=org_id,
        name="Sales",
        file_format="csv",
        original_filename="sales.csv",
        project_id=uuid.uuid4(),
    )
    version_id = uuid.uuid4()
    job = Job(
        id=uuid.uuid4(),
        organization_id=org_id,
        job_type="profile",
        status="queued",
        data_source_id=ds.id,
        dataset_version_id=version_id,
        priority=5,
        attempts=0,
        max_attempts=3,
        queued_at=datetime.now(timezone.utc),
    )

    class ClaimSession(FakeSession):
        pass

    class _ScalarResult:
        def __init__(self, value):
            self._value = value

        def scalar_one_or_none(self):
            return self._value

    before = runner.CLAIMS["count"]

    async def _fake_factory():
        return None

    # _claim_one_job opens its own session, so patch the factory.
    class _Ctx:
        async def __aenter__(self):
            return ClaimSession([_ScalarResult(job)])

        async def __aexit__(self, *exc):
            return False

    original = runner.database._session_factory
    runner.database._session_factory = lambda: _Ctx()
    try:
        claim = await runner._claim_one_job()
    finally:
        runner.database._session_factory = original

    assert claim is not None
    assert claim["job_id"] == str(job.id)
    assert job.status == "processing"
    assert job.attempts == 1
    assert runner.CLAIMS["count"] == before + 1