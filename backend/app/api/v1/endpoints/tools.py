"""Tools Centre API: catalogue, execution, history and output download.

Design notes:

- The tool list is served from the registry, so the launcher can never advertise
  a tool that has no runner. ``test_tools_registry.py`` asserts that parity.
- Every run is recorded in ``tool_executions`` before the response is returned,
  so history is real rather than inferred.
- When a tool produces an output frame it is written to object storage and the
  download URL is returned in the same response. Export is never a dead button.
- A run that fails still records a row with the error, because "failed jobs must
  explain what failed" (brief, Part 11).
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone

import polars as pl
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.exceptions import ProcessingError, ValidationError
from app.core.security import get_current_user, require_org_context, require_org_role
from app.core.storage import get_storage
from app.ingestion.artifacts import dataframe_to_bytes
from app.ingestion.parser import parse_to_polars
from app.models.dataset import DataSource, DatasetVersion
from app.models.tool_execution import ToolExecution
from app.models.user import User
from app.tools import registry, runner

router = APIRouter()


class RunToolRequest(BaseModel):
    dataset_id: uuid.UUID
    dataset_version: int | None = Field(
        default=None, description="Defaults to the dataset's current version."
    )
    config: dict = Field(default_factory=dict)


async def _org(user: User, db: AsyncSession) -> uuid.UUID:
    return await require_org_context(user, db)


async def _dataset(
    dataset_id: uuid.UUID, user: User, db: AsyncSession, version_number: int | None = None
) -> tuple[DataSource, DatasetVersion, uuid.UUID]:
    org = await _org(user, db)
    ds = (
        await db.execute(
            select(DataSource).where(
                DataSource.id == dataset_id, DataSource.organization_id == org
            )
        )
    ).scalar_one_or_none()
    if not ds:
        raise HTTPException(404, "Dataset not found")

    wanted = version_number or ds.current_version
    version = (
        await db.execute(
            select(DatasetVersion).where(
                DatasetVersion.data_source_id == ds.id,
                DatasetVersion.version_number == wanted,
            )
        )
    ).scalar_one_or_none()
    if not version:
        raise HTTPException(404, f"Dataset version {wanted} not found")
    return ds, version, org


def _tool_or_404(slug: str) -> registry.ToolSpec:
    spec = registry.get_tool(slug)
    if spec is None:
        raise HTTPException(404, f"Unknown tool: {slug}")
    return spec


# ── catalogue ───────────────────────────────────────────────────────────────


@router.get("/")
async def list_tools(
    category: str | None = Query(default=None),
    search: str | None = Query(default=None),
):
    """Every tool in the Tools Centre, with the controls its workspace renders."""
    grouped = registry.tools_by_category()
    tools = [t for group in grouped.values() for t in group]

    if category:
        tools = [t for t in tools if t["category"] == category]
    if search:
        needle = search.strip().lower()
        tools = [
            t
            for t in tools
            if needle in t["name"].lower()
            or needle in t["tagline"].lower()
            or needle in t["description"].lower()
        ]

    return {
        "tools": tools,
        "categories": registry.CATEGORIES,
        "count": len(tools),
    }


@router.get("/history")
async def all_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
    limit: int = Query(default=25, ge=1, le=100),
    tool_slug: str | None = Query(default=None),
):
    """History across every tool, for the Tools Centre landing page.

    Declared before ``/{slug}`` so FastAPI does not read "history" as a tool slug.
    """
    org = await _org(current_user, db)
    query = select(ToolExecution).where(ToolExecution.organization_id == org)
    if tool_slug:
        query = query.where(ToolExecution.tool_slug == tool_slug)
    rows = (
        await db.execute(query.order_by(ToolExecution.created_at.desc()).limit(limit))
    ).scalars().all()
    return {"executions": [_history_row(r) for r in rows], "count": len(rows)}


@router.get("/{slug}")
async def get_tool(slug: str):
    spec = _tool_or_404(slug)
    payload = spec.as_dict()
    payload["has_runner"] = slug in runner.RUNNERS
    return payload


# ── execution ───────────────────────────────────────────────────────────────


@router.post("/{slug}/run")
async def run_tool(
    slug: str,
    body: RunToolRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Run one tool against a dataset version and return the measured result."""
    spec = _tool_or_404(slug)
    ds, version, org = await _dataset(body.dataset_id, current_user, db, body.dataset_version)
    await require_org_role(current_user, db, {"owner", "admin", "editor"})

    started = time.perf_counter()
    try:
        raw = await get_storage().download_file(version.storage_key)
        df, _ = parse_to_polars(raw, version.file_format, version.storage_key)
    except ProcessingError:
        raise
    except ValidationError as exc:
        raise HTTPException(400, {"message": exc.message, "type": "validation_error"}) from exc
    except Exception as exc:
        raise ProcessingError(f"Could not read this dataset version: {exc}") from exc

    try:
        result = await runner.run_tool(slug, df, body.config or {})
    except ValidationError as exc:
        # Bad user input is a 400, not a server error. The run is not recorded
        # because nothing was executed.
        raise HTTPException(400, {"message": exc.message, "type": "validation_error"}) from exc
    except Exception as exc:
        duration_ms = int((time.perf_counter() - started) * 1000)
        await _record(
            db,
            org=org,
            dataset_id=ds.id,
            version_id=version.id,
            user_id=current_user.id,
            slug=slug,
            name=spec.name,
            status="failed",
            config=body.config or {},
            summary={},
            rows_in=df.height,
            rows_out=0,
            has_output=False,
            error=str(exc)[:2000],
            duration_ms=duration_ms,
        )
        raise HTTPException(
            422, {"message": f"{spec.name} failed: {exc}", "type": "processing_error"}
        ) from exc

    duration_ms = int((time.perf_counter() - started) * 1000)
    result["duration_ms"] = duration_ms

    output_url: str | None = None
    output_name: str | None = None
    output_df = result.get("output_df")
    if output_df is not None:
        fmt = result.get("output_format") or "csv"
        payload = result.get("output_bytes") or dataframe_to_bytes(output_df, fmt)
        key = (
            f"orgs/{org}/datasets/{ds.id}/tools/{slug}/{uuid.uuid4().hex}.{fmt}"
        )
        try:
            await get_storage().upload_file(key, payload, content_type=_content_type(fmt))
            output_url = await get_storage().get_download_url(key)
            output_name = f"{slug}-{version.version_number}.{fmt}"
        except Exception as exc:
            # Storage being unavailable must not lose the computed result; the
            # caller still sees every measured fact and a clear error.
            raise HTTPException(
                503,
                {
                    "message": "The tool ran but the output could not be stored. "
                    "Check object storage configuration.",
                    "type": "storage_error",
                },
            ) from exc

    summary = {
        "summary": result.get("summary"),
        "metrics": result.get("metrics", {}),
        "issue_count": len(result.get("issues") or []),
    }

    await _record(
        db,
        org=org,
        dataset_id=ds.id,
        version_id=version.id,
        user_id=current_user.id,
        slug=slug,
        name=spec.name,
        status="completed",
        config=body.config or {},
        summary=summary,
        rows_in=df.height,
        rows_out=int((result.get("metrics") or {}).get("rows_out") or (result.get("metrics") or {}).get("rows_exported") or 0),
        has_output=output_df is not None,
        error=None,
        duration_ms=duration_ms,
    )

    payload_out = runner.serialise(result)
    payload_out["output_url"] = output_url
    payload_out["output_filename"] = output_name
    payload_out["tool_name"] = spec.name
    payload_out["duration_ms"] = duration_ms
    return payload_out


