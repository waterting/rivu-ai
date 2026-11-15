"""Dataset intelligence endpoints: profile, quality, jobs and AI plans."""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import get_current_user, require_org_context
from app.models.user import User
from app.models.organization import Membership
from app.models.dataset import DataSource, DatasetVersion
from app.models.profile import DataProfile, ColumnProfile
from app.models.quality import QualityReport, QualityIssue, Job
from app.profiler.quality import quality_methodology
from app.models.transformation import TransformationPlan
from app.ai.factory import get_ai_provider
from app.core.config import settings
from app.ai.planner import generate_transformation_plan
from app.ai.bi import ColumnFacts, analyse_business_data
from app.core.storage import get_storage
from app.ingestion.parser import parse_to_polars
import polars as pl

router = APIRouter()
logger = structlog.get_logger(__name__)

async def org_id_for(user: User, db: AsyncSession) -> UUID:
    """Resolve the caller's explicitly selected organization (audit finding 4)."""
    return await require_org_context(user, db)

async def dataset_for(dataset_id: UUID, user: User, db: AsyncSession):
    org = await org_id_for(user, db)
    result = await db.execute(select(DataSource).where(
        DataSource.id == dataset_id, DataSource.organization_id == org
    ))
    ds = result.scalar_one_or_none()
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return ds, org

@router.get("/{dataset_id}/profile")
async def profile(dataset_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_session)):
    ds, org = await dataset_for(dataset_id, current_user, db)
    version = (await db.execute(select(DatasetVersion).where(
        DatasetVersion.data_source_id == ds.id,
        DatasetVersion.version_number == ds.current_version
    ))).scalar_one_or_none()
    if not version:
        raise HTTPException(404, "Dataset version not found")
    p = (await db.execute(select(DataProfile).where(DataProfile.dataset_version_id == version.id))).scalar_one_or_none()
    if not p:
        raise HTTPException(202, "Dataset is still processing")
    cols = (await db.execute(select(ColumnProfile).where(ColumnProfile.data_profile_id == p.id).order_by(ColumnProfile.column_index))).scalars().all()
    return {
        "dataset": {"id": str(ds.id), "name": ds.name, "status": ds.status},
        "version": {"id": str(version.id), "number": version.version_number, "quality_score": float(version.quality_score) if version.quality_score is not None else None},
        "profile": {
            "id": str(p.id), "row_count": p.row_count, "column_count": p.column_count,
            "duplicate_row_count": p.duplicate_row_count, "duplicate_row_pct": float(p.duplicate_row_pct or 0),
            "total_null_count": p.total_null_count, "total_null_pct": float(p.total_null_pct or 0),
            "sample_rows": p.sample_rows or [],
        },
        "columns": [{
            "name": c.column_name, "type": c.inferred_type, "semantic_type": c.semantic_type,
            "null_count": c.null_count, "null_pct": float(c.null_pct or 0),
            "unique_count": c.unique_count, "uniqueness_pct": float(c.uniqueness_pct or 0),
            "sample_values": c.sample_values or [],
        } for c in cols],
    }

