"""Internal admin surface.

Rivu's brief asks for a super-admin area to manage organizations, users,
datasets, jobs and integrations. This implementation is deliberately scoped to
what the schema can honestly answer: it is available to organization owners and
admins, reads real tables, and never fabricates counts. It does not claim to be
a cross-tenant platform console because the data model has no platform-level
super-admin role.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user, require_org_role
from app.models.dataset import DataSource
from app.models.organization import Membership, Organization
from app.models.quality import Job
from app.models.tool_execution import ToolExecution
from app.models.user import User

router = APIRouter()


async def _admin_context(user: User, db: AsyncSession) -> tuple[uuid.UUID, Membership]:
    """Owner/admin only. Returns the selected org and the caller's membership."""
    membership = await require_org_role(user, db, {"owner", "admin"})
    return membership.organization_id, membership


@router.get("/summary")
async def admin_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Measured counts for the admin dashboard."""
    org_id, membership = await _admin_context(current_user, db)

    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one()

    user_count = (
        await db.execute(select(func.count()).select_from(Membership).where(Membership.organization_id == org_id))
    ).scalar_one()
    dataset_count = (
        await db.execute(select(func.count()).select_from(DataSource).where(DataSource.organization_id == org_id))
    ).scalar_one()
    failed_datasets = (
        await db.execute(
            select(func.count()).select_from(DataSource).where(
                DataSource.organization_id == org_id, DataSource.status == "failed"
            )
        )
    ).scalar_one()
    job_count = (
        await db.execute(
            select(func.count()).select_from(Job).join(
                DataSource, DataSource.id == Job.data_source_id
            ).where(DataSource.organization_id == org_id)
        )
    ).scalar_one()
    failed_jobs = (
        await db.execute(
            select(func.count()).select_from(Job).join(
                DataSource, DataSource.id == Job.data_source_id
            ).where(DataSource.organization_id == org_id, Job.status == "failed")
        )
    ).scalar_one()
    tool_runs = (
        await db.execute(
            select(func.count()).select_from(ToolExecution).where(ToolExecution.organization_id == org_id)
        )
    ).scalar_one()

    return {
        "organization": {
            "id": str(org.id),
            "name": org.name,
            "slug": org.slug,
            "status": org.status,
        },
        "viewer_role": membership.role,
        "counts": {
            "users": int(user_count),
            "datasets": int(dataset_count),
            "failed_datasets": int(failed_datasets),
            "jobs": int(job_count),
            "failed_jobs": int(failed_jobs),
            "tool_runs": int(tool_runs),
        },
    }


@router.get("/users")
async def admin_users(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Members of the current organization with their roles."""
    org_id, _ = await _admin_context(current_user, db)
    rows = (
        await db.execute(
            select(Membership, User)
            .join(User, User.id == Membership.user_id)
            .where(Membership.organization_id == org_id)
            .order_by(Membership.created_at.desc())
        )
    ).all()

    return {
        "users": [
            {
                "user_id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "status": user.status,
                "role": membership.role,
                "is_active": membership.is_active,
                "joined_at": membership.created_at.isoformat() if membership.created_at else None,
                "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
            }
            for membership, user in rows
        ],
        "count": len(rows),
    }


@router.get("/datasets")
async def admin_datasets(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
    limit: int = 100,
):
    """Dataset overview for the organization."""
    org_id, _ = await _admin_context(current_user, db)
    rows = (
        await db.execute(
            select(DataSource)
            .where(DataSource.organization_id == org_id)
            .order_by(DataSource.updated_at.desc())
            .limit(max(1, min(limit, 500)))
        )
    ).scalars().all()

    return {
        "datasets": [
            {
                "id": str(d.id),
                "name": d.name,
                "status": d.status,
                "file_format": d.file_format,
                "current_version": d.current_version,
                "created_at": d.created_at.isoformat() if d.created_at else None,
                "updated_at": d.updated_at.isoformat() if d.updated_at else None,
            }
            for d in rows
        ],
        "count": len(rows),
    }


@router.get("/jobs")
async def admin_jobs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
    limit: int = 100,
):
    """Recent processing jobs across the organization."""
    org_id, _ = await _admin_context(current_user, db)
    rows = (
        await db.execute(
            select(Job)
            .join(DataSource, DataSource.id == Job.data_source_id)
            .where(DataSource.organization_id == org_id)
            .order_by(Job.queued_at.desc())
            .limit(max(1, min(limit, 500)))
        )
    ).scalars().all()

    return {
        "jobs": [
            {
                "id": str(j.id),
                "dataset_id": str(j.data_source_id),
                "type": j.job_type,
                "status": j.status,
                "error": j.error_message,
                "queued_at": j.queued_at.isoformat() if j.queued_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
            }
            for j in rows
        ],
        "count": len(rows),
    }