def _content_type(fmt: str) -> str:
    return {
        "csv": "text/csv",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "json": "application/json",
    }.get(fmt, "application/octet-stream")


async def _record(
    db: AsyncSession,
    *,
    org: uuid.UUID,
    dataset_id: uuid.UUID,
    version_id: uuid.UUID,
    user_id: uuid.UUID,
    slug: str,
    name: str,
    status: str,
    config: dict,
    summary: dict,
    rows_in: int,
    rows_out: int,
    has_output: bool,
    error: str | None,
    duration_ms: int,
) -> None:
    db.add(
        ToolExecution(
            organization_id=org,
            dataset_id=dataset_id,
            dataset_version_id=version_id,
            created_by=user_id,
            tool_slug=slug,
            tool_name=name,
            status=status,
            config=config,
            result_summary=summary,
            rows_in=rows_in,
            rows_out=rows_out,
            has_output=has_output,
            error=error,
            duration_ms=duration_ms,
        )
    )
    await db.commit()


# ── history ─────────────────────────────────────────────────────────────────


@router.get("/{slug}/history")
async def tool_history(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
    limit: int = Query(default=25, ge=1, le=100),
):
    """Real execution history for one tool, newest first."""
    _tool_or_404(slug)
    org = await _org(current_user, db)
    rows = (
        await db.execute(
            select(ToolExecution)
            .where(
                ToolExecution.organization_id == org,
                ToolExecution.tool_slug == slug,
            )
            .order_by(ToolExecution.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()

    return {
        "tool": slug,
        "executions": [_history_row(r) for r in rows],
        "count": len(rows),
    }


def _history_row(row: ToolExecution) -> dict:
    return {
        "id": str(row.id),
        "tool_slug": row.tool_slug,
        "tool_name": row.tool_name,
        "status": row.status,
        "dataset_id": str(row.dataset_id) if row.dataset_id else None,
        "dataset_version": row.dataset_version_id and str(row.dataset_version_id),
        "rows_in": row.rows_in,
        "rows_out": row.rows_out,
        "has_output": row.has_output,
        "error": row.error,
        "duration_ms": row.duration_ms,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "summary": row.result_summary.get("summary"),
        "metrics": row.result_summary.get("metrics", {}),
    }