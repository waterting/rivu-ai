"""
Datasets endpoints: upload, list, get, profile, analyze, version management.
"""

import io
import uuid
import re
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Request, UploadFile, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import polars as pl
import structlog

from app.audit.service import (
    DOWNLOAD_URL_DENIED,
    DOWNLOAD_URL_ISSUED,
    client_ip,
    client_user_agent,
    record_event,
)
from app.core.database import get_session
from app.core.config import settings
from app.core.security import get_current_user, require_org_context, require_org_role
from app.core.storage import get_storage, compute_checksum, build_storage_key
from app.core.exceptions import ValidationError, http_not_found
from app.models.user import User
from app.models.organization import Membership
from app.models.project import Project
from app.models.dataset import DataSource, DatasetVersion
from app.models.quality import Job
from app.ingestion.parser import validate_upload, parse_to_polars, validate_file_signature

router = APIRouter()
logger = structlog.get_logger(__name__)


def download_url_ttl_seconds() -> int:
    """Presigned URL lifetime, bounded so a leaked URL cannot live forever."""
    return max(60, min(settings.DOWNLOAD_URL_TTL_SECONDS, 24 * 3600))


def is_safe_storage_key(storage_key: str, base_key: str) -> bool:
    """True when ``storage_key`` stayed inside the version's own prefix.

    Object keys are not paths, but a key containing traversal or an absolute
    path would still select an object outside the intended prefix, so both are
    rejected before a URL is minted.
    """
    if not storage_key or not base_key:
        return False
    if storage_key.startswith("/") or ".." in storage_key.split("/"):
        return False
    if "\\" in storage_key:
        return False
    base_dir = base_key.rsplit("/", 1)[0] if "/" in base_key else ""
    if base_dir and not storage_key.startswith(base_dir + "/"):
        return False
    return True


async def _derive_artifact(storage, version: DatasetVersion, stem: str, requested: str, prefix: str) -> str | None:
    """Generate a non-canonical artifact on demand from the canonical one.

    Refined versions store one canonical artifact; a request for another format
    is served by reading the canonical, re-parsing it and writing the requested
    format. Returns the new object key, or None when the canonical cannot be
    read or the format is unsupported.
    """
    from app.ingestion.artifacts import content_type_for, dataframe_to_bytes
    from app.ingestion.parser import parse_to_polars

    canonical_key = version.storage_key
    try:
        raw = await storage.download_file(canonical_key)
        df, _meta = parse_to_polars(raw, version.file_format, canonical_key)
        data = dataframe_to_bytes(df, requested)
    except Exception:
        logger.warning(
            "artifact_derive_failed",
            version_id=str(version.id),
            requested=requested,
            canonical=canonical_key,
        )
        return None

    key = f"{prefix}/{stem}.{requested}"
    try:
        await storage.upload_file(
            key,
            data,
            content_type_for(requested),
            {
                "org_id": str(version.organization_id),
                "dataset_id": str(version.data_source_id),
                "derived_from": canonical_key,
                "derived_format": requested,
            },
        )
    except Exception:
        logger.warning("artifact_derive_upload_failed", key=key, requested=requested)
        return None
    return key


async def _run_inline_job(
    job_id: str,
    version_id: str,
    data_source_id: str,
    org_id: str,
    file_format: str,
) -> None:
    """Process a queued job in the API process when no separate worker is running.

    Guards against double-processing: if a dedicated worker has already claimed
    the job (status no longer "queued"), this does nothing. The heavy lifting is
    the same ``process_dataset_async`` the worker uses.
    """
    from uuid import UUID

    from sqlalchemy import select

    from app.core import database
    from app.models.quality import Job
    from app.workers.processor import process_dataset_async

    try:
        async with database._session_factory() as db:
            job = (
                await db.execute(select(Job).where(Job.id == UUID(str(job_id))))
            ).scalar_one_or_none()
            if job is None or job.status != "queued":
                # Already claimed by a worker or no longer pending.
                return
        await process_dataset_async(
            job_id=job_id,
            version_id=version_id,
            data_source_id=data_source_id,
            org_id=org_id,
            raw_bytes=None,
            file_format=file_format,
        )
    except Exception as exc:  # pragma: no cover - background best-effort
        logger.exception("inline_job_failed", job_id=str(job_id), error=str(exc))

