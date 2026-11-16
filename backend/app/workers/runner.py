"""Database-backed worker for durable dataset-processing jobs.

Run as a separate Render background worker:
    python -m app.workers.runner
PostgreSQL row locks ensure only one worker claims a queued job at a time.
"""
import asyncio
import os
import socket
import time
import uuid as uuid_module
from datetime import datetime, timedelta, timezone
from uuid import UUID

import structlog
from sqlalchemy import func, select

from app.core import database
from app.core.database import close_db, init_db
from app.models.dataset import DataSource
from app.models.quality import Job
from app.models.worker import WorkerHeartbeat
from app.observability.metrics import (
    job_duration_seconds,
    job_failures_total,
    jobs_pending,
    jobs_total,
    worker_last_seen_timestamp_seconds,
)
from app.workers.processor import process_dataset_async

logger = structlog.get_logger(__name__)
POLL_SECONDS = 2
STALE_JOB_MINUTES = 120

# Identifies this process in worker_heartbeats. Generated once per process so a
# restart shows up as a new row instead of silently refreshing an old one.
WORKER_ID = os.environ.get("RIVU_WORKER_ID") or f"{socket.gethostname()}-{uuid_module.uuid4().hex[:12]}"
WORKER_HOSTNAME = socket.gethostname()
CLAIMS = {"count": 0}

# Mirrors the job_type enum; reported so a drained queue reads 0 instead of
# keeping the last observed depth.
JOB_TYPES = ("profile", "quality_analysis", "ai_analysis", "transformation", "validation", "export")


async def _write_heartbeat(db) -> None:
    """Record that this worker is alive and consuming the queue.

    Without this the API cannot tell "queued, worker on it" from "queued, nobody
    is listening", so a missing worker looks identical to a slow one.
    """
    now = datetime.now(timezone.utc)
    row = (
        await db.execute(select(WorkerHeartbeat).where(WorkerHeartbeat.worker_id == WORKER_ID))
    ).scalar_one_or_none()
    if row is None:
        row = WorkerHeartbeat(
            worker_id=WORKER_ID,
            hostname=WORKER_HOSTNAME,
            last_seen_at=now,
            jobs_claimed=CLAIMS["count"],
        )
        db.add(row)
    else:
        row.hostname = WORKER_HOSTNAME
        row.last_seen_at = now
        row.jobs_claimed = CLAIMS["count"]
    worker_last_seen_timestamp_seconds.set(now.timestamp())
    await db.commit()


async def _refresh_queue_depth(db) -> None:
    """Publish per-type queue depth so a stalled pipeline is visible."""
    result = await db.execute(
        select(Job.job_type, func.count()).where(Job.status == "queued").group_by(Job.job_type)
    )
    counts = {job_type: int(count) for job_type, count in result.all()}
    for job_type in JOB_TYPES:
        jobs_pending.set(counts.get(job_type, 0), job_type=job_type)


