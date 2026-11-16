"""Execution engine shared by every tool in the Tools Centre.

Each runner receives a Polars DataFrame already loaded from the caller's own
dataset version, plus the configuration the user set in the workspace, and
returns a uniform result envelope:

    {
      "tool": slug,
      "summary": str,            # one line, what happened
      "metrics": {...},          # measured facts, never estimates
      "columns": [...],          # per-column facts, where meaningful
      "preview_rows": [...],     # rows after the operation, capped
      "issues": [...],           # row/column level findings
      "output_df": DataFrame|None,   # set only by tools that change data
      "output_format": str|None,
    }

The API layer turns ``output_df`` into a real downloadable artifact and records
an execution row, so "export" is never a dead button.

Rules this file enforces from the brief:
- Nothing is applied without the user asking (tools report, they do not silently
  mutate the source dataset).
- Every number is measured from the data, not fabricated.
- AI output is returned as suggestions only; the caller decides.
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable

import polars as pl

from app.core.exceptions import ValidationError, ProcessingError
from app.profiler.engine import profile_dataframe
from app.profiler.quality import calculate_quality_report, quality_methodology
from app.profiler.duplicates import detect_duplicates
from app.profiler.schema import apply_schema, schema_records
from app.cleaning.engine import TransformationEngine
from app.ingestion.artifacts import dataframe_to_bytes

PREVIEW_ROWS = 25
MAX_ISSUES = 200


# ── helpers ─────────────────────────────────────────────────────────────────


def _preview(df: pl.DataFrame, limit: int = PREVIEW_ROWS) -> list[dict[str, Any]]:
    """JSON-safe rows. Polars values are not all JSON serialisable."""
    rows = df.head(limit).to_dicts()
    safe: list[dict[str, Any]] = []
    for row in rows:
        clean: dict[str, Any] = {}
        for key, value in row.items():
            if value is None or isinstance(value, (str, int, float, bool)):
                clean[key] = value
            else:
                clean[key] = str(value)
        safe.append(clean)
    return safe


def _column_facts(df: pl.DataFrame) -> list[dict[str, Any]]:
    """Minimal per-column facts, without a full profile pass."""
    facts: list[dict[str, Any]] = []
    total = df.height
    for name in df.columns:
        series = df[name]
        null_count = int(series.null_count())
        try:
            unique_count = int(series.n_unique())
        except Exception:
            unique_count = None
        facts.append(
            {
                "name": name,
                "dtype": str(series.dtype),
                "null_count": null_count,
                "null_pct": round((null_count / total * 100) if total else 0.0, 2),
                "unique_count": unique_count,
            }
        )
    return facts


def _resolve_columns(df: pl.DataFrame, requested: Any, *, label: str) -> list[str]:
    """Validate a user-supplied column list against the actual frame."""
    if not requested:
        return []
    if isinstance(requested, str):
        requested = [requested]
    unknown = [c for c in requested if c not in df.columns]
    if unknown:
        raise ValidationError(f"{label} not found in this dataset: {', '.join(map(str, unknown))}")
    return list(dict.fromkeys(map(str, requested)))


_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
_SKU = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._\-/]*$")

# Below this, a mapping is a guess rather than a match. The mapper reports it
# as unmatched instead of inventing a confident-looking number.
MIN_MAPPING_CONFIDENCE = 0.34


def _is_blank(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False


# ── TOOL 01 — Data Profiler ─────────────────────────────────────────────────


def _run_data_profiler(df: pl.DataFrame, config: dict[str, Any]) -> dict[str, Any]:
    sample = int(config.get("sample_rows") or 0)
    frame = df if sample <= 0 or sample >= df.height else df.head(sample)
    profile = profile_dataframe(frame, "tool-run")
    quality = calculate_quality_report(profile, profile["columns"], row_count=frame.height)
    return {
        "summary": (
            f"Profiled {profile['row_count']:,} rows across {profile['column_count']} columns "
            f"(quality {quality['overall_score']:.1f}/100)."
        ),
        "metrics": {
            "row_count": profile["row_count"],
            "column_count": profile["column_count"],
            "duplicate_row_count": profile["duplicate_row_count"],
            "total_null_count": profile["total_null_count"],
            "total_null_pct": profile["total_null_pct"],
            "overall_score": quality["overall_score"],
            "sampled": frame.height != df.height,
        },
        "columns": profile["columns"],
        "preview_rows": _preview(frame),
        "issues": _quality_issues(quality),
        "quality": quality,
        "output_df": None,
        "output_format": None,
    }


def _quality_issues(quality: dict[str, Any]) -> list[dict[str, Any]]:
    issues = []
    for issue in quality.get("issues", [])[:MAX_ISSUES]:
        issues.append(
            {
                "severity": issue.get("severity", "info"),
                "type": issue.get("issue_type", "issue"),
                "message": issue.get("message", ""),
                "column": issue.get("column"),
                "row": issue.get("row"),
            }
        )
    return issues


# ── TOOL 02 — Smart Column Mapper ───────────────────────────────────────────


def _run_smart_mapper(df: pl.DataFrame, config: dict[str, Any]) -> dict[str, Any]:
    targets = [t.strip() for t in str(config.get("target_fields") or "").split(",") if t.strip()]
    if not targets:
        raise ValidationError("Enter at least one target field name.")

    source = df.columns
    used: set[str] = set()
    mappings: list[dict[str, Any]] = []

    for target in targets:
        target_norm = _normalise_token(target)
        best: tuple[str, float] | None = None
        for col in source:
            if col in used:
                continue
            score = _similarity(target_norm, _normalise_token(col))
            if best is None or score > best[1]:
                best = (col, score)

        if best and best[1] >= MIN_MAPPING_CONFIDENCE:
            used.add(best[0])
            confidence = round(best[1] * 100, 1)
            mappings.append(
                {
                    "target_field": target,
                    "source_column": best[0],
                    "confidence": confidence,
                    "matched": True,
                }
            )
        else:
            mappings.append(
                {
                    "target_field": target,
                    "source_column": None,
                    "confidence": round((best[1] if best else 0.0) * 100, 1),
                    "matched": False,
                }
            )

    matched = [m for m in mappings if m["matched"]]
    unmapped_targets = [m["target_field"] for m in mappings if not m["matched"]]
    unused_sources = [c for c in source if c not in used]

    # Only rename when every target has a source; a partial rename would produce
    # a frame that silently mixes schemas.
    rename_map = {m["source_column"]: m["target_field"] for m in matched}
    output_df = df.rename(rename_map) if rename_map else df

    confidence_list = ", ".join(f"{m['confidence']}%" for m in matched) or "no matches"

    return {
        "summary": (
            f"Mapped {len(matched)} of {len(targets)} target fields "
            f"({confidence_list})."
        ),
        "metrics": {
            "targets": len(targets),
            "matched": len(matched),
            "unmapped_targets": unmapped_targets,
            "unused_source_columns": unused_sources,
        },
        "columns": _column_facts(output_df),
        "mappings": mappings,
        "preview_rows": _preview(output_df),
        "issues": [
            {
                "severity": "warning" if (m["confidence"] and m["confidence"] < 60) else "info",
                "type": "mapping",
                "message": (
                    f"{m['target_field']} matched to {m['source_column']} at {m['confidence']}%"
                    if m["matched"]
                    else f"{m['target_field']} has no plausible source column"
                ),
                "column": m["source_column"],
                "row": None,
            }
            for m in mappings
        ][:MAX_ISSUES],
        "output_df": output_df,
        "output_format": None,
        "rename_map": rename_map,
    }


def _normalise_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _similarity(a: str, b: str) -> float:
    """Token overlap, so "Item Desc" and "item_description" score highly."""
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    a_tokens, b_tokens = set(a.split()), set(b.split())
    if not a_tokens or not b_tokens:
        return 0.0
    overlap = len(a_tokens & b_tokens)
    if overlap:
        return overlap / max(len(a_tokens), len(b_tokens))
    # Fall back to a character-level ratio for typos and abbreviations.
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if not longer:
        return 0.0
    matches = sum(1 for ch in shorter if ch in longer)
    return (matches / len(longer)) * 0.6


# ── TOOL 03 — Data Cleaner ──────────────────────────────────────────────────

_CLEANER_RULES = [
    "trim_whitespace",
    "normalize_whitespace",
    "lowercase",
    "uppercase",
    "title_case",
    "standardize_date",
    "standardize_datetime",
    "coerce_numeric",
    "coerce_boolean",
    "normalize_currency",
    "normalize_phone",
    "normalize_email",
    "normalize_category",
    "drop_nulls",
    "remove_duplicates",
]


# Rules that must be applied per column; the engine requires a column for these.
_COLUMN_SCOPED = {
    "trim_whitespace",
    "normalize_whitespace",
    "lowercase",
    "uppercase",
    "title_case",
    "standardize_date",
    "standardize_datetime",
    "coerce_numeric",
    "coerce_boolean",
    "normalize_currency",
    "normalize_phone",
    "normalize_email",
    "normalize_category",
}

# Whole-frame rules, which the engine handles with column=None.
_ROW_SCOPED = {"drop_nulls", "remove_duplicates"}


def _run_data_cleaner(df: pl.DataFrame, config: dict[str, Any]) -> dict[str, Any]:
    rules = config.get("rules") or []
    if isinstance(rules, str):
        rules = [r.strip() for r in rules.split(",") if r.strip()]
    unknown = [r for r in rules if r not in _CLEANER_RULES]
    if unknown:
        raise ValidationError(f"Unknown cleaning rule: {', '.join(map(str, unknown))}")
    if not rules:
        raise ValidationError("Select at least one cleaning rule.")

    work = df
    removed_rows = 0
    if config.get("drop_empty_rows"):
        before = work.height
        text_cols = [c for c in work.columns if work[c].dtype == pl.Utf8]
        if text_cols:
            non_empty = pl.any_horizontal(
                [pl.col(c).is_not_null() & (pl.col(c).cast(pl.Utf8).str.strip_chars() != "") for c in text_cols]
            )
            work = work.filter(non_empty)
        else:
            work = work.drop_nulls()
        removed_rows = before - work.height

    # The workspace asks for rules, not columns. Expand each column-scoped rule
    # across the text columns so a ticked rule actually does something; the
    # engine raises when handed a rule with no column.
    operations: list[dict[str, Any]] = []
    for rule in rules:
        if rule in _ROW_SCOPED:
            operations.append({"type": rule, "column": None, "parameters": {}})
            continue
        text_cols = [c for c in work.columns if work[c].dtype == pl.Utf8]
        if not text_cols:
            continue
        for col in text_cols:
            operations.append({"type": rule, "column": col, "parameters": {}})

    if not operations:
        raise ValidationError(
            "None of the selected rules apply to this dataset's column types."
        )

    engine = TransformationEngine(work)
    result = engine.execute_operations(operations)
    out = result["df"]

    applied = {e["op"] for e in result["log"] if e.get("status") == "ok" and e.get("applied")}
    failed = [
        {"rule": e.get("op"), "column": e.get("column"), "error": e.get("error")}
        for e in result["log"]
        if e.get("status") == "failed"
    ]

    return {
        "summary": (
            f"Applied {len(applied)} of {len(rules)} rule(s) across {len(out.columns)} column(s); "
            f"{result['cells_changed']:,} cells changed"
            + (f", {removed_rows:,} empty row(s) removed." if removed_rows else ".")
        ),
        "metrics": {
            "rules_requested": len(rules),
            "rules_applied": len(applied),
            "operations_run": len(operations),
            "rows_in": df.height,
            "rows_out": out.height,
            "cells_changed": result["cells_changed"],
            "empty_rows_removed": removed_rows,
            "duration_ms": result["duration_ms"],
        },
        "operations_log": result["log"][:MAX_ISSUES],
        "failed_operations": failed[:MAX_ISSUES],
        "columns": _column_facts(out),
        "preview_rows": _preview(out),
        "issues": [
            {
                "severity": "error",
                "type": "cleaning",
                "message": f"Rule '{f['rule']}' on {f['column'] or 'all columns'} failed: {f['error']}",
                "column": f.get("column"),
                "row": None,
            }
            for f in failed
        ][:MAX_ISSUES],
        "output_df": out,
        "output_format": None,
    }


# ── TOOL 04 — Duplicate Finder ──────────────────────────────────────────────


def _run_duplicate_finder(df: pl.DataFrame, config: dict[str, Any]) -> dict[str, Any]:
    key_columns = _resolve_columns(df, config.get("key_columns"), label="Column")

    work = df
    if config.get("ignore_whitespace") or config.get("ignore_case"):
        text_cols = [c for c in work.columns if work[c].dtype == pl.Utf8]
        exprs = []
        for c in text_cols:
            expr = pl.col(c)
            if config.get("ignore_whitespace"):
                expr = expr.str.strip_chars()
            if config.get("ignore_case"):
                expr = expr.str.to_lowercase()
            exprs.append(expr.alias(c))
        if exprs:
            work = work.with_columns(exprs)

    report = detect_duplicates(work, key_columns or None)

    exact = report.get("exact_rows") or {}
    keys = report.get("keys") or {}
    near = report.get("near_duplicates") or []

    key_extra = int(sum(entry.get("extra_rows", 0) for entry in keys.values()))
    exact_extra = int(exact.get("count", 0))
    near_extra = int(sum(entry.get("count", 0) for entry in near))

    # Build reviewable groups: one entry per duplicated key value, plus whole-row
    # duplicates when no key columns were given.
    groups: list[dict[str, Any]] = []
    for column, entry in keys.items():
        for example in (entry.get("examples") or [])[:50]:
            groups.append(
                {
                    "column": column,
                    "value": example.get("value"),
                    "count": example.get("count"),
                    "row_indices": example.get("row_indices", []),
                    "match": "exact" if not entry.get("compared_normally") else "normalized",
                }
            )
    if not key_columns and exact_extra:
        groups.append(
            {
                "column": None,
                "value": "(identical full rows)",
                "count": exact_extra + 1,
                "row_indices": exact.get("row_indices", []),
                "match": "exact",
            }
        )

    total_extra = key_extra + exact_extra if not key_columns else key_extra

    return {
        "summary": (
            f"Found {len(groups):,} duplicate group(s) covering {total_extra:,} extra row(s) "
            f"out of {df.height:,}"
            + (f", plus {near_extra:,} near-duplicate(s)." if near_extra else ".")
        ),
        "metrics": {
            "row_count": df.height,
            "duplicate_group_count": len(groups),
            "extra_copies": total_extra,
            "exact_duplicate_rows": exact_extra,
            "near_duplicate_count": near_extra,
            "compared_on": key_columns or "all columns",
            "ignore_case": bool(config.get("ignore_case")),
            "ignore_whitespace": bool(config.get("ignore_whitespace")),
        },
        "duplicate_groups": groups[:MAX_ISSUES],
        "exact_duplicate_row_indices": exact.get("row_indices", [])[:MAX_ISSUES],
        "near_duplicates": near[:MAX_ISSUES],
        "columns": _column_facts(df),
        "preview_rows": _preview(df),
        "issues": [
            {
                "severity": "warning",
                "type": "duplicate",
                "message": (
                    f"{g['count']} rows share {g['column']}='{g['value']}'"
                    if g["column"]
                    else f"{g['count']} identical rows"
                ),
                "column": g["column"],
                "row": (g.get("row_indices") or [None])[0],
            }
            for g in groups[:MAX_ISSUES]
        ],
        "output_df": None,
        "output_format": None,
    }


# ── TOOL 05 — Data Validator ────────────────────────────────────────────────


def _run_data_validator(df: pl.DataFrame, config: dict[str, Any]) -> dict[str, Any]:
    required = _resolve_columns(df, config.get("required_columns"), label="Required column")
    numeric = _resolve_columns(df, config.get("numeric_columns"), label="Numeric column")
    emails = _resolve_columns(df, config.get("email_columns"), label="Email column")

    if not (required or numeric or emails):
        raise ValidationError("Choose at least one column to validate.")

    issues: list[dict[str, Any]] = []
    rows_with_errors: set[int] = set()

    for row_idx, row in enumerate(df.iter_rows(named=True)):
        for col in required:
            if _is_blank(row.get(col)):
                rows_with_errors.add(row_idx)
                issues.append(
                    {
                        "severity": "error",
                        "type": "required",
                        "message": f"{col} is required but empty",
                        "column": col,
                        "row": row_idx,
                    }
                )
        for col in numeric:
            value = row.get(col)
            if _is_blank(value):
                continue
            try:
                float(str(value).replace(",", "").replace("$", "").strip())
            except (TypeError, ValueError):
                rows_with_errors.add(row_idx)
                issues.append(
                    {
                        "severity": "error",
                        "type": "type",
                        "message": f"{col} value '{value}' is not numeric",
                        "column": col,
                        "row": row_idx,
                    }
                )
        for col in emails:
            value = row.get(col)
            if _is_blank(value):
                continue
            if not _EMAIL.match(str(value).strip()):
                rows_with_errors.add(row_idx)
                issues.append(
                    {
                        "severity": "warning",
                        "type": "format",
                        "message": f"{col} value '{value}' is not a valid email address",
                        "column": col,
                        "row": row_idx,
                    }
                )
        if len(issues) >= MAX_ISSUES:
            break

    errors = [i for i in issues if i["severity"] == "error"]
    warnings = [i for i in issues if i["severity"] == "warning"]

    return {
        "summary": (
            f"Validated {df.height:,} rows: {len(errors):,} error(s) and "
            f"{len(warnings):,} warning(s) across {len(rows_with_errors):,} row(s)."
        ),
        "metrics": {
            "row_count": df.height,
            "error_count": len(errors),
            "warning_count": len(warnings),
            "rows_with_errors": len(rows_with_errors),
            "rules": {
                "required": required,
                "numeric": numeric,
                "email": emails,
            },
        },
        "errors": errors[:MAX_ISSUES],
        "warnings": warnings[:MAX_ISSUES],
        "issues": issues[:MAX_ISSUES],
        "columns": _column_facts(df),
        "preview_rows": _preview(df),
        "output_df": None,
        "output_format": None,
    }


# ── TOOL 06 — Data Quality Report ───────────────────────────────────────────


def _run_quality_report(df: pl.DataFrame, config: dict[str, Any]) -> dict[str, Any]:
    coerced, schemas = apply_schema(df)
    profile = profile_dataframe(coerced, "tool-run")
    quality = calculate_quality_report(profile, profile["columns"], row_count=coerced.height)
    return {
        "summary": (
            f"Quality {quality['overall_score']:.1f}/100 across {df.height:,} rows "
            f"({quality['total_issues']:,} issue(s) found)."
        ),
        "metrics": {
            "overall_score": quality["overall_score"],
            "completeness_score": quality.get("completeness_score"),
            "validity_score": quality.get("validity_score"),
            "consistency_score": quality.get("consistency_score"),
            "uniqueness_score": quality.get("uniqueness_score"),
            "integrity_score": quality.get("integrity_score"),
            "total_issues": quality["total_issues"],
            "critical_issues": quality.get("critical_issues"),
            "row_count": quality["evaluated_records"],
        },
        "quality": quality,
        "methodology": quality_methodology(),
        "schema": schema_records(schemas),
        "columns": _column_facts(df),
        "preview_rows": _preview(df),
        "issues": _quality_issues(quality),
        "output_df": None,
        "output_format": None,
    }


# ── TOOL 07 — Custom Transformation Builder ─────────────────────────────────


def _run_transformation_builder(df: pl.DataFrame, config: dict[str, Any]) -> dict[str, Any]:
    drop_columns = _resolve_columns(df, config.get("drop_columns"), label="Column")

    raw_rename = config.get("rename_map") or "{}"
    if isinstance(raw_rename, str):
        try:
            rename_map = json.loads(raw_rename) if raw_rename.strip() else {}
        except json.JSONDecodeError as exc:
            raise ValidationError(f"Rename map is not valid JSON: {exc}") from exc
    else:
        rename_map = dict(raw_rename)
    if not isinstance(rename_map, dict):
        raise ValidationError("Rename map must be a JSON object of {old: new}.")
    unknown = [k for k in rename_map if k not in df.columns]
    if unknown:
        raise ValidationError(f"Cannot rename unknown column(s): {', '.join(map(str, unknown))}")

    operations: list[dict[str, Any]] = []
    for old, new in rename_map.items():
        operations.append({"type": "rename_column", "column": old, "parameters": {"new_name": new}})
    for col in drop_columns:
        operations.append({"type": "drop_column", "column": col, "parameters": {}})
    if config.get("trim_all"):
        operations.append({"type": "trim_whitespace", "column": None, "parameters": {}})

    if not operations:
        raise ValidationError("Define at least one transformation.")

    engine = TransformationEngine(df)
    result = engine.execute_operations(operations)
    out = result["df"]

    return {
        "summary": (
            f"Applied {result['ops_applied']} operation(s); "
            f"{result['cells_changed']:,} cells changed, {result['rows_modified']:,} rows touched."
        ),
        "metrics": {
            "operations_requested": len(operations),
            "ops_applied": result["ops_applied"],
            "ops_skipped": result["ops_skipped"],
            "ops_failed": result["ops_failed"],
            "cells_changed": result["cells_changed"],
            "rows_modified": result["rows_modified"],
            "rows_in": df.height,
            "rows_out": out.height,
            "duration_ms": result["duration_ms"],
        },
        "operations_log": result["log"],
        "schema_before": result["schema_before"],
        "schema_after": result["schema_after"],
        "columns": _column_facts(out),
        "preview_rows": _preview(out),
        "issues": [
            {
                "severity": "error",
                "type": "transformation",
                "message": f"{e.get('op')} on {e.get('column') or 'all columns'} failed: {e.get('error')}",
                "column": e.get("column"),
                "row": None,
            }
            for e in result["log"]
            if e.get("status") == "failed"
        ][:MAX_ISSUES],
        "output_df": out,
        "output_format": None,
    }


# ── TOOL 08 — Catalogue Normaliser ──────────────────────────────────────────


def _run_catalogue_normaliser(df: pl.DataFrame, config: dict[str, Any]) -> dict[str, Any]:
    title = _resolve_columns(df, config.get("title_column"), label="Column")
    category = _resolve_columns(df, config.get("category_column"), label="Column")
    brand = _resolve_columns(df, config.get("brand_column"), label="Column")
    price = _resolve_columns(df, config.get("price_column"), label="Column")

    if not (title or category or brand or price):
        raise ValidationError("Choose at least one catalogue column to normalise.")

    out = df
    changes: dict[str, int] = {}

    for cols, fn in (
        (title, _normalise_title),
        (category, _normalise_category_value),
        (brand, _normalise_brand),
    ):
        for col in cols:
            before = out[col].cast(pl.Utf8).fill_null("")
            after = fn(before)
            changed = int((before != after).sum())
            if changed:
                changes[col] = changes.get(col, 0) + changed
            out = out.with_columns(after.alias(col))

    numeric_converted = 0
    for col in price:
        already_numeric = out[col].dtype.is_numeric
        raw = out[col].cast(pl.Utf8).str.replace_all(r"[,$€£¥₹₽₩¢\s]", "")
        converted = raw.cast(pl.Float64, strict=False)
        if not already_numeric:
            numeric_converted += int(converted.is_not_null().sum())
        out = out.with_columns(converted.alias(col))

    # A blank in any mapped catalogue column is a missing product attribute.
    mapped = [c for c in (title + category + brand) if c]
    missing: list[dict[str, Any]] = []
    for idx, row in enumerate(out.iter_rows(named=True)):
        blanks = [c for c in mapped if _is_blank(row.get(c))]
        if blanks:
            missing.append(
                {
                    "severity": "warning",
                    "type": "missing_attribute",
                    "message": f"Missing {'/'.join(blanks)}",
                    "column": ",".join(blanks),
                    "row": idx,
                }
            )
        if len(missing) >= MAX_ISSUES:
            break

    total_changes = sum(changes.values())
    return {
        "summary": (
            f"Normalised {total_changes:,} value(s)"
            + (f" and converted {numeric_converted:,} price(s) to numbers." if numeric_converted else ".")
        ),
        "metrics": {
            "row_count": out.height,
            "cells_changed": total_changes,
            "changes_by_column": changes,
            "prices_converted": numeric_converted,
            "records_with_missing_attributes": len(missing),
        },
        "columns": _column_facts(out),
        "preview_rows": _preview(out),
        "issues": missing[:MAX_ISSUES],
        "output_df": out,
        "output_format": None,
    }


def _normalise_title(series: pl.Series) -> pl.Series:
    return (
        series.str.replace_all(r"\s+", " ").str.strip_chars().str.to_titlecase()
    )


def _normalise_category_value(series: pl.Series) -> pl.Series:
    """Collapse casing and separator variants to one canonical spelling.

    polars cannot apply a Python callable inside an expression, so the canonical
    form is built from string operations only: separators become spaces, runs of
    spaces collapse, then each word is capitalised.
    """
    cleaned = (
        series.str.replace_all(r"[_/]+", " ")
        .str.replace_all(r"\s+", " ")
        .str.strip_chars()
        .str.to_lowercase()
    )
    return cleaned.str.to_titlecase()


def _normalise_brand(series: pl.Series) -> pl.Series:
    return series.str.replace_all(r"\s+", " ").str.strip_chars().str.to_lowercase().str.to_titlecase()


# ── TOOL 09 — SKU & Variant Manager ─────────────────────────────────────────


def _run_sku_manager(df: pl.DataFrame, config: dict[str, Any]) -> dict[str, Any]:
    sku_cols = _resolve_columns(df, config.get("sku_column"), label="SKU column")
    if not sku_cols:
        raise ValidationError("Choose the column that holds the SKU.")
    sku_col = sku_cols[0]
    parent_cols = _resolve_columns(df, config.get("parent_column"), label="Column")
    parent_col = parent_cols[0] if parent_cols else None

    values = df[sku_col].cast(pl.Utf8).fill_null("")
    stripped = values.str.strip_chars()

    duplicates = (
        df.with_columns(stripped.alias(sku_col))
        .filter(pl.col(sku_col) != "")
        .group_by(sku_col)
        .agg(pl.len().alias("count"))
        .filter(pl.col("count") > 1)
        .sort("count", descending=True)
    )
    malformed = df.with_columns(stripped.alias(sku_col)).filter(
        (pl.col(sku_col) != "") & ~pl.col(sku_col).str.contains(_SKU.pattern)
    )
    blank = int((stripped == "").sum())

    variants: dict[str, int] = {}
    if parent_col:
        counts = (
            df.filter(pl.col(parent_col).is_not_null())
            .group_by(parent_col)
            .agg(pl.len().alias("count"))
            .filter(pl.col("count") > 1)
        )
        for row in counts.iter_rows(named=True):
            variants[str(row[parent_col])] = int(row["count"])

    issues: list[dict[str, Any]] = []
    for row in duplicates.head(MAX_ISSUES).iter_rows(named=True):
        issues.append(
            {
                "severity": "error",
                "type": "duplicate_sku",
                "message": f"SKU '{row[sku_col]}' appears {row['count']} times",
                "column": sku_col,
                "row": None,
            }
        )
    for row in malformed.head(MAX_ISSUES).iter_rows(named=True):
        issues.append(
            {
                "severity": "warning",
                "type": "malformed_sku",
                "message": f"SKU '{row[sku_col]}' contains characters outside letters, digits, dot, dash, underscore and slash",
                "column": sku_col,
                "row": None,
            }
        )

    return {
        "summary": (
            f"{df.height:,} row(s) checked: {duplicates.height:,} duplicate SKU(s), "
            f"{malformed.height:,} malformed, {blank:,} blank, {len(variants):,} variant group(s)."
        ),
        "metrics": {
            "row_count": df.height,
            "duplicate_sku_count": duplicates.height,
            "malformed_sku_count": malformed.height,
            "blank_sku_count": blank,
            "variant_group_count": len(variants),
            "sku_column": sku_col,
            "parent_column": parent_col,
        },
        "duplicate_skus": [
            {sku_col: r[sku_col], "count": r["count"]} for r in duplicates.head(MAX_ISSUES).iter_rows(named=True)
        ],
        "malformed_skus": [
            {sku_col: r[sku_col]} for r in malformed.head(MAX_ISSUES).iter_rows(named=True)
        ],
        "variants": variants,
        "columns": _column_facts(df),
        "preview_rows": _preview(df),
        "issues": issues[:MAX_ISSUES],
        "output_df": None,
        "output_format": None,
    }


# ── TOOL 10 — AI Product Enrichment ─────────────────────────────────────────


def _run_ai_enrichment(df: pl.DataFrame, config: dict[str, Any]) -> dict[str, Any]:
    """Suggest copy from the product fields already present.

    Generation is delegated to the AI provider. The tool never writes back: it
    returns one suggestion per row for the user to accept or reject, which is
    what the brief requires of AI output.
    """
    from app.core.config import settings

    title_cols = _resolve_columns(df, config.get("title_column"), label="Column")
    if not title_cols:
        raise ValidationError("Choose the column holding the product name.")
    title_col = title_cols[0]
    attribute_cols = _resolve_columns(df, config.get("attribute_columns"), label="Column")
    limit = int(config.get("row_limit") or 10)
    if limit <= 0:
        raise ValidationError("Row limit must be at least 1.")
    if not settings.GROQ_API_KEY:
        raise ProcessingError(
            "No AI provider is configured on this deployment, so enrichment cannot run. "
            "Set GROQ_API_KEY on the API service and retry."
        )

    subset = df.head(limit)
    prepared: list[tuple[int, str, dict[str, Any]]] = []
    for idx, row in enumerate(subset.iter_rows(named=True)):
        name = row.get(title_col)
        if _is_blank(name):
            continue
        facts = {c: row.get(c) for c in attribute_cols if not _is_blank(row.get(c))}
        prepared.append((idx, str(name), facts))

    if not prepared:
        raise ValidationError(
            f"The first {limit} row(s) have no value in '{title_col}', so there is nothing to enrich."
        )
    return {"_prepared": prepared, "title_col": title_col, "attribute_cols": attribute_cols}


async def _run_ai_enrichment_async(prepared_result: dict[str, Any]) -> dict[str, Any]:
    """Second half of the AI tool: call the provider for each prepared row."""
    from app.ai.base import AIMessage
    from app.ai.factory import get_ai_provider
    from app.core.exceptions import ProcessingError

    prepared = prepared_result["_prepared"]
    title_col = prepared_result["title_col"]
    attribute_cols: list[str] = prepared_result["attribute_cols"]

    try:
        provider = get_ai_provider()
    except Exception as exc:
        raise ProcessingError(f"AI provider is unavailable: {exc}") from exc

    suggestions: list[dict[str, Any]] = []
    failures = 0

    for idx, name, facts in prepared:
        fact_lines = "\n".join(f"- {k}: {v}" for k, v in facts.items()) or "- (no attributes supplied)"
        prompt = (
            "You write concise, factual e-commerce product descriptions.\n"
            "Use ONLY the facts given. Never invent specifications, certifications, "
            "dimensions, materials or claims.\n\n"
            f"Product name: {name}\nKnown facts:\n{fact_lines}\n\n"
            "Write one paragraph of at most 60 words. Plain text, no headings, no bullet points."
        )
        try:
            response = await provider.complete(
                [AIMessage(role="user", content=prompt)], temperature=0.3, max_tokens=300
            )
        except Exception as exc:  # one bad row must not kill the run
            failures += 1
            suggestions.append({"row": idx, "product": name, "ok": False, "error": str(exc)})
            continue

        text = (response.content or "").strip()
        if not text:
            failures += 1
            suggestions.append(
                {"row": idx, "product": name, "ok": False, "error": "The model returned an empty draft."}
            )
            continue
        suggestions.append(
            {
                "row": idx,
                "product": name,
                "ok": True,
                "description": text,
                "grounded_in": list(facts.keys()),
                "model": response.model,
                "latency_ms": response.latency_ms,
            }
        )

    accepted = [s for s in suggestions if s.get("ok")]
    return {
        "summary": (
            f"Drafted {len(accepted)} description(s) from {len(prepared)} row(s)"
            + (f"; {failures} failed." if failures else ".")
        ),
        "metrics": {
            "rows_considered": len(prepared),
            "suggestions": len(accepted),
            "failures": failures,
            "title_column": title_col,
            "attribute_columns": attribute_cols,
            "review_required": True,
        },
        "suggestions": suggestions[:MAX_ISSUES],
        "issues": [
            {
                "severity": "error",
                "type": "ai_generation",
                "message": s.get("error", ""),
                "column": title_col,
                "row": s.get("row"),
            }
            for s in suggestions
            if not s.get("ok")
        ][:MAX_ISSUES],
    }


# ── TOOL 11 — Bulk Exporter ─────────────────────────────────────────────────


def _run_bulk_exporter(df: pl.DataFrame, config: dict[str, Any]) -> dict[str, Any]:
    fmt = str(config.get("output_format") or "csv").lower()
    if fmt not in ("csv", "xlsx", "json"):
        raise ValidationError("Supported export formats are csv, xlsx and json.")

    columns = _resolve_columns(df, config.get("columns"), label="Column")
    limit = int(config.get("row_limit") or 0)
    out = df.select(columns) if columns else df
    if limit > 0:
        out = out.head(limit)

    payload = dataframe_to_bytes(out, fmt)
    return {
        "summary": (
            f"Exported {out.height:,} row(s) and {out.width} column(s) as {fmt.upper()} "
            f"({len(payload):,} bytes)."
        ),
        "metrics": {
            "rows_exported": out.height,
            "columns_exported": out.width,
            "format": fmt,
            "bytes": len(payload),
        },
        "columns": _column_facts(out),
        "preview_rows": _preview(out),
        "issues": [],
        "output_df": out,
        "output_format": fmt,
        "output_bytes": payload,
    }


# ── dispatch table ──────────────────────────────────────────────────────────

RUNNERS: dict[str, Callable[[pl.DataFrame, dict[str, Any]], dict[str, Any]]] = {
    "data-profiler": _run_data_profiler,
    "smart-mapper": _run_smart_mapper,
    "data-cleaner": _run_data_cleaner,
    "duplicate-finder": _run_duplicate_finder,
    "data-validator": _run_data_validator,
    "quality-report": _run_quality_report,
    "transformation-builder": _run_transformation_builder,
    "catalogue-normalizer": _run_catalogue_normaliser,
    "sku-manager": _run_sku_manager,
    "ai-enrichment": _run_ai_enrichment,
    "bulk-exporter": _run_bulk_exporter,
}

# Tools whose runner has a second, async phase.
ASYNC_RUNNERS: dict[str, Callable[[dict[str, Any]], Any]] = {
    "ai-enrichment": _run_ai_enrichment_async,
}


async def run_tool(slug: str, df: pl.DataFrame, config: dict[str, Any]) -> dict[str, Any]:
    """Execute one tool. Raises ValidationError for bad user input."""
    runner = RUNNERS.get(slug)
    if runner is None:
        raise ValidationError(f"Unknown tool: {slug}")
    if df.height == 0:
        raise ValidationError("This dataset has no rows to process.")

    result = runner(df, config or {})

    second = ASYNC_RUNNERS.get(slug)
    if second is not None:
        prepared = result
        result = await second(prepared)
        # Keep the column facts and preview from the first phase.
        result["columns"] = _column_facts(df)
        result["preview_rows"] = _preview(df)

    result.setdefault("output_df", None)
    result.setdefault("output_format", None)
    result.setdefault("issues", [])
    result.setdefault("columns", _column_facts(df))
    result.setdefault("preview_rows", _preview(df))
    result["tool"] = slug
    result["rows_in"] = df.height
    return result


def serialise(result: dict[str, Any]) -> dict[str, Any]:
    """Drop the DataFrame and bytes; the API returns JSON, not pickles."""
    out = {k: v for k, v in result.items() if k not in ("output_df", "output_bytes")}
    out["has_output"] = result.get("output_df") is not None
    return out