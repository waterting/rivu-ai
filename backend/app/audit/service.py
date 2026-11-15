"""Audit trail recording.

Records are best-effort by design: a failed audit write must not turn a
successful data operation into an error the user cannot retry. Failures are
logged loudly so the gap is visible instead of silently dropping the trail.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import structlog

from app.models.audit import AuditLog

logger = structlog.get_logger(__name__)

# ``audit_logs.action`` is an enum; the specific verb and outcome live in
# ``details`` so the enum does not have to grow per surface.
DOWNLOAD_URL_ISSUED = "download"
DOWNLOAD_URL_DENIED = "download"


def _as_uuid(value: Any) -> UUID | str | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        # A non-UUID resource id cannot go in a UUID column; keep the audit row
        # and drop the id rather than losing the event.
        return None


def _as_inet(value: str | None) -> str | None:
    if not value:
        return None
    candidate = value.strip()
    # INET will reject a hostname or a malformed literal; store None instead.
    if candidate.count(".") == 3 and all(part.isdigit() for part in candidate.split(".")):
        return candidate
    if candidate.count(":") >= 2:
        return candidate
    return None


async def record_event(
    db,
    *,
    action: str,
    resource_type: str | None = None,
    resource_id: Any | None = None,
    organization_id: Any | None = None,
    actor_id: Any | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    commit: bool = True,
) -> AuditLog | None:
    """Append an audit row, returning None when the write could not be made."""
    event = AuditLog(
        action=action,
        resource_type=(resource_type or None),
        resource_id=_as_uuid(resource_id),
        organization_id=_as_uuid(organization_id),
        user_id=_as_uuid(actor_id),
        details=details or {},
        ip_address=_as_inet(ip_address),
        user_agent=(user_agent or "")[:500] or None,
    )
    try:
        db.add(event)
        if commit:
            await db.commit()
        else:
            await db.flush()
    except Exception:
        logger.exception(
            "audit_event_write_failed",
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
        )
        return None
    return event


def client_ip(request) -> str | None:
    """Best-effort client address, honouring a single proxy hop."""
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    client = getattr(request, "client", None)
    return getattr(client, "host", None)


def client_user_agent(request) -> str | None:
    if request is None:
        return None
    return request.headers.get("user-agent")