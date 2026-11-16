"""Worker liveness tracking.

The durable queue only makes progress if a worker process is actually running.
When none is, queued jobs sit untouched and every upload appears to hang on
"processing" forever. This table lets the API tell the difference between
"queued, worker on it" and "queued, nobody is consuming the queue", which is
what turns an unexplained spinner into an actionable message.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WorkerHeartbeat(Base):
    __tablename__ = "worker_heartbeats"

    # One row per worker instance, keyed by a stable id the worker generates on
    # startup, so a restart is visible as a fresh row rather than an update.
    worker_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Jobs this worker has claimed since it started; a nonzero climb proves the
    # loop is not merely alive but actually consuming the queue.
    jobs_claimed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    def __repr__(self) -> str:
        return f"<WorkerHeartbeat {self.worker_id} last_seen={self.last_seen_at}>"


# Kept as a plain UUID alias so callers that need the id type do not have to
# import the dialect themselves.
WORKER_ID_TYPE = UUID