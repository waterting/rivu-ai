"""Real processing status for a dataset version.

The profile and quality endpoints each answer "not ready yet" with a 202 and
nothing else. That is enough to render a spinner but not enough to tell a user
what is happening, and it cannot express a terminal failure at all: a job that
failed, or a queue with no worker listening, looks exactly like a slow job.

This module answers the question the UI actually needs — what stage is this at,
is anyone working on it, and if it is stuck, why — from the job row and the
worker heartbeat rather than from the absence of a profile.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.dataset import DataSource, DatasetVersion
from app.models.profile import DataProfile
from app.models.quality import Job, QualityReport
from app.models.worker import WorkerHeartbeat

# Terminal states: nothing will change without a new attempt.
TERMINAL = {"completed", "failed", "cancelled"}

# Reported while the job row says queued but nobody has claimed it.
STAGE_BY_PROGRESS = (
    (5, "parsing"),
    (20, "profiling"),
    (60, "quality"),
    (100, "complete"),
)


def _stage_for(progress_pct: int | None) -> str:
    value = progress_pct or 0
    stage = "queued"
    for threshold, name in STAGE_BY_PROGRESS:
        if value >= threshold:
            stage = name
    return stage


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


@dataclass
class WorkerLiveness:
    online: bool
    worker_id: str | None = None
    hostname: str | None = None
    last_seen_at: str | None = None
    age_seconds: int | None = None


async def worker_liveness(db: AsyncSession, now: datetime | None = None) -> WorkerLiveness:
    """Newest heartbeat across all workers, judged against the stale window."""
    now = now or datetime.now(timezone.utc)
    row = (
        await db.execute(select(WorkerHeartbeat).order_by(WorkerHeartbeat.last_seen_at.desc()).limit(1))
    ).scalar_one_or_none()
    if row is None or row.last_seen_at is None:
        return WorkerLiveness(online=False)

    last_seen = row.last_seen_at
    if last_seen.tzinfo is None:  # sqlite returns naive datetimes
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    age = int((now - last_seen).total_seconds())
    return WorkerLiveness(
        online=age <= settings.WORKER_HEARTBEAT_STALE_SECONDS,
        worker_id=row.worker_id,
        hostname=row.hostname,
        last_seen_at=last_seen.isoformat(),
        age_seconds=age,
    )


async def latest_job_for_version(db: AsyncSession, version_id) -> Job | None:
    """Newest job for a version, falling back to the dataset's newest job.

    Transformations create additional versions, so a version that has never had
    its own job still needs to reflect the run that produced it.
    """
    result = await db.execute(
        select(Job)
        .where(Job.dataset_version_id == version_id)
        .order_by(Job.queued_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def processing_status(db: AsyncSession, dataset_id, version_id) -> dict:
    """Build the status payload the UI polls."""
    now = datetime.now(timezone.utc)

    version = (
        await db.execute(select(DatasetVersion).where(DatasetVersion.id == version_id))
    ).scalar_one_or_none()
    dataset = (
        await db.execute(select(DataSource).where(DataSource.id == dataset_id))
    ).scalar_one_or_none()
    if version is None or dataset is None:
        return {
            "state": "unknown",
            "stage": "unknown",
            "message": "This dataset or dataset version no longer exists.",
            "terminal": True,
            "can_retry": False,
        }

    profile_ready = (
        await db.execute(select(DataProfile.id).where(DataProfile.dataset_version_id == version_id).limit(1))
    ).scalar_one_or_none() is not None
    quality_ready = (
        await db.execute(select(QualityReport.id).where(QualityReport.dataset_version_id == version_id).limit(1))
    ).scalar_one_or_none() is not None

    job = await latest_job_for_version(db, version_id)
    if job is None:
        job = (
            await db.execute(select(Job).where(Job.data_source_id == dataset_id).order_by(Job.queued_at.desc()).limit(1))
        ).scalar_one_or_none()

    liveness = await worker_liveness(db, now)

    base = {
        "dataset_id": str(dataset_id),
        "version_id": str(version_id),
        "dataset_status": dataset.status,
        "profile_ready": profile_ready,
        "quality_ready": quality_ready,
        "worker": {
            "online": liveness.online,
            "worker_id": liveness.worker_id,
            "hostname": liveness.hostname,
            "last_seen_at": liveness.last_seen_at,
            "age_seconds": liveness.age_seconds,
        },
        "checked_at": now.isoformat(),
    }

    # No job at all: nothing was ever queued for this version.
    if job is None:
        if profile_ready and quality_ready:
            return {**base, "state": "completed", "stage": "complete", "message": "Processing complete.", "terminal": True, "can_retry": False}
        return {
            **base,
            "state": "unknown",
            "stage": "unknown",
            "message": "No processing job exists for this dataset. Re-upload it to start profiling.",
            "terminal": True,
            "can_retry": False,
        }

    attempts = job.attempts or 0
    max_attempts = job.max_attempts or 1
    can_retry = attempts < max_attempts

    common = {
        **base,
        "job_id": str(job.id),
        "job_type": job.job_type,
        "attempts": attempts,
        "max_attempts": max_attempts,
        "progress_pct": job.progress_pct or 0,
        "stage": _stage_for(job.progress_pct),
        "message": job.progress_message,
        "error": job.error_message,
        "queued_at": _iso(job.queued_at),
        "started_at": _iso(job.started_at),
        "completed_at": _iso(job.completed_at),
        "can_retry": can_retry,
    }

    if job.status == "completed":
        return {**common, "state": "completed", "stage": "complete", "terminal": True, "can_retry": False,
                "message": job.progress_message or "Processing complete."}

    if job.status == "failed":
        return {
            **common,
            "state": "failed",
            "terminal": True,
            "message": "Processing failed and will not be retried automatically.",
            "can_retry": can_retry,
            "error": job.error_message or "The processing job failed without recording a reason.",
        }

    if job.status == "cancelled":
        return {**common, "state": "failed", "terminal": True,
                "message": "This processing job was cancelled.",
                "can_retry": can_retry}

    # Queued but nobody is consuming the queue: say so instead of spinning.
    if job.status == "queued" and not liveness.online:
        return {
            **common,
            "state": "stalled",
            "terminal": False,
            "message": "No processing worker is available to pick up this job, so it cannot start.",
            "can_retry": can_retry,
            "reason": "no_worker",
        }

    if job.status == "processing":
        # A job whose lease has expired without a live worker is not progressing.
        if not liveness.online and job.started_at is not None:
            started = job.started_at
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            if (now - started) > timedelta(seconds=settings.WORKER_HEARTBEAT_STALE_SECONDS):
                return {
                    **common,
                    "state": "stalled",
                    "terminal": False,
                    "message": "The worker that started this job is no longer responding.",
                    "can_retry": can_retry,
                    "reason": "worker_lost",
                }
        return {
            **common,
            "state": "processing",
            "terminal": False,
            "message": job.progress_message or "Processing this dataset.",
            "can_retry": False,
        }

    # queued with a live worker
    return {
        **common,
        "state": "queued",
        "terminal": False,
        "message": job.progress_message or "Waiting for an available worker.",
        "can_retry": False,
    }