async def _get_user_org(user: User, db: AsyncSession) -> UUID:
    """Resolve the caller's explicitly selected organization.

    Delegates to the central tenant context so an unaccepted invitation cannot
    select another workspace's datasets (audit finding 4).
    """
    return await require_org_context(user, db)


@router.post("/projects/{project_id}/upload", status_code=202)
async def upload_dataset(
    project_id: UUID,
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
    background_tasks: BackgroundTasks = None,
):
    """Upload a dataset file and start processing pipeline."""
    membership = await require_org_role(current_user, db, {"owner", "admin", "editor"})
    org_id = membership.organization_id

    # Verify project belongs to org
    project_result = await db.execute(
        select(Project).where(Project.id == project_id, Project.organization_id == org_id)
    )
    if not project_result.scalar_one_or_none():
        raise http_not_found("Project", str(project_id))

    # Validate metadata
    filename = file.filename or "upload"
    content_type = file.content_type or "application/octet-stream"

    # FastAPI spools UploadFile to a temporary file. Hash and size it in bounded chunks
    # instead of copying the entire upload into application memory.
    import hashlib
    await file.seek(0)
    digest = hashlib.sha256()
    size = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        size += len(chunk)
        if size > settings.MAX_UPLOAD_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail={"message": f"File exceeds the {settings.MAX_UPLOAD_SIZE_MB}MB upload limit", "type": "file_too_large"},
            )
        digest.update(chunk)
    checksum = digest.hexdigest()
    await file.seek(0)

    try:
        file_format = validate_upload(filename, size, content_type)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail={"message": e.message, "type": "validation_error"})
    # Cheap binary signature validation before object-storage persistence.
    if file_format in {"xlsx", "parquet"}:
        await file.seek(0)
        signature = await file.read(16)
        await file.seek(0)
        try:
            validate_file_signature(signature, file_format)
        except ValidationError as e:
            raise HTTPException(status_code=400, detail={"message": e.message, "type": "validation_error"})

    # Keep client-controlled filenames safe and portable in object-storage keys.
    safe_filename = re.sub(r"[^A-Za-z0-9._-]", "_", filename).strip("._")[:200] or "upload"
    dataset_name = (name or filename.rsplit(".", 1)[0]).strip()[:300] or "Dataset"

    # Create DataSource record
    data_source = DataSource(
        organization_id=org_id,
        project_id=project_id,
        created_by=current_user.id,
        name=dataset_name,
        description=description,
        original_filename=filename,
        file_format=file_format,
        status="uploading",
        current_version=1,
    )
    db.add(data_source)
    await db.flush()

    # Build storage key for v1 (raw)
    storage_key = build_storage_key(
        str(org_id), str(project_id), str(data_source.id), 1, safe_filename
    )
    storage_bucket = get_storage().bucket

    # Upload to object storage
    try:
        storage = get_storage()
        await storage.upload_file(
            key=storage_key,
            data=file.file,
            content_type=content_type,
            metadata={
                "org_id": str(org_id),
                "project_id": str(project_id),
                "dataset_id": str(data_source.id),
                "original_filename": safe_filename,
                "format": file_format,
            },
        )
    except Exception as e:
        logger.error("storage_upload_failed", error=str(e))
        raise HTTPException(status_code=500, detail={"message": "Storage upload failed", "type": "storage_error"})

    # Create version 1 record
    version = DatasetVersion(
        data_source_id=data_source.id,
        organization_id=org_id,
        version_number=1,
        version_label="raw",
        description="Original uploaded file",
        storage_key=storage_key,
        storage_bucket=storage_bucket,
        file_format=file_format,
        file_size_bytes=size,
        checksum=checksum,
    )
    db.add(version)
    await db.flush()

    # Create profiling job
    job = Job(
        organization_id=org_id,
        created_by=current_user.id,
        job_type="profile",
        status="queued",
        data_source_id=data_source.id,
        dataset_version_id=version.id,
        priority=5,
    )
    db.add(job)
    data_source.status = "uploaded"
    await db.commit()

    await db.refresh(job)
    await db.refresh(data_source)
    await db.refresh(version)

    # The committed job is picked up by the separate database-backed worker.
    # This survives API restarts and does not rely on in-process BackgroundTasks.
    logger.info("dataset_uploaded", dataset_id=str(data_source.id), job_id=str(job.id))

    # Optional in-process fallback for deployments with no worker at all (local
    # dev, CI, free-tier hosts). Disabled in production, where heavy processing
    # must run on the durable worker (audit critical finding 2). The inline path
    # re-checks the job status, so if a worker claims the job first this no-ops.
    if settings.inline_processing_enabled and background_tasks is not None:
        background_tasks.add_task(
            _run_inline_job,
            str(job.id),
            str(version.id),
            str(data_source.id),
            str(org_id),
            file_format,
        )

    return {
        "message": "Dataset uploaded successfully. Processing started.",
        "dataset": {
            "id": str(data_source.id),
            "name": data_source.name,
            "filename": filename,
            "format": file_format,
            "size_bytes": size,
            "status": data_source.status,
        },
        "version": {
            "id": str(version.id),
            "version_number": 1,
            "version_label": "raw",
        },
        "job": {
            "id": str(job.id),
            "status": job.status,
            "type": job.job_type,
        },
    }


