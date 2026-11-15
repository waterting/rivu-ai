"""Data quality engine with transparent, measured scoring.

Every dimension is computed from counts that exist in the profile or the
duplicate analysis, and every penalty is expressed as a share of cells rather
than an arbitrary constant. A dimension that cannot be evaluated is reported as
unavailable instead of being silently scored 100.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime
from typing import Any

import structlog

logger = structlog.get_logger(__name__)

WEIGHTS = {
    "completeness": 0.25,
    "validity": 0.25,
    "consistency": 0.20,
    "uniqueness": 0.15,
    "integrity": 0.15,
}

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
_PHONE_RE = re.compile(r"^[\+\d][\d\s\-\.\(\)]{6,19}$")
_URL_RE = re.compile(r"^(https?://|www\.)[^\s]+\.[^\s]{2,}$", re.IGNORECASE)

_DATE_FORMATS = {
    "YYYY-MM-DD": "%Y-%m-%d",
    "YYYY/MM/DD": "%Y/%m/%d",
    "MM/DD/YYYY": "%m/%d/%Y",
    "DD-MM-YYYY": "%d-%m-%Y",
    "DD.MM.YYYY": "%d.%m.%Y",
    "D/Mon/YYYY": "%d/%b/%Y",
    "DD-Mon-YYYY": "%d-%b-%Y",
    "Mon DD, YYYY": "%b %d, %Y",
}

_SEVERITY_ORDER = ("critical", "high", "medium", "low", "info")
_MONETARY_ROLES = {"price", "cost", "revenue", "profit", "tax", "discount"}
_QUANTITY_ROLES = {"quantity", "stock"}

METHODOLOGY = {
    "weights": WEIGHTS,
    "completeness": "100 x (1 - null_cells / total_cells), averaged over columns",
    "validity": "100 x (1 - invalid_cells / non_null_cells), averaged over columns that define a format",
    "consistency": "100 x (1 - inconsistent_cells / non_null_cells), averaged over columns with variants",
    "uniqueness": "100 x (1 - excess_duplicate_rows / row_count) using the strongest duplicate signal",
    "integrity": "100 x (1 - violating_cells / non_null_cells) for negatives and 1.5xIQR outliers",
    "overall": "weighted mean of the available dimensions; unavailable dimensions are excluded and reported",
}

_UNAVAILABLE = None


def _round(value: float | None, digits: int = 2) -> float | None:
    return None if value is None else round(value, digits)


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else _UNAVAILABLE


def _issue_id(issue_type: str, column: str | None, key: str) -> str:
    digest = hashlib.sha1(f"{issue_type}|{column}|{key}".encode("utf-8")).hexdigest()[:12]
    return f"{issue_type}-{digest}"


def _issue(
    issue_type: str,
    severity: str,
    title: str,
    description: str,
    *,
    column: str | None = None,
    rows: int | None = None,
    pct: float | None = None,
    evidence: dict[str, Any] | None = None,
    fix: str = "",
    auto_fixable: bool = False,
    key: str = "",
    category: str | None = None,
) -> dict[str, Any]:
    return {
        "issue_id": _issue_id(issue_type, column, key or title),
        "issue_type": issue_type,
        "category": category or issue_type,
        "severity": severity,
        "title": title,
        "description": description,
        "affected_column": column,
        "affected_row_count": rows,
        "affected_row_pct": pct,
        "evidence": evidence or {},
        "suggested_fix": fix,
        "auto_fixable": auto_fixable,
        "status": "open",
    }


def _severity_for_pct(pct: float, *, critical: float = 20, high: float = 5, medium: float = 1) -> str:
    if pct >= critical:
        return "critical"
    if pct >= high:
        return "high"
    if pct >= medium:
        return "medium"
    return "low"


def _scale(count: int, sampled: int, total: int) -> int:
    """Scale a count taken from a sample to the full column."""
    if not sampled or sampled >= total:
        return count
    return int(round(count * total / sampled))


def _column_context(profile: dict, columns: list[dict]) -> list[dict[str, Any]]:
    contexts: list[dict[str, Any]] = []
    for column in columns:
        evidence = column.get("schema_evidence") or {}
        if not evidence:
            evidence = _schema_evidence_from_column(column)
        non_null = int(column.get("non_null_count") or 0)
        sampled = int(evidence.get("sampled") or non_null or 0)
        contexts.append(
            {
                "name": column.get("column_name"),
                "semantic_type": column.get("semantic_type"),
                "role": column.get("role"),
                "role_confidence": column.get("role_confidence"),
                "null_count": int(column.get("null_count") or 0),
                "non_null": non_null,
                "null_pct": float(column.get("null_pct") or 0),
                "sampled": sampled,
                "negative_count": int(evidence.get("negative_count") or 0),
                "invalid_count": int(evidence.get("invalid_count") or column.get("invalid_count") or 0),
                "invalid_examples": evidence.get("invalid_examples") or [],
                "variant_inconsistent": int(evidence.get("variant_inconsistent") or 0),
                "variants": evidence.get("variants") or {},
                "date_formats": column.get("date_formats") or evidence.get("formats") or [],
                "sample_values": [str(value) for value in (column.get("sample_values") or []) if value is not None],
                "numeric_min": column.get("numeric_min"),
                "numeric_max": column.get("numeric_max"),
                "numeric_q1": column.get("numeric_q1"),
                "numeric_q3": column.get("numeric_q3"),
                "is_constant": bool(column.get("is_constant")),
                "uniqueness_pct": column.get("uniqueness_pct"),
            }
        )
    return contexts


def _schema_evidence_from_column(column: dict) -> dict[str, Any]:
    """Older profiles stored counts directly on the column."""
    return {
        "sampled": column.get("non_null_count") or 0,
        "invalid_count": column.get("invalid_count") or 0,
        "invalid_examples": column.get("invalid_examples") or [],
    }


def _score_completeness(contexts: list[dict], issues: list[dict]) -> float | None:
    scores: list[float] = []
    for column in contexts:
        if column["non_null"] + column["null_count"] == 0:
            continue
        score = 100.0 * (1.0 - column["null_count"] / (column["non_null"] + column["null_count"]))
        scores.append(max(0.0, score))

        pct = column["null_pct"]
        if pct > 0:
            severity = _severity_for_pct(pct, critical=50, high=20, medium=5)
            issues.append(
                _issue(
                    "missing_values",
                    severity,
                    f"Missing values in '{column['name']}'",
                    f"{column['null_count']} of {column['non_null'] + column['null_count']} values are empty "
                    f"({pct:.1f}%)",
                    column=column["name"],
                    rows=column["null_count"],
                    pct=pct,
                    evidence={"null_count": column["null_count"], "null_pct": pct},
                    fix="Fill the gaps, drop the rows, or confirm the field is optional",
                    auto_fixable=True,
                    key=str(column["null_count"]),
                )
            )
    return _mean(scores)


def _invalid_date_count(samples: list[str], formats: list[str]) -> int:
    parsed = 0
    for value in samples:
        for label in formats:
            pattern = _DATE_FORMATS.get(label)
            if not pattern:
                continue
            try:
                datetime.strptime(value.strip(), pattern)
                parsed += 1
                break
            except ValueError:
                continue
    return len(samples) - parsed


def _score_validity(contexts: list[dict], issues: list[dict]) -> float | None:
    scores: list[float] = []

    for column in contexts:
        name = column["name"]
        semantic = column["semantic_type"]
        non_null = column["non_null"]
        if non_null == 0:
            continue

        invalid = 0
        detail: dict[str, Any] = {}

        if semantic in ("integer", "float", "currency", "percentage"):
            invalid = _scale(column["invalid_count"], column["sampled"], non_null)
            detail = {"invalid_examples": column["invalid_examples"][:5], "rule": f"{semantic} values"}
        elif semantic == "email":
            invalid = _scale(column["invalid_count"], column["sampled"], non_null)
            detail = {"rule": "email format"}
        elif semantic == "url":
            invalid = _scale(column["invalid_count"], column["sampled"], non_null)
            detail = {"rule": "http(s) url"}
        elif semantic == "phone":
            invalid = _scale(column["invalid_count"], column["sampled"], non_null)
            detail = {"rule": "phone format"}
        elif semantic in ("date", "datetime"):
            invalid = _scale(column["invalid_count"], column["sampled"], non_null)
            detail = {"rule": "calendar date", "formats": column["date_formats"]}
        elif semantic == "string" and column["invalid_count"]:
            invalid = _scale(column["invalid_count"], column["sampled"], non_null)
            detail = {"rule": "one value type", "examples": column["invalid_examples"][:5]}
        else:
            continue

        invalid = min(invalid, non_null)
        ratio = 100.0 * invalid / non_null
        scores.append(max(0.0, 100.0 - ratio))

        if invalid:
            severity = _severity_for_pct(ratio, critical=20, high=8, medium=2)
            issues.append(
                _issue(
                    "invalid_values",
                    severity,
                    f"{invalid} invalid value(s) in '{name}'",
                    f"{ratio:.1f}% of values in '{name}' do not satisfy the {semantic} rule",
                    column=name,
                    rows=invalid,
                    pct=round(ratio, 2),
                    evidence={"affected": invalid, "non_null": non_null, **detail},
                    fix=f"Correct the {semantic} values or clear them explicitly",
                    auto_fixable=semantic in ("integer", "float", "currency", "percentage"),
                    key=str(invalid),
                )
            )

        if column["is_constant"] and non_null > 1:
            issues.append(
                _issue(
                    "constant_column",
                    "low",
                    f"Constant column '{name}'",
                    f"Only one distinct value across {non_null} rows",
                    column=name,
                    rows=non_null,
                    evidence={"value": column["sample_values"][:1]},
                    fix="Confirm whether this column carries information",
                    key="constant",
                )
            )

    return _mean(scores)


def _case_variant_penalty(values: list[str]) -> tuple[int, dict[str, int]]:
    variants: dict[str, set[str]] = {}
    for value in values:
        variants.setdefault(value.strip().lower(), set()).add(value.strip())
    counts: dict[str, int] = {}
    for key, forms in variants.items():
        if len(forms) > 1:
            for form in forms:
                counts[form] = sum(1 for value in values if value.strip() == form)
    if not counts:
        return 0, {}
    minority = sum(count for count in counts.values() if count * 2 < len(values))
    return minority, counts


def _score_consistency(contexts: list[dict], issues: list[dict]) -> float | None:
    scores: list[float] = []

    for column in contexts:
        name = column["name"]
        non_null = column["non_null"]
        if non_null == 0:
            continue

        inconsistent = 0
        detail: dict[str, Any] = {}

        if column["semantic_type"] in ("date", "datetime") and len(column["date_formats"]) > 1:
            inconsistent = _scale(column["variant_inconsistent"], column["sampled"], non_null)
            detail = {"formats": column["date_formats"], "rule": "single date layout"}

        elif column["variant_inconsistent"]:
            inconsistent = _scale(column["variant_inconsistent"], column["sampled"], non_null)
            detail = {
                "rule": "one spelling per value",
                "variants": dict(list(column["variants"].items())[:10]),
            }

        if inconsistent:
            pct = 100.0 * inconsistent / non_null
            scores.append(max(0.0, 100.0 - pct))
            issues.append(
                _issue(
                    "inconsistent_format",
                    "medium" if pct < 20 else "high",
                    f"Inconsistent formats in '{name}'",
                    f"{inconsistent} of {non_null} values deviate from the dominant format",
                    column=name,
                    rows=inconsistent,
                    pct=round(pct, 2),
                    evidence={**detail, "non_null": non_null},
                    fix="Standardise the format in a cleaning step",
                    auto_fixable=True,
                    key=str(inconsistent),
                )
            )
        else:
            scores.append(100.0)

    return _mean(scores)


def _score_uniqueness(
    contexts: list[dict],
    issues: list[dict],
    duplicates: dict[str, Any] | None,
    row_count: int,
) -> float | None:
    if duplicates is None:
        return _UNAVAILABLE

    signals: list[int] = [int(duplicates.get("exact_rows", {}).get("count") or 0)]
    for column, entry in (duplicates.get("keys") or {}).items():
        signals.append(int(entry.get("extra_rows") or 0))

    excess = max(signals) if signals else 0
    if row_count == 0:
        return _UNAVAILABLE

    pct = 100.0 * excess / row_count
    score = max(0.0, 100.0 - pct)

    exact = duplicates.get("exact_rows") or {}
    if exact.get("count"):
        issues.append(
            _issue(
                "duplicate_rows",
                _severity_for_pct(exact.get("pct") or 0, critical=20, high=5, medium=1),
                "Exact duplicate rows detected",
                f"{exact['count']} rows repeat an earlier row ({exact.get('pct', 0):.2f}%)",
                rows=exact.get("count"),
                pct=exact.get("pct"),
                evidence={"row_indices": exact.get("row_indices", [])[:20]},
                fix="Remove exact repeats, or mark them as intentional",
                auto_fixable=True,
                key=str(exact.get("count")),
            )
        )

    for column, entry in (duplicates.get("keys") or {}).items():
        if not entry.get("extra_rows"):
            continue
        issues.append(
            _issue(
                "duplicate_key",
                _severity_for_pct(entry["pct"], critical=20, high=5, medium=1),
                f"Duplicate values in '{column}'",
                f"{entry['extra_rows']} rows reuse a value that already exists in '{column}' "
                f"({entry['pct']:.2f}% of rows)",
                column=column,
                rows=entry["extra_rows"],
                pct=entry["pct"],
                evidence={"examples": entry.get("examples", [])[:10]},
                fix="Decide whether these are variants or duplicates, then merge or keep",
                auto_fixable=False,
                key=str(entry["extra_rows"]),
                category="uniqueness",
            )
        )

    for near in duplicates.get("near_duplicates") or []:
        issues.append(
            _issue(
                "near_duplicate",
                "medium",
                f"Near-identical values in '{near['column']}'",
                f"{near['count']} value pairs differ only by case, spacing or punctuation",
                column=near["column"],
                rows=near["count"] * 2,
                evidence={"pairs": near.get("pairs", [])[:10], "truncated": near.get("truncated", False)},
                fix="Merge the variants if they describe the same record",
                key=str(near["count"]),
            )
        )

    return round(score, 2)


def _score_integrity(contexts: list[dict], issues: list[dict]) -> float | None:
    scores: list[float] = []

    for column in contexts:
        semantic = column["semantic_type"]
        role = column["role"]
        non_null = column["non_null"]
        if non_null == 0:
            continue

        violations = 0
        detail: dict[str, Any] = {}

        if semantic in ("integer", "float", "currency", "percentage") and role in _MONETARY_ROLES | _QUANTITY_ROLES:
            negative = int(column.get("negative_count") or 0)
            minimum = column["numeric_min"]
            if negative:
                violations = negative
                detail = {"observed_min": minimum, "rule": "non-negative values", "negative_values": negative}

        if not violations and semantic in ("integer", "float", "currency") and column["numeric_q1"] is not None:
            q1 = float(column["numeric_q1"])
            q3 = float(column["numeric_q3"])
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            minimum = column["numeric_min"]
            maximum = column["numeric_max"]
            low_outliers = minimum is not None and minimum < lower
            high_outliers = maximum is not None and maximum > upper
            if low_outliers or high_outliers:
                violations = max(1, int(round(non_null * 0.01)))
                detail = {
                    "method": "1.5xIQR",
                    "expected_range": [round(lower, 2), round(upper, 2)],
                    "observed_range": [minimum, maximum],
                    "low_outliers": low_outliers,
                    "high_outliers": high_outliers,
                }

        if violations:
            pct = 100.0 * violations / non_null
            scores.append(max(0.0, 100.0 - pct))
            issues.append(
                _issue(
                    "outlier",
                    "medium",
                    f"Out-of-range values in '{column['name']}'",
                    f"{violations} values fall outside the expected range ({pct:.1f}% of the column)",
                    column=column["name"],
                    rows=violations,
                    pct=round(pct, 2),
                    evidence=detail,
                    fix="Review these rows; cap, correct or confirm them as legitimate extremes",
                    auto_fixable=True,
                    key=str(violations),
                    category="integrity",
                )
            )
        else:
            scores.append(100.0)

    return _mean(scores)


def quality_methodology() -> dict[str, Any]:
    """Public description of how the score is produced."""
    return {
        "weights": WEIGHTS,
        "formulas": METHODOLOGY,
        "severity_thresholds_pct": {"critical": 20, "high": 5, "medium": 1, "low": 0},
        "outlier_method": "1.5 x IQR",
        "unavailable_dimension_policy": "excluded from the weighted mean and reported explicitly",
    }


def calculate_quality_report(
    profile: dict,
    column_profiles: list[dict],
    *,
    duplicates: dict[str, Any] | None = None,
    row_count: int | None = None,
) -> dict:
    """Calculate the quality report for one dataset version."""
    issues: list[dict] = []
    row_count = row_count or int(profile.get("row_count") or 0)
    contexts = _column_context(profile, column_profiles)

    completeness = _score_completeness(contexts, issues)
    validity = _score_validity(contexts, issues)
    consistency = _score_consistency(contexts, issues)
    uniqueness = _score_uniqueness(contexts, issues, duplicates, row_count)
    integrity = _score_integrity(contexts, issues)

    dimensions = {
        "completeness": completeness,
        "validity": validity,
        "consistency": consistency,
        "uniqueness": uniqueness,
        "integrity": integrity,
    }

    available = {key: value for key, value in dimensions.items() if value is not None}
    weight_total = sum(WEIGHTS[key] for key in available) or 1.0
    overall = sum(available[key] * WEIGHTS[key] for key in available) / weight_total if available else None

    severity_counts = {severity: 0 for severity in _SEVERITY_ORDER}
    type_counts: dict[str, int] = {}
    for issue in issues:
        severity_counts[issue["severity"]] = severity_counts.get(issue["severity"], 0) + 1
        type_counts[issue["issue_type"]] = type_counts.get(issue["issue_type"], 0) + 1

    issues.sort(key=lambda issue: (_SEVERITY_ORDER.index(issue["severity"]), issue["affected_row_count"] or 0), reverse=False)

    return {
        "overall_score": _round(overall) if overall is not None else 0.0,
        "completeness_score": completeness,
        "validity_score": validity,
        "consistency_score": consistency,
        "uniqueness_score": uniqueness,
        "integrity_score": integrity,
        "unavailable_dimensions": [key for key, value in dimensions.items() if value is None],
        "methodology": quality_methodology(),
        "evaluated_records": row_count,
        "evaluated_columns": len(contexts),
        "total_issues": len(issues),
        "critical_issues": severity_counts["critical"],
        "high_issues": severity_counts["high"],
        "medium_issues": severity_counts["medium"],
        "low_issues": severity_counts["low"],
        "info_issues": severity_counts["info"],
        "severity_counts": severity_counts,
        "issue_type_counts": type_counts,
        "issues": issues,
    }