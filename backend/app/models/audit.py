"""ORM mapping for the existing ``audit_logs`` table.

The table and its ``audit_action`` enum were declared in the initial schema but
nothing ever wrote to them. This maps it so sensitive access — presigned
download URLs in particular — leaves a durable trail.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Mirrors the audit_action enum in schema.sql / the initial migration.
AUDIT_ACTIONS = (
    "create",
    "read",
    "update",
    "delete",
    "upload",
    "download",
    "export",
    "transform",
    "approve",
    "reject",
    "login",
    "logout",
    "signup",
)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[str] = mapped_column(
        SAEnum(*AUDIT_ACTIONS, name="audit_action", create_constraint=False),
        nullable=False,
    )
    resource_type: Mapped[str | None] = mapped_column(String(100))
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    ip_address: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<AuditLog {self.action} {self.resource_type}={self.resource_id}>"