@router.get("/{dataset_id}")
async def get_dataset(
    dataset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    org_id = await _get_user_org(current_user, db)
    ds = await _get_dataset_or_404(dataset_id, org_id, db)
    return _format_datasource(ds)


@router.get("/{dataset_id}/versions")
async def get_versions(
    dataset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    org_id = await _get_user_org(current_user, db)
    ds = await _get_dataset_or_404(dataset_id, org_id, db)

    result = await db.execute(
        select(DatasetVersion)
        .where(DatasetVersion.data_source_id == dataset_id)
        .order_by(DatasetVersion.version_number)
    )
    versions = result.scalars().all()

    return {
        "dataset_id": str(dataset_id),
        "versions": [_format_version(v) for v in versions],
    }


@router.get("/{dataset_id}/export/{version_number}")
async def export_dataset(
    dataset_id: UUID,
    version_number: int,
    format: str = "csv",
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Get a presigned download URL for a dataset version or its generated sibling artifact.

    The URL is a bearer token, so minting one is recorded in the audit trail
    with the tenant, the actor and the object key. Lifecycle: the lookup is
    scoped to the caller's organization, the key is checked against the version
    prefix, and the TTL comes from configuration rather than a per-route literal.
    """
    org_id = await _get_user_org(current_user, db)
    ds = await _get_dataset_or_404(dataset_id, org_id, db)

    result = await db.execute(
        select(DatasetVersion).where(
            DatasetVersion.data_source_id == dataset_id,
            DatasetVersion.version_number == version_number,
            DatasetVersion.organization_id == org_id,
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        raise http_not_found("Dataset version", str(version_number))

    requested = (format or version.file_format).lower().lstrip(".")
    allowed = {"csv", "json", "parquet", "xlsx"}
    if requested not in allowed:
        await record_event(
            db,
            action=DOWNLOAD_URL_DENIED,
            resource_type="dataset_version",
            resource_id=str(version.id),
            organization_id=org_id,
            actor_id=current_user.id,
            details={"reason": "unsupported_format", "requested": requested},
            ip_address=client_ip(request),
            user_agent=client_user_agent(request),
        )
        raise HTTPException(status_code=400, detail={"message": f"Unsupported export format: {requested}"})

    storage_key = version.storage_key
    output_format = version.file_format

    if requested != version.file_format:
        # Refined versions create sibling artifacts under the same vN directory.
        # Raw uploads only have their original source artifact.
        if not version.version_label or not version.version_label.startswith("refined"):
            await record_event(
                db,
                action=DOWNLOAD_URL_DENIED,
                resource_type="dataset_version",
                resource_id=str(version.id),
                organization_id=org_id,
                actor_id=current_user.id,
                details={"reason": "format_not_available", "requested": requested},
                ip_address=client_ip(request),
                user_agent=client_user_agent(request),
            )
            raise HTTPException(
                status_code=404,
                detail={"message": f"{requested.upper()} is not available for this version"},
            )
        prefix = version.storage_key.rsplit("/", 1)[0]
        stem = version.storage_key.rsplit("/", 1)[1].rsplit(".", 1)[0]
        candidate_key = f"{prefix}/{stem}.{requested}"
        storage = get_storage()
        if not await storage.file_exists(candidate_key):
            # Refined versions store only the canonical artifact plus the schema
            # sidecar; derive the requested format on demand from the canonical
            # instead of pre-writing every format (audit finding 12).
            derived = await _derive_artifact(storage, version, stem, requested, prefix)
            if derived is None:
                await record_event(
                    db,
                    action=DOWNLOAD_URL_DENIED,
                    resource_type="dataset_version",
                    resource_id=str(version.id),
                    organization_id=org_id,
                    actor_id=current_user.id,
                    details={"reason": "artifact_missing", "requested": requested},
                    ip_address=client_ip(request),
                    user_agent=client_user_agent(request),
                )
                raise HTTPException(
                    status_code=404,
                    detail={"message": f"{requested.upper()} artifact is not available for this version"},
                )
            candidate_key = derived
        storage_key = candidate_key
        output_format = requested

    if not is_safe_storage_key(storage_key, version.storage_key):
        # The key is derived from a stored value, but it is still the only thing
        # that decides which object is handed out; never mint a URL for a key
        # that escaped the version's own prefix.
        await record_event(
            db,
            action=DOWNLOAD_URL_DENIED,
            resource_type="dataset_version",
            resource_id=str(version.id),
            organization_id=org_id,
            actor_id=current_user.id,
            details={"reason": "unsafe_storage_key", "storage_key": storage_key},
            ip_address=client_ip(request),
            user_agent=client_user_agent(request),
        )
        raise HTTPException(status_code=500, detail={"message": "Could not resolve a safe download target"})

    ttl = download_url_ttl_seconds()
    try:
        url = await get_storage().get_download_url(storage_key, expires_in=ttl)
    except Exception as e:
        raise HTTPException(status_code=500, detail={"message": f"Could not generate download URL: {e}"})

    await record_event(
        db,
        action=DOWNLOAD_URL_ISSUED,
        resource_type="dataset_version",
        resource_id=str(version.id),
        organization_id=org_id,
        actor_id=current_user.id,
        details={
            "dataset_id": str(dataset_id),
            "version_number": version_number,
            "storage_key": storage_key,
            "format": output_format,
            "expires_in": ttl,
        },
        ip_address=client_ip(request),
        user_agent=client_user_agent(request),
    )

    return {
        "download_url": url,
        "expires_in": ttl,
        "version": version_number,
        "format": output_format,
        "filename": f"{ds.name}_v{version_number}.{output_format}",
    }


async def _get_dataset_or_404(dataset_id: UUID, org_id: UUID, db: AsyncSession) -> DataSource:
    result = await db.execute(
        select(DataSource).where(
            DataSource.id == dataset_id, DataSource.organization_id == org_id
        )
    )
    ds = result.scalar_one_or_none()
    if not ds:
        raise http_not_found("Dataset", str(dataset_id))
    return ds


def _format_datasource(ds: DataSource) -> dict:
    return {
    "id": str(ds.id),
    "project_id": str(ds.project_id),
    "name": ds.name,
    "description": ds.description,
    "original_filename": ds.original_filename,
    "file_format": ds.file_format,
    "status": ds.status,
    "current_version": ds.current_version,
    "created_at": ds.created_at.isoformat(),
    "updated_at": ds.updated_at.isoformat(),
    }


def _format_dataset(ds: DataSource, version: DatasetVersion | None = None) -> dict:
    """A dataset row for the manager: parent fields plus current-version facts.

    Row and column counts live on the version, not the parent, so the list needs
    the current version to show them. When it is not supplied the counts are
    null rather than zero, which would read as "empty dataset" and be wrong.
    """
    payload = _format_datasource(ds)
    payload["tags"] = list(ds.tags or [])
    payload["row_count"] = version.row_count if version else None
    payload["column_count"] = version.column_count if version else None
    payload["quality_score"] = float(version.quality_score) if version and version.quality_score is not None else None
    return payload


def _format_version(v: DatasetVersion) -> dict:
    return {
        "id": str(v.id),
        "version_number": v.version_number,
        "version_label": v.version_label,
        "file_format": v.file_format,
        "file_size_bytes": v.file_size_bytes,
        "row_count": v.row_count,
        "column_count": v.column_count,
        "quality_score": float(v.quality_score) if v.quality_score is not None else None,
        "quality_delta": float(v.quality_delta) if v.quality_delta is not None else None,
        "created_at": v.created_at.isoformat(),
    }

# ── dataset management ──────────────────────────────────────────────────────
#
# The brief asks for a real dataset manager: list, rename, duplicate, archive,
# delete, and read records. Listing already worked only as a side effect of
# GET /projects/{id}; these endpoints make it a first-class resource.


class RenameDatasetRequest(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=2000)


@router.get("/")
async def list_datasets(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
):
    """Every dataset in the caller's organization, newest first."""
    org = await _get_user_org(current_user, db)
    query = select(DataSource).where(DataSource.organization_id == org)
    if status:
        query = query.where(DataSource.status == status)
    if search:
        query = query.where(DataSource.name.ilike(f"%{search.strip()}%"))
    rows = (await db.execute(query.order_by(DataSource.created_at.desc()))).scalars().all()

    # Row/column counts come from the current version, not from the parent row,
    # so the list can show them without N+1 queries per dataset.
    version_rows = (
        await db.execute(
            select(DatasetVersion).where(
                DatasetVersion.data_source_id.in_([d.id for d in rows] or [uuid.uuid4()]),
                DatasetVersion.version_number.in_([d.current_version for d in rows] or [0]),
            )
        )
    ).scalars().all()
    by_dataset = {v.data_source_id: v for v in version_rows}

    return {
        "datasets": [_format_dataset(d, by_dataset.get(d.id)) for d in rows],
        "count": len(rows),
    }


@router.get("/{dataset_id}/records")
async def get_dataset_records(
    dataset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    """Read rows from the dataset's current version.

    This is what the Data Explorer renders. It reads the stored artifact rather
    than re-running the pipeline, so it is the same data every export produces.
    """
    org = await _get_user_org(current_user, db)
    ds = (await db.execute(select(DataSource).where(
        DataSource.id == dataset_id, DataSource.organization_id == org
    ))).scalar_one_or_none()
    if not ds:
        raise http_not_found("Dataset", str(dataset_id))

    version = (await db.execute(select(DatasetVersion).where(
        DatasetVersion.data_source_id == ds.id,
        DatasetVersion.version_number == ds.current_version,
    ))).scalar_one_or_none()
    if not version:
        raise http_not_found("Dataset version")

    raw = await get_storage().download_file(version.storage_key)
    df, _ = parse_to_polars(raw, version.file_format, version.storage_key)

    rows = df.slice(offset, limit).to_dicts()
    # JSON-safe: normalise anything that is not a plain scalar.
    safe_rows = [
        {
            k: (v if v is None or isinstance(v, (str, int, float, bool)) else str(v))
            for k, v in row.items()
        }
        for row in rows
    ]
    return {
        "dataset_id": str(ds.id),
        "version": version.version_number,
        "row_count": df.height,
        "column_count": df.width,
        "columns": [
            {"name": name, "dtype": str(dtype)} for name, dtype in df.schema.items()
        ],
        "rows": safe_rows,
        "offset": offset,
        "limit": limit,
    }


@router.patch("/{dataset_id}")
async def rename_dataset(
    dataset_id: UUID,
    body: RenameDatasetRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Rename a dataset and optionally change its description."""
    org = await _get_user_org(current_user, db)
    ds = (await db.execute(select(DataSource).where(
        DataSource.id == dataset_id, DataSource.organization_id == org
    ))).scalar_one_or_none()
    if not ds:
        raise http_not_found("Dataset", str(dataset_id))

    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Dataset name cannot be blank")

    ds.name = name
    if body.description is not None:
        ds.description = body.description.strip() or None
    await db.commit()
    return _format_dataset(ds, None)


@router.post("/{dataset_id}/duplicate")
async def duplicate_dataset(
    dataset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
    name: str | None = Query(default=None),
):
    """Create a new dataset that points at the same stored version.

    The copy is a new dataset record over the same artifact, so duplicating does
    not double object storage. A later refinement writes a new version and the
    two diverge from there.
    """
    org = await _get_user_org(current_user, db)
    await require_org_role(current_user, db, {"owner", "admin", "editor"})
    source = (await db.execute(select(DataSource).where(
        DataSource.id == dataset_id, DataSource.organization_id == org
    ))).scalar_one_or_none()
    if not source:
        raise http_not_found("Dataset", str(dataset_id))

    version = (await db.execute(select(DatasetVersion).where(
        DatasetVersion.data_source_id == source.id,
        DatasetVersion.version_number == source.current_version,
    ))).scalar_one_or_none()
    if not version:
        raise http_not_found("Dataset version")

    copy_name = (name or f"{source.name} (copy)").strip()[:300] or f"{source.name} (copy)"

    copy = DataSource(
        organization_id=source.organization_id,
        project_id=source.project_id,
        created_by=current_user.id,
        name=copy_name,
        description=source.description,
        original_filename=source.original_filename,
        file_format=source.file_format,
        status=source.status,
        current_version=source.current_version,
        tags=list(source.tags or []),
    )
    db.add(copy)
    await db.flush()

    db.add(DatasetVersion(
        data_source_id=copy.id,
        organization_id=source.organization_id,
        version_number=version.version_number,
        version_label=version.version_label,
        description=version.description,
        storage_key=version.storage_key,
        file_format=version.file_format,
        file_size_bytes=version.file_size_bytes,
        row_count=version.row_count,
        column_count=version.column_count,
        quality_score=version.quality_score,
        quality_delta=version.quality_delta,
    ))
    await db.commit()
    return _format_dataset(copy, version)


@router.post("/{dataset_id}/archive")
async def archive_dataset(
    dataset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Mark a dataset archived. Data is retained; it leaves the default list."""
    org = await _get_user_org(current_user, db)
    await require_org_role(current_user, db, {"owner", "admin", "editor"})
    ds = (await db.execute(select(DataSource).where(
        DataSource.id == dataset_id, DataSource.organization_id == org
    ))).scalar_one_or_none()
    if not ds:
        raise http_not_found("Dataset", str(dataset_id))

    ds.status = "archived"
    await db.commit()
    return _format_dataset(ds, None)


@router.post("/{dataset_id}/restore")
async def restore_dataset(
    dataset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Bring an archived dataset back into the active list."""
    org = await _get_user_org(current_user, db)
    await require_org_role(current_user, db, {"owner", "admin", "editor"})
    ds = (await db.execute(select(DataSource).where(
        DataSource.id == dataset_id, DataSource.organization_id == org
    ))).scalar_one_or_none()
    if not ds:
        raise http_not_found("Dataset", str(dataset_id))

    ds.status = "uploaded"
    await db.commit()
    return _format_dataset(ds, None)