@router.get("/{dataset_id}/quality")
async def quality(dataset_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_session)):
    ds, _ = await dataset_for(dataset_id, current_user, db)
    version = (await db.execute(select(DatasetVersion).where(
        DatasetVersion.data_source_id == ds.id, DatasetVersion.version_number == ds.current_version
    ))).scalar_one_or_none()
    if not version:
        raise HTTPException(404, "Dataset version not found")
    report = (await db.execute(select(QualityReport).where(QualityReport.dataset_version_id == version.id))).scalar_one_or_none()
    if not report:
        raise HTTPException(202, "Quality report is still processing")
    issues = (await db.execute(select(QualityIssue).where(QualityIssue.quality_report_id == report.id).order_by(QualityIssue.severity, QualityIssue.created_at))).scalars().all()
    raw_scores = {
        "completeness": report.completeness_score,
        "validity": report.validity_score,
        "consistency": report.consistency_score,
        "uniqueness": report.uniqueness_score,
        "integrity": report.integrity_score,
    }
    scores = {
        key: (float(value) if value is not None else None)
        for key, value in raw_scores.items()
    }
    return {
        "id": str(report.id), "overall_score": float(report.overall_score),
        "scores": scores,
        "unavailable_dimensions": [key for key, value in scores.items() if value is None],
        "methodology": quality_methodology(),
        "evaluated_records": version.row_count,
        "counts": {"total": report.total_issues, "critical": report.critical_issues, "high": report.high_issues, "medium": report.medium_issues, "low": report.low_issues},
        "issues": [{
            "id": str(i.id), "issue_id": i.issue_id, "type": i.issue_type, "category": i.category,
            "severity": i.severity, "title": i.title,
            "description": i.description, "column": i.affected_column,
            "rows": i.affected_row_count, "pct": float(i.affected_row_pct or 0),
            "evidence": i.evidence or {}, "suggested_fix": i.suggested_fix,
            "auto_fixable": i.auto_fixable, "status": i.status,
        } for i in issues],
    }

ISSUE_STATUSES = {"open", "in_review", "resolved", "ignored", "accepted"}
_CLOSED_STATUSES = {"resolved", "ignored", "accepted"}


@router.get("/{dataset_id}/issues")
async def list_issues(
    dataset_id: UUID,
    status: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """List quality issues for the current version with their resolution state."""
    ds, _ = await dataset_for(dataset_id, current_user, db)
    version = (await db.execute(select(DatasetVersion).where(
        DatasetVersion.data_source_id == ds.id, DatasetVersion.version_number == ds.current_version
    ))).scalar_one_or_none()
    if not version:
        raise HTTPException(404, "Dataset version not found")

    stmt = select(QualityIssue).where(
        QualityIssue.dataset_version_id == version.id,
        QualityIssue.organization_id == ds.organization_id,
    )
    if status:
        if status not in ISSUE_STATUSES:
            raise HTTPException(400, f"Unknown status '{status}'")
        stmt = stmt.where(QualityIssue.status == status)
    rows = (await db.execute(stmt.order_by(QualityIssue.severity, QualityIssue.created_at))).scalars().all()

    counts = {value: 0 for value in ISSUE_STATUSES}
    for row in rows:
        counts[row.status] = counts.get(row.status, 0) + 1

    return {
        "dataset_version_id": str(version.id),
        "counts": counts,
        "active_count": sum(count for state, count in counts.items() if state == "open"),
        "issues": [{
            "id": str(row.id),
            "issue_id": row.issue_id,
            "type": row.issue_type,
            "category": row.category,
            "severity": row.severity,
            "title": row.title,
            "description": row.description,
            "column": row.affected_column,
            "rows": row.affected_row_count,
            "pct": float(row.affected_row_pct or 0),
            "evidence": row.evidence or {},
            "suggested_fix": row.suggested_fix,
            "auto_fixable": row.auto_fixable,
            "status": row.status,
            "resolution_note": row.resolution_note,
            "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
        } for row in rows],
    }


@router.patch("/{dataset_id}/issues/{issue_pk}")
async def update_issue_status(
    dataset_id: UUID,
    issue_pk: UUID,
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Record what the team decided about a quality issue.

    Resolving an issue records a decision; it does not rewrite the underlying
    file, so the measured score stays as analysed until the data is transformed
    and analysed again.
    """
    from datetime import datetime, timezone

    ds, _ = await dataset_for(dataset_id, current_user, db)
    new_status = (payload or {}).get("status")
    if new_status not in ISSUE_STATUSES:
        raise HTTPException(400, f"status must be one of {sorted(ISSUE_STATUSES)}")

    issue = (await db.execute(select(QualityIssue).where(
        QualityIssue.id == issue_pk,
        QualityIssue.organization_id == ds.organization_id,
    ))).scalar_one_or_none()
    if not issue:
        raise HTTPException(404, "Issue not found")

    issue.status = new_status
    issue.resolution_note = (payload or {}).get("note")
    issue.resolved_at = datetime.now(timezone.utc) if new_status in _CLOSED_STATUSES else None
    await db.commit()

    active = (await db.execute(select(QualityIssue).where(
        QualityIssue.dataset_version_id == issue.dataset_version_id,
        QualityIssue.organization_id == ds.organization_id,
        QualityIssue.status == "open",
    ))).scalars().all()

    return {
        "issue": {
            "id": str(issue.id),
            "issue_id": issue.issue_id,
            "status": issue.status,
            "resolution_note": issue.resolution_note,
            "resolved_at": issue.resolved_at.isoformat() if issue.resolved_at else None,
        },
        "active_count": len(active),
    }


@router.get("/{dataset_id}/jobs")
async def jobs(dataset_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_session)):
    ds, _ = await dataset_for(dataset_id, current_user, db)
    rows = (await db.execute(select(Job).where(Job.data_source_id == ds.id).order_by(Job.queued_at.desc()))).scalars().all()
    return {"jobs": [{
        "id": str(j.id), "type": j.job_type, "status": j.status, "progress": j.progress_pct or 0,
        "message": j.progress_message, "error": j.error_message,
        "result": j.result, "queued_at": j.queued_at.isoformat() if j.queued_at else None,
        "completed_at": j.completed_at.isoformat() if j.completed_at else None,
    } for j in rows]}

@router.get("/{dataset_id}/column-roles")
async def get_column_roles(
    dataset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Show what each column means to the business and why.

    Roles come from deterministic detection over the stored profile. Any role the
    user has overridden is flagged, so the UI can show which mapping is a human
    decision rather than a guess.
    """
    ds, _ = await dataset_for(dataset_id, current_user, db)
    version = (await db.execute(select(DatasetVersion).where(
        DatasetVersion.data_source_id == ds.id,
        DatasetVersion.version_number == ds.current_version,
    ))).scalar_one_or_none()
    if not version:
        raise HTTPException(404, "Dataset version not found")

    profile = (await db.execute(
        select(DataProfile).where(DataProfile.dataset_version_id == version.id)
    )).scalar_one_or_none()
    if not profile:
        raise HTTPException(202, detail={"message": "Dataset is still being profiled."})

    column_rows = (await db.execute(
        select(ColumnProfile)
        .where(ColumnProfile.data_profile_id == profile.id)
        .order_by(ColumnProfile.column_index)
    )).scalars().all()

    from app.profiler.roles import ROLE_ALIASES, resolve_roles, role_summary

    records = [
        {
            "column_name": column.column_name,
            "semantic_type": column.semantic_type or column.inferred_type or "string",
            "sample_values": column.sample_values or [],
        }
        for column in column_rows
    ]
    resolved = resolve_roles(records, overrides=ds.column_role_overrides or {})

    return {
        "dataset_id": str(ds.id),
        "version": version.version_number,
        "columns": resolved,
        "summary": role_summary(resolved),
        "available_roles": sorted(ROLE_ALIASES.keys()),
        "overrides": ds.column_role_overrides or {},
    }


@router.put("/{dataset_id}/column-roles")
async def update_column_roles(
    dataset_id: UUID,
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Correct a column's business role without re-uploading the dataset.

    Unknown columns and unknown roles are rejected instead of silently ignored, so
    a typo cannot quietly break every metric that depends on the mapping.
    """
    ds, _ = await dataset_for(dataset_id, current_user, db)
    await require_org_role(current_user, db, {"owner", "admin", "editor"})

    from app.profiler.roles import ROLE_ALIASES

    overrides = (payload or {}).get("overrides") or {}
    if not isinstance(overrides, dict):
        raise HTTPException(400, "overrides must be an object of role -> column name")

    version = (await db.execute(select(DatasetVersion).where(
        DatasetVersion.data_source_id == ds.id,
        DatasetVersion.version_number == ds.current_version,
    ))).scalar_one_or_none()
    if not version:
        raise HTTPException(404, "Dataset version not found")

    profile = (await db.execute(
        select(DataProfile).where(DataProfile.dataset_version_id == version.id)
    )).scalar_one_or_none()
    if not profile:
        raise HTTPException(202, detail={"message": "Dataset is still being profiled."})

    known_columns = {
        row[0]
        for row in (await db.execute(
            select(ColumnProfile.column_name).where(ColumnProfile.data_profile_id == profile.id)
        )).all()
    }
    valid_roles = set(ROLE_ALIASES.keys())

    for role, column in overrides.items():
        if role not in valid_roles:
            raise HTTPException(400, f"Unknown role '{role}'. Valid roles: {sorted(valid_roles)}")
        if column in (None, "", "none", "other"):
            continue
        if column not in known_columns:
            raise HTTPException(400, f"Column '{column}' does not exist in this dataset")

    ds.column_role_overrides = overrides
    await db.commit()

    return {
        "dataset_id": str(ds.id),
        "version": version.version_number,
        "overrides": overrides,
        "message": "Column roles updated. Business metrics will use this mapping immediately.",
    }


@router.get("/{dataset_id}/bi")
async def business_intelligence(
    dataset_id: UUID,
    max_rows: int = Query(200_000, ge=1_000, le=2_000_000),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Evidence-based business metrics computed from the current dataset version.

    Every metric is derived from rows in the stored file: no AI, no external data,
    no estimates. Columns that are not present are reported as unavailable with the
    reason, so the UI can never present a fabricated number.
    """
    ds, _ = await dataset_for(dataset_id, current_user, db)
    version = (await db.execute(select(DatasetVersion).where(
        DatasetVersion.data_source_id == ds.id,
        DatasetVersion.version_number == ds.current_version,
    ))).scalar_one_or_none()
    if not version:
        raise HTTPException(404, "Dataset version not found")

    profile = (await db.execute(
        select(DataProfile).where(DataProfile.dataset_version_id == version.id)
    )).scalar_one_or_none()
    if not profile:
        raise HTTPException(202, detail={"message": "Dataset is still being profiled."})

    column_rows = (await db.execute(
        select(ColumnProfile)
        .where(ColumnProfile.data_profile_id == profile.id)
        .order_by(ColumnProfile.column_index)
    )).scalars().all()

    column_facts = [
        ColumnFacts(
            name=c.column_name,
            semantic_type=c.semantic_type or c.inferred_type or "unknown",
            dtype=str(c.inferred_type or ""),
        )
        for c in column_rows
    ]

    try:
        raw = await get_storage().download_file(version.storage_key)
        frame, _ = parse_to_polars(raw, version.file_format, ds.original_filename)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Dataset could not be loaded for analysis.",
                "type": "bi_error",
                "cause": str(exc)[:300],
            },
        )

    rows_total = frame.height
    truncated = rows_total > max_rows
    if truncated:
        frame = frame.head(max_rows)

    analysis = analyse_business_data(
        frame,
        column_facts,
        overrides=ds.column_role_overrides or {},
    )
    analysis.update({
        "dataset_id": str(ds.id),
        "dataset_name": ds.name,
        "version": version.version_number,
        "rows_scanned": frame.height,
        "rows_total": rows_total,
        "truncated": truncated,
    })
    return analysis


@router.post("/{dataset_id}/ai-plan")
async def ai_plan(dataset_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_session)):
    ds, org = await dataset_for(dataset_id, current_user, db)
    version = (await db.execute(select(DatasetVersion).where(
        DatasetVersion.data_source_id == ds.id, DatasetVersion.version_number == ds.current_version
    ))).scalar_one_or_none()
    if not version:
        raise HTTPException(404, "Dataset version not found")
    p = (await db.execute(select(DataProfile).where(DataProfile.dataset_version_id == version.id))).scalar_one_or_none()
    q = (await db.execute(select(QualityReport).where(QualityReport.dataset_version_id == version.id))).scalar_one_or_none()
    if not p or not q:
        raise HTTPException(409, "Profile and quality report must finish first")
    cols = (await db.execute(select(ColumnProfile).where(ColumnProfile.data_profile_id == p.id).order_by(ColumnProfile.column_index))).scalars().all()
    issues = (await db.execute(select(QualityIssue).where(QualityIssue.quality_report_id == q.id))).scalars().all()
    if not settings.GROQ_API_KEY:
        logger.error("ai_plan_configuration_missing", dataset_id=str(dataset_id), provider="groq")
        raise HTTPException(
            status_code=503,
            detail={
                "message": "AI planning is not configured on the backend. Set GROQ_API_KEY in the Render rivu-api service environment.",
                "type": "ai_configuration_error",
            },
        )
    try:
        plan = await generate_transformation_plan(
            get_ai_provider(),
            {"row_count": p.row_count, "column_count": p.column_count, "duplicate_row_count": p.duplicate_row_count, "duplicate_row_pct": float(p.duplicate_row_pct or 0), "total_null_pct": float(p.total_null_pct or 0), "filename": ds.original_filename, "file_format": ds.file_format},
            {"overall_score": float(q.overall_score), "completeness_score": float(q.completeness_score or 0), "validity_score": float(q.validity_score or 0), "consistency_score": float(q.consistency_score or 0), "uniqueness_score": float(q.uniqueness_score or 0), "issues": [{"issue_type": i.issue_type, "severity": i.severity, "affected_column": i.affected_column, "title": i.title} for i in issues]},
            [{"column_name": c.column_name, "semantic_type": c.semantic_type, "null_pct": float(c.null_pct or 0), "uniqueness_pct": float(c.uniqueness_pct or 0), "is_constant": c.is_constant, "sample_values": c.sample_values or [], "date_formats": c.date_formats or []} for c in cols],
        )
    except Exception as exc:
        logger.error(
            "ai_plan_generation_failed",
            dataset_id=str(dataset_id),
            user_id=str(current_user.id),
            error_type=type(exc).__name__,
            error=str(exc)[:500],
        )
        raise HTTPException(
            status_code=502,
            detail={
                "message": "The AI refinement service could not generate a plan.",
                "type": "ai_provider_error",
                "cause": str(exc)[:300],
            },
        )
    record = TransformationPlan(
        dataset_version_id=version.id, organization_id=org, created_by=current_user.id,
        status="planned", operations=plan.get("operations", []),
        total_operations=len(plan.get("operations", [])),
        estimated_quality_gain=plan.get("estimated_quality_gain"),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return {"id": str(record.id), **plan, "status": record.status}


@router.get("/{dataset_id}/preview")
async def preview_rows(
    dataset_id: UUID,
    offset: int = Query(0, ge=0, le=1_000_000),
    limit: int = Query(50, ge=1, le=100),
    search: str = Query("", max_length=200),
    sort: str = Query("", max_length=300),
    desc: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Return a bounded, real-data table preview for the current dataset version."""
    ds, _ = await dataset_for(dataset_id, current_user, db)
    version = (await db.execute(select(DatasetVersion).where(
        DatasetVersion.data_source_id == ds.id,
        DatasetVersion.version_number == ds.current_version,
    ))).scalar_one_or_none()
    if not version:
        raise HTTPException(404, "Dataset version not found")
    try:
        raw = await get_storage().download_file(version.storage_key)
        frame, _ = parse_to_polars(raw, version.file_format, ds.original_filename)
    except Exception as exc:
        raise HTTPException(502, detail={"message": "Dataset preview could not be loaded.", "type": "preview_error", "cause": str(exc)[:300]})
    if search.strip():
        needle = search.strip().lower()
        expressions = [
            pl.col(name).cast(pl.String).str.to_lowercase().str.contains(needle, literal=True)
            for name in frame.columns
        ]
        if expressions:
            frame = frame.filter(pl.any_horizontal(expressions))
    if sort and sort in frame.columns:
        frame = frame.sort(sort, descending=desc, nulls_last=True)
    total = frame.height
    return {
        "dataset_id": str(dataset_id),
        "version": version.version_number,
        "offset": offset,
        "limit": limit,
        "total": total,
        "columns": frame.columns,
        "rows": frame.slice(offset, limit).to_dicts(),
    }
