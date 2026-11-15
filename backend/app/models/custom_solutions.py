"""SQLAlchemy Models for Custom E-Commerce Solutions and Internal Sales CRM."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Float, Boolean, DateTime, ForeignKey, Enum as SAEnum, func, JSON, Numeric, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CustomSolutionProject(Base):
    """Custom implementation and integration projects for enterprise/high-touch clients."""
    __tablename__ = "custom_solution_projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    client_contact_name: Mapped[str | None] = mapped_column(String(150))
    client_contact_email: Mapped[str | None] = mapped_column(String(320))
    
    sku_volume_estimate: Mapped[int] = mapped_column(Integer, default=5000)
    data_sources: Mapped[list] = mapped_column(JSONB, default=list) # e.g. ["Supplier SAP", "IndiaMART CSV"]
    target_platforms: Mapped[list] = mapped_column(JSONB, default=list) # e.g. ["Shopify Plus", "Custom ERP"]
    
    # Financial scope
    one_time_implementation_fee_inr: Mapped[int] = mapped_column(Integer, default=50000)
    monthly_subscription_fee_inr: Mapped[int] = mapped_column(Integer, default=14999)
    
    status: Mapped[str] = mapped_column(
        String(50), default="inquiry", index=True
    ) # inquiry, requirement_discovery, data_audit, scope_definition, proposal_sent, approved, in_progress, uat, completed
    
    deliverables: Mapped[list] = mapped_column(JSONB, default=list)
    timeline_weeks: Mapped[int] = mapped_column(Integer, default=4)
    assigned_lead_engineer: Mapped[str | None] = mapped_column(String(150))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now(), onupdate=func.now())

    milestones: Mapped[list["ProjectMilestone"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class ProjectMilestone(Base):
    __tablename__ = "project_milestones"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("custom_solution_projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="pending") # pending, in_progress, completed, verified
    target_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())

    project: Mapped["CustomSolutionProject"] = relationship(back_populates="milestones")


class Lead(Base):
    """Sales CRM lead pipeline, scoped to the owning organization (tenant-isolated)."""
    __tablename__ = "leads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    contact_person: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(50))
    business_type: Mapped[str] = mapped_column(String(100), default="distributor") # indiamart_seller, manufacturer, distributor, d2c, agency
    
    sku_volume_estimate: Mapped[int] = mapped_column(Integer, default=1000)
    selling_channels: Mapped[list] = mapped_column(JSONB, default=list) # e.g. ["Amazon", "Shopify", "IndiaMART"]
    source_channel: Mapped[str | None] = mapped_column(String(100)) # e.g. "LinkedIn Outbound", "Inbound Demo"
    problem_description: Mapped[str | None] = mapped_column(Text)
    
    pipeline_stage: Mapped[str] = mapped_column(
        String(50), default="lead_identified", index=True
    ) # lead_identified, discovery, catalogue_audit, demo, pilot_discussion, proposal, negotiation, won, lost
    
    estimated_contract_value_inr: Mapped[int] = mapped_column(Integer, default=0) # Only when proposal/quote generated
    interest_level: Mapped[str] = mapped_column(String(50), default="medium") # high, medium, low
    next_follow_up: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    owner: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    lost_reason: Mapped[str | None] = mapped_column(String(255))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now(), onupdate=func.now())