async def _recover_stale_jobs(db) -> None:
    """Requeue crashed jobs after a generous lease window; cap retries."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=STALE_JOB_MINUTES)
    stale = await db.execute(
        select(Job).where(
            Job.status == "processing",
            Job.started_at.is_not(None),
            Job.started_at < cutoff,
        )
    )
    now = datetime.now(timezone.utc)
    for job in stale.scalars().all():
        if job.attempts < job.max_attempts:
            job.status = "queued"
            job.started_at = None
            job.progress_message = "Recovered after worker interruption; retry queued"
            logger.warning("job_requeued_after_worker_interruption", job_id=str(job.id), attempts=job.attempts)
        else:
            job.status = "failed"
            job.error_message = "Worker interrupted repeatedly; maximum attempts exceeded"
            job.completed_at = now
            if job.data_source_id:
                dataset = (
                    await db.execute(select(DataSource).where(DataSource.id == job.data_source_id))
                ).scalar_one_or_none()
                if dataset is not None:
                    dataset.status = "failed"
            logger.error("job_failed_after_repeated_worker_interruptions", job_id=str(job.id))
    await db.commit()


async def _claim_one_job():
    """Atomically claim the highest-priority queued profiling job."""
    async with database._session_factory() as db:
        result = await db.execute(
            select(Job)
            .where(Job.status == "queued", Job.job_type == "profile")
            .order_by(Job.priority.asc(), Job.queued_at.asc())
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        job = result.scalar_one_or_none()
        if job is None:
            return None
        job.status = "processing"
        job.started_at = datetime.now(timezone.utc)
        job.attempts += 1
        job.progress_pct = max(job.progress_pct or 0, 1)
        job.progress_message = "Worker claimed job"
        await db.commit()
        jobs_total.inc(job_type=job.job_type, status="processing")
        CLAIMS["count"] += 1
        return {
            "job_id": str(job.id),
            "job_type": job.job_type,
            "version_id": str(job.dataset_version_id),
            "data_source_id": str(job.data_source_id),
            "org_id": str(job.organization_id),
        }


async def _process_claim(claim: dict) -> None:
    from app.models.dataset import DatasetVersion

    job_uuid = UUID(claim["job_id"])
    version_uuid = UUID(claim["version_id"])
    source_uuid = UUID(claim["data_source_id"])
    async with database._session_factory() as db:
        source_result = await db.execute(
            select(DataSource).where(DataSource.id == source_uuid)
        )
        source = source_result.scalar_one_or_none()
        version_result = await db.execute(
            select(DatasetVersion).where(DatasetVersion.id == version_uuid)
        )
        version = version_result.scalar_one_or_none()
        if source is None or version is None:
            job_result = await db.execute(select(Job).where(Job.id == job_uuid))
            job = job_result.scalar_one_or_none()
            if job:
                job.status = "failed"
                job.error_message = "Job references a missing dataset or dataset version"
                job.completed_at = datetime.now(timezone.utc)
            await db.commit()
            return
        file_format = source.file_format

    await process_dataset_async(
        job_id=claim["job_id"],
        version_id=claim["version_id"],
        data_source_id=claim["data_source_id"],
        org_id=claim["org_id"],
        raw_bytes=None,
        file_format=file_format,
    )


async def run_worker() -> None:
    try:
        # Startup is retried like the poll loop. The API service runs Alembic
        # during deployment, so a worker that boots first would otherwise die on
        # a missing schema or a database that is still coming up, and a crashed
        # worker consumes no jobs.
        while True:
            try:
                await init_db()
                break
            except Exception as exc:
                logger.warning("worker_db_init_failed", error=str(exc), retry_seconds=5)
                await asyncio.sleep(5)
        logger.info("rivu_worker_started", poll_seconds=POLL_SECONDS, worker_id=WORKER_ID)
        while True:
            try:
                async with database._session_factory() as db:
                    await _write_heartbeat(db)
                    await _recover_stale_jobs(db)
                    await _refresh_queue_depth(db)
                claim = await _claim_one_job()
            except Exception as exc:
                # The API service applies Alembic migrations during deployment. If
                # this worker starts first, retry until the schema is ready.
                logger.warning("worker_queue_poll_failed", error=str(exc))
                await asyncio.sleep(5)
                continue
            if claim is None:
                await asyncio.sleep(POLL_SECONDS)
                continue
            started = time.perf_counter()
            try:
                await _process_claim(claim)
                jobs_total.inc(job_type=claim["job_type"], status="completed")
            except Exception as exc:
                logger.exception("worker_job_unhandled_error", job_id=claim["job_id"], error=str(exc))
                async with database._session_factory() as db:
                    result = await db.execute(select(Job).where(Job.id == UUID(claim["job_id"])))
                    job = result.scalar_one_or_none()
                    if job:
                        job.status = "failed" if job.attempts >= job.max_attempts else "queued"
                        job.error_message = str(exc)[:2000]
                        job.completed_at = datetime.now(timezone.utc) if job.status == "failed" else None
                        if job.status == "failed":
                            job_failures_total.inc(job_type=job.job_type)
                            if job.data_source_id:
                                dataset = (
                                    await db.execute(
                                        select(DataSource).where(DataSource.id == job.data_source_id)
                                    )
                                ).scalar_one_or_none()
                                if dataset is not None:
                                    dataset.status = "failed"
                        jobs_total.inc(job_type=job.job_type, status=job.status)
                        await db.commit()
            else:
                job_duration_seconds.observe(
                    time.perf_counter() - started, job_type=claim["job_type"]
                )
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(run_worker())
