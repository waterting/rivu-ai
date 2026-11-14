"""Endpoints for Custom E-Commerce Solutions and Internal Sales CRM."""

from datetime import datetime, timezone
from typing import Optional, List
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_session
from app.core.security import get_current_user
from app.models.user import User
from app.models.custom_solutions import CustomSolutionProject, ProjectMilestone, Lead

router = APIRouter()


class CustomProjectCreateRequest(BaseModel):
    name: str
    client_contact_name: Optional[str] = None
    client_contact_email: Optional[str] = None
    sku_volume_estimate: int = 5000
    data_sources: List[str] = []
    target_platforms: List[str] = []
    one_time_implementation_fee_inr: int = 50000
    monthly_subscription_fee_inr: int = 14999
    timeline_weeks: int = 4
    deliverables: List[str] = []


class LeadCreateRequest(BaseModel):
    company_name: str
    contact_person: str
    email: str
    phone: Optional[str] = None
    business_type: str = "distributor"
    sku_volume_estimate: int = 1000
    selling_channels: List[str] = []
    source_channel: Optional[str] = None
    problem_description: Optional[str] = None
    pipeline_stage: str = "lead_identified"
    estimated_contract_value_inr: int = 0
    interest_level: str = "medium"
    owner: Optional[str] = None
    notes: Optional[str] = None


@router.get("/custom-solutions/projects", response_model=list[dict])
async def list_custom_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """List custom enterprise projects for the current workspace."""
    org_id = current_user.active_org_id
    stmt = select(CustomSolutionProject).where(CustomSolutionProject.organization_id == org_id).order_by(CustomSolutionProject.created_at.desc())
    res = await db.execute(stmt)
    projects = res.scalars().all()
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "sku_volume_estimate": p.sku_volume_estimate,
            "data_sources": p.data_sources,
            "target_platforms": p.target_platforms,
            "one_time_implementation_fee_inr": p.one_time_implementation_fee_inr,
            "monthly_subscription_fee_inr": p.monthly_subscription_fee_inr,
            "status": p.status,
            "timeline_weeks": p.timeline_weeks,
            "created_at": p.created_at.isoformat(),
        }
        for p in projects
    ]


@router.post("/custom-solutions/projects", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_custom_project(
    body: CustomProjectCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """Create a scoped custom solution project with milestone roadmap."""
    org_id = current_user.active_org_id
    project = CustomSolutionProject(
        organization_id=org_id,
        name=body.name,
        client_contact_name=body.client_contact_name or current_user.full_name,
        client_contact_email=body.client_contact_email or current_user.email,
        sku_volume_estimate=body.sku_volume_estimate,
        data_sources=body.data_sources,
        target_platforms=body.target_platforms,
        one_time_implementation_fee_inr=body.one_time_implementation_fee_inr,
        monthly_subscription_fee_inr=body.monthly_subscription_fee_inr,
        status="scope_definition",
        deliverables=body.deliverables or ["Data Mapping Specification", "Automated Validation Rules", "Channel Sync Adapter"],
        timeline_weeks=body.timeline_weeks,
    )
    db.add(project)
    await db.flush()

    # Seed standard milestones
    m1 = ProjectMilestone(project_id=project.id, title="Requirement Discovery & Data Audit", status="completed", completed_at=datetime.now(timezone.utc))
    m2 = ProjectMilestone(project_id=project.id, title="Custom Schema & Mapping Configuration", status="in_progress")
    m3 = ProjectMilestone(project_id=project.id, title="Catalogue Integration & UAT", status="pending")
    m4 = ProjectMilestone(project_id=project.id, title="Production Handover & Channel Sync", status="pending")
    db.add_all([m1, m2, m3, m4])
    await db.commit()

    return {
        "id": str(project.id),
        "name": project.name,
        "status": project.status,
        "milestones_count": 4,
        "message": "Custom solution project initialized successfully."
    }


# ──────────────────────────────────────────────
# INTERNAL SALES CRM & LEAD PIPELINE
# ──────────────────────────────────────────────

@router.get("/crm/leads", response_model=list[dict])
async def list_leads(
    stage: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """Internal Sales CRM: List leads and pipeline opportunities."""
    stmt = select(Lead).order_by(Lead.created_at.desc())
    if stage:
        stmt = stmt.where(Lead.pipeline_stage == stage)
    res = await db.execute(stmt)
    leads = res.scalars().all()
    return [
        {
            "id": str(l.id),
            "company_name": l.company_name,
            "contact_person": l.contact_person,
            "email": l.email,
            "phone": l.phone,
            "business_type": l.business_type,
            "sku_volume_estimate": l.sku_volume_estimate,
            "pipeline_stage": l.pipeline_stage,
            "estimated_contract_value_inr": l.estimated_contract_value_inr,
            "interest_level": l.interest_level,
            "notes": l.notes,
            "created_at": l.created_at.isoformat(),
        }
        for l in leads
    ]


@router.post("/crm/leads", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_lead(
    body: LeadCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session)
):
    """Add a lead or prospective client to the internal CRM pipeline."""
    lead = Lead(
        company_name=body.company_name,
        contact_person=body.contact_person,
        email=body.email,
        phone=body.phone,
        business_type=body.business_type,
        sku_volume_estimate=body.sku_volume_estimate,
        selling_channels=body.selling_channels,
        source_channel=body.source_channel,
        problem_description=body.problem_description,
        pipeline_stage=body.pipeline_stage,
        estimated_contract_value_inr=body.estimated_contract_value_inr,
        interest_level=body.interest_level,
        owner=body.owner or current_user.username,
        notes=body.notes,
    )
    db.add(lead)
    await db.commit()
    return {"id": str(lead.id), "company_name": lead.company_name, "stage": lead.pipeline_stage}

