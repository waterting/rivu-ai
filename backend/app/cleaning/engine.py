"""
Deterministic Cleaning Engine — executes approved transformation operations.

CRITICAL: The LLM NEVER runs here. This engine only executes operations
from the approved allowlist using pure Python/Polars transformations.

Preserves original data — always creates a new version.
"""

import re
import hashlib
import time
from datetime import datetime
from typing import Any
import polars as pl
import structlog

from app.core.exceptions import ProcessingError

logger = structlog.get_logger(__name__)

# Date format strftime patterns for parsing
_DATE_FORMAT_MAP = {
    "YYYY-MM-DD": "%Y-%m-%d",
    "MM/DD/YYYY": "%m/%d/%Y",
    "DD-MM-YYYY": "%d-%m-%Y",
    "MM/DD/YY": "%m/%d/%y",
    "YYYY/MM/DD": "%Y/%m/%d",
    "DD-Mon-YYYY": "%d-%b-%Y",
    "Mon DD, YYYY": "%b %d, %Y",
}

TARGET_DATE_FORMAT = "%Y-%m-%d"
TARGET_DATETIME_FORMAT = "%Y-%m-%dT%H:%M:%S"


_NULL_SENTINEL = "<rivu-null>"


class TransformationEngine:
    """
    Executes a list of transformation operations on a Polars DataFrame.
    Each operation is deterministic and isolated.
    """

    def __init__(self, df: pl.DataFrame):
        self._df = df.clone()  # never mutate original
        self._original_schema = dict(df.schema)
        self._log: list[dict] = []
        self._modified_columns: set[str] = set()
        self._type_changing_ops = {
            "standardize_date", "standardize_datetime", "coerce_numeric",
            "coerce_boolean", "normalize_currency", "normalize_phone",
            "normalize_email", "normalize_category",
        }

    def _diff(self, before: pl.DataFrame, column: str | None) -> dict:
        """Measure what one operation actually changed."""
        after = self._df
        info = {
            "changed_rows": 0,
            "changed_cells": 0,
            "rows_removed": max(0, before.height - after.height),
            "rows_added": max(0, after.height - before.height),
        }
        if column and column in before.columns and column in after.columns and before.height == after.height:
            before_values = before[column].cast(pl.Utf8).fill_null(_NULL_SENTINEL)
            after_values = after[column].cast(pl.Utf8).fill_null(_NULL_SENTINEL)
            changed = int((before_values != after_values).sum())
            info["changed_cells"] = changed
            info["changed_rows"] = changed
        return info

    def execute_operations(self, operations: list[dict]) -> dict:
        """
        Execute all approved operations and return results.
        Returns: {df, log, rows_modified, cells_changed, ops_applied, ops_skipped, ops_failed}
        """
        start = time.perf_counter()
        ops_applied = 0
        ops_skipped = 0
        ops_failed = 0
        rows_modified = 0
        cells_changed = 0

        for op in operations:
            op_type = op.get("type", "")
            column = op.get("column")
            params = op.get("parameters") or {}
            before = self._df

            try:
                result = self._execute_single(op_type, column, params, op)
                diff = self._diff(before, column)
                rows_modified += diff["changed_rows"] + diff["rows_removed"]
                cells_changed += diff["changed_cells"]
                if result.get("applied"):
                    ops_applied += 1
                    if column:
                        self._modified_columns.add(column)
                else:
                    ops_skipped += 1
                self._log.append({**result, **diff, "op": op_type, "column": column, "status": "ok"})
            except Exception as e:
                ops_failed += 1
                logger.error("transform_op_failed", op=op_type, col=column, error=str(e))
                self._log.append({
                    "op": op_type, "column": column, "status": "failed",
                    "error": str(e), "applied": False,
                    "changed_rows": 0, "changed_cells": 0, "rows_removed": 0, "rows_added": 0,
                })

        self._restore_safe_schema()
        duration_ms = round((time.perf_counter() - start) * 1000)
        logger.info(
            "transformation_complete",
            applied=ops_applied, skipped=ops_skipped, failed=ops_failed, ms=duration_ms
        )

        return {
            "df": self._df,
            "log": self._log,
            "rows_modified": rows_modified,
            "cells_changed": cells_changed,
            "ops_applied": ops_applied,
            "ops_skipped": ops_skipped,
            "ops_failed": ops_failed,
            "duration_ms": duration_ms,
            "schema_before": {name: str(dtype) for name, dtype in self._original_schema.items()},
            "schema_after": {name: str(dtype) for name, dtype in self._df.schema.items()},
        }

    def _restore_safe_schema(self) -> None:
        changed = {e.get("column") for e in self._log if e.get("status") == "ok" and e.get("applied") and e.get("op") in self._type_changing_ops}
        for name, dtype in self._original_schema.items():
            if name not in self._df.columns or name in changed or self._df.schema.get(name) == dtype:
                continue
            try:
                self._df = self._df.with_columns(pl.col(name).cast(dtype, strict=False).alias(name))
            except Exception:
                logger.warning("schema_restore_skipped", column=name, target_dtype=str(dtype))

    def _execute_single(self, op_type: str, column: str | None, params: dict, op: dict) -> dict:
        """Dispatch to the correct transformation function."""
        dispatch = {
            "trim_whitespace": self._trim_whitespace,
            "normalize_whitespace": self._normalize_whitespace,
            "lowercase": self._lowercase,
            "uppercase": self._uppercase,
            "title_case": self._title_case,
            "standardize_date": self._standardize_date,
            "standardize_datetime": self._standardize_datetime,
            "coerce_numeric": self._coerce_numeric,
            "coerce_boolean": self._coerce_boolean,
            "normalize_currency": self._normalize_currency,
            "normalize_phone": self._normalize_phone,
            "normalize_email": self._normalize_email,
            "normalize_category": self._normalize_category,
            "fill_null": self._fill_null,
            "drop_nulls": self._drop_nulls,
            "remove_duplicates": self._remove_duplicates,
            "flag_duplicates": self._flag_duplicates,
            "flag_outliers": self._flag_outliers,
            "replace_value": self._replace_value,
            "regex_replace": self._regex_replace,
            "clip_numeric": self._clip_numeric,
            "drop_column": self._drop_column,
            "rename_column": self._rename_column,
        }

        fn = dispatch.get(op_type)
        if fn is None:
            return {"applied": False, "message": f"Unknown operation: {op_type}"}

        return fn(column, params)

    def _require_column(self, column: str | None) -> str:
        if not column:
            raise ProcessingError("This operation requires a column name")
        if column not in self._df.columns:
            raise ProcessingError(f"Column '{column}' not found in dataset")
        return column

    # ── String operations ─────────────────────

    def _trim_whitespace(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        self._df = self._df.with_columns(
            pl.col(col).cast(pl.Utf8).str.strip_chars().alias(col)
        )
        return {"applied": True, "message": f"Trimmed whitespace from '{col}'"}

    def _normalize_whitespace(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        self._df = self._df.with_columns(
            pl.col(col).cast(pl.Utf8).str.replace_all(r"\s+", " ").str.strip_chars().alias(col)
        )
        return {"applied": True, "message": f"Normalized whitespace in '{col}'"}

    def _lowercase(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        self._df = self._df.with_columns(
            pl.col(col).cast(pl.Utf8).str.to_lowercase().alias(col)
        )
        return {"applied": True, "message": f"Converted '{col}' to lowercase"}

    def _uppercase(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        self._df = self._df.with_columns(
            pl.col(col).cast(pl.Utf8).str.to_uppercase().alias(col)
        )
        return {"applied": True, "message": f"Converted '{col}' to uppercase"}

    def _title_case(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        # Polars doesn't have native title case; use Python map
        vals = self._df[col].cast(pl.Utf8).to_list()
        titled = [v.title() if v is not None else None for v in vals]
        self._df = self._df.with_columns(pl.Series(col, titled))
        return {"applied": True, "message": f"Converted '{col}' to title case"}

    # ── Date operations ───────────────────────

    def _standardize_date(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        target_fmt = params.get("target_format", "YYYY-MM-DD")

        vals = self._df[col].cast(pl.Utf8).to_list()
        standardized = [_parse_date_flexible(v) for v in vals]
        parsed = []
        for value in standardized:
            try:
                parsed.append(datetime.strptime(value, TARGET_DATE_FORMAT).date() if value else None)
            except Exception:
                parsed.append(None)
        self._df = self._df.with_columns(pl.Series(col, parsed, dtype=pl.Date))
        return {"applied": True, "message": f"Standardized dates in '{col}' to ISO 8601"}

    def _standardize_datetime(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        vals = self._df[col].cast(pl.Utf8).to_list()
        standardized = [_parse_datetime_flexible(v) for v in vals]
        parsed = []
        for value in standardized:
            try:
                parsed.append(datetime.strptime(value, TARGET_DATETIME_FORMAT) if value else None)
            except Exception:
                parsed.append(None)
        self._df = self._df.with_columns(pl.Series(col, parsed, dtype=pl.Datetime))
        return {"applied": True, "message": f"Standardized datetimes in '{col}'"}

    # ── Numeric operations ────────────────────

    def _coerce_numeric(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        vals = self._df[col].cast(pl.Utf8).to_list()
        numeric = [_parse_numeric(v) for v in vals]
        original = self._original_schema.get(col)
        target = pl.Float64
        if original in {pl.Int8, pl.Int16, pl.Int32, pl.Int64, pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64} and all(v is None or float(v).is_integer() for v in numeric):
            target = original
        self._df = self._df.with_columns(pl.Series(col, numeric, dtype=target))
        return {"applied": True, "message": f"Coerced '{col}' to numeric"}

    def _normalize_currency(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        vals = self._df[col].cast(pl.Utf8).to_list()
        normalized = [_clean_currency(v) for v in vals]
        self._df = self._df.with_columns(pl.Series(col, normalized, dtype=pl.Float64))
        return {"applied": True, "message": f"Normalized currency in '{col}'"}

    def _coerce_boolean(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        vals = self._df[col].cast(pl.Utf8).to_list()
        booleans = [_parse_boolean(v) for v in vals]
        self._df = self._df.with_columns(pl.Series(col, booleans, dtype=pl.Boolean))
        return {"applied": True, "message": f"Coerced '{col}' to boolean"}

    def _clip_numeric(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        low = params.get("min")
        high = params.get("max")
        original_dtype = self._df.schema.get(col)
        expr = pl.col(col).cast(pl.Float64)
        if low is not None:
            expr = expr.clip(lower_bound=float(low))
        if high is not None:
            expr = expr.clip(upper_bound=float(high))
        self._df = self._df.with_columns(expr.alias(col))
        if original_dtype is not None and original_dtype.is_numeric():
            self._df = self._df.with_columns(pl.col(col).cast(original_dtype, strict=False).alias(col))
        return {"applied": True, "message": f"Clipped '{col}' to [{low}, {high}]"}

    # ── Contact normalization ─────────────────

    def _normalize_phone(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        vals = self._df[col].cast(pl.Utf8).to_list()
        normalized = [_normalize_phone_value(v) for v in vals]
        self._df = self._df.with_columns(pl.Series(col, normalized, dtype=pl.Utf8))
        return {"applied": True, "message": f"Normalized phone numbers in '{col}'"}

    def _normalize_email(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        self._df = self._df.with_columns(
            pl.col(col).cast(pl.Utf8).str.to_lowercase().str.strip_chars().alias(col)
        )
        return {"applied": True, "message": f"Normalized emails in '{col}'"}

    def _normalize_category(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        strategy = params.get("strategy", "title_case")
        if strategy == "lowercase":
            self._df = self._df.with_columns(
                pl.col(col).cast(pl.Utf8).str.to_lowercase().str.strip_chars().alias(col)
            )
        else:
            vals = self._df[col].cast(pl.Utf8).to_list()
            normalized = [v.title().strip() if v else v for v in vals]
            self._df = self._df.with_columns(pl.Series(col, normalized, dtype=pl.Utf8))
        return {"applied": True, "message": f"Normalized categories in '{col}'"}

    # ── Null handling ─────────────────────────

    def _fill_null(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        strategy = params.get("strategy", "empty_string")
        fill_value = params.get("fill_value")

        if fill_value is not None:
            self._df = self._df.with_columns(pl.col(col).fill_null(fill_value))
        elif strategy == "mean":
            try:
                mean_val = self._df[col].cast(pl.Float64).mean()
                self._df = self._df.with_columns(pl.col(col).fill_null(mean_val))
            except Exception:
                self._df = self._df.with_columns(pl.col(col).fill_null(""))
        elif strategy == "median":
            try:
                median_val = self._df[col].cast(pl.Float64).median()
                self._df = self._df.with_columns(pl.col(col).fill_null(median_val))
            except Exception:
                self._df = self._df.with_columns(pl.col(col).fill_null(""))
        elif strategy == "mode":
            try:
                mode_val = self._df[col].drop_nulls().mode()[0]
                self._df = self._df.with_columns(pl.col(col).fill_null(mode_val))
            except Exception:
                self._df = self._df.with_columns(pl.col(col).fill_null(""))
        else:
            self._df = self._df.with_columns(pl.col(col).fill_null(""))

        return {"applied": True, "message": f"Filled nulls in '{col}' using strategy '{strategy}'"}

    def _drop_nulls(self, column: str | None, params: dict) -> dict:
        original_rows = self._df.height
        if column:
            self._df = self._df.drop_nulls(subset=[column])
        else:
            self._df = self._df.drop_nulls()
        dropped = original_rows - self._df.height
        return {"applied": True, "message": f"Dropped {dropped} null rows"}

    # ── Duplicate handling ────────────────────

    def _remove_duplicates(self, column: str | None, params: dict) -> dict:
        original_rows = self._df.height
        subset = [column] if column else None
        self._df = self._df.unique(subset=subset, keep="first", maintain_order=True)
        removed = original_rows - self._df.height
        return {"applied": True, "message": f"Removed {removed} duplicate rows"}

    def _flag_duplicates(self, column: str | None, params: dict) -> dict:
        flag_col = params.get("flag_column", "is_duplicate")
        subset = [column] if column else None
        # Mark duplicates as True
        if subset:
            dup_flags = self._df.select(pl.col(column).is_duplicated().alias(flag_col))
        else:
            dup_flags = self._df.select(pl.all().is_duplicated().all(horizontal=True).alias(flag_col))
        self._df = self._df.with_columns(dup_flags[flag_col])
        return {"applied": True, "message": f"Added duplicate flag column '{flag_col}'"}

    # ── Outlier flagging ──────────────────────

    def _flag_outliers(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        flag_col = params.get("flag_column", f"{col}_is_outlier")
        try:
            numeric = self._df[col].cast(pl.Float64)
            q1 = numeric.quantile(0.25, interpolation="nearest")
            q3 = numeric.quantile(0.75, interpolation="nearest")
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            self._df = self._df.with_columns(
                ((pl.col(col).cast(pl.Float64) < lower) | (pl.col(col).cast(pl.Float64) > upper))
                .alias(flag_col)
            )
            return {"applied": True, "message": f"Flagged outliers in '{col}' as '{flag_col}'"}
        except Exception as e:
            return {"applied": False, "message": f"Could not flag outliers: {e}"}

    # ── Value replacement ─────────────────────

    def _regex_replace(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        pattern = params.get("pattern")
        replacement = params.get("replacement", "")
        if not isinstance(pattern, str) or not pattern:
            return {"applied": False, "message": "regex_replace requires a non-empty pattern"}
        try:
            self._df = self._df.with_columns(
                pl.col(col).cast(pl.Utf8).str.replace_all(pattern, str(replacement)).alias(col)
            )
        except Exception as exc:
            raise ProcessingError(f"Invalid regex for '{col}': {exc}") from exc
        return {"applied": True, "message": f"Applied regex replacement in '{col}'"}

    def _replace_value(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        old = params.get("old_value", "")
        new = params.get("new_value", "")
        self._df = self._df.with_columns(
            pl.col(col).cast(pl.Utf8).str.replace_all(str(old), str(new), literal=True).alias(col)
        )
        return {"applied": True, "message": f"Replaced '{old}' with '{new}' in '{col}'"}

    # ── Column operations ─────────────────────

    def _drop_column(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        self._df = self._df.drop(col)
        return {"applied": True, "message": f"Dropped column '{col}'"}

    def _rename_column(self, column: str | None, params: dict) -> dict:
        col = self._require_column(column)
        new_name = params.get("new_name")
        if not new_name:
            return {"applied": False, "message": "rename_column requires 'new_name' parameter"}
        self._df = self._df.rename({col: new_name})
        return {"applied": True, "message": f"Renamed '{col}' to '{new_name}'"}


# ── Helper functions ──────────────────────────

def _parse_date_flexible(value: str | None) -> str | None:
    """Try to parse a date string into ISO 8601."""
    if value is None or str(value).strip() in ("", "nan", "None", "null"):
        return None
    value = str(value).strip()
    import dateutil.parser
    try:
        dt = dateutil.parser.parse(value, dayfirst=False)
        return dt.strftime(TARGET_DATE_FORMAT)
    except Exception:
        return value  # return as-is if unparseable


def _parse_datetime_flexible(value: str | None) -> str | None:
    if value is None or str(value).strip() in ("", "nan", "None", "null"):
        return None
    import dateutil.parser
    try:
        dt = dateutil.parser.parse(str(value).strip())
        return dt.strftime(TARGET_DATETIME_FORMAT)
    except Exception:
        return str(value)


def _parse_numeric(value: str | None) -> float | None:
    if value is None or str(value).strip() in ("", "nan", "None", "null"):
        return None
    cleaned = re.sub(r"[,$€£¥₹\s%]", "", str(value).strip())
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return None


def _clean_currency(value: str | None) -> float | None:
    if value is None:
        return None
    return _parse_numeric(value)


def _parse_boolean(value: str | None) -> bool | None:
    if value is None:
        return None
    v = str(value).strip().lower()
    if v in ("true", "yes", "y", "1", "t"):
        return True
    if v in ("false", "no", "n", "0", "f"):
        return False
    return None


def _normalize_phone_value(value: str | None) -> str | None:
    if value is None:
        return None
    # Remove everything except digits and leading +
    cleaned = re.sub(r"[^\d+]", "", str(value).strip())
    if not cleaned:
        return None
    return cleaned


OPERATION_RULES = {
    "trim_whitespace": "Strip leading and trailing whitespace",
    "normalize_whitespace": "Collapse repeated spaces and trim",
    "lowercase": "Convert text to lowercase",
    "uppercase": "Convert text to uppercase",
    "title_case": "Convert text to title case",
    "standardize_date": "Rewrite dates as ISO YYYY-MM-DD",
    "standardize_datetime": "Rewrite timestamps as ISO 8601",
    "coerce_numeric": "Convert numeric text to numbers",
    "coerce_boolean": "Convert yes/no/1/0 text to booleans",
    "normalize_currency": "Rewrite amounts as plain decimals",
    "normalize_phone": "Rewrite phone numbers to E.164",
    "normalize_email": "Trim and lowercase email addresses",
    "normalize_category": "Standardise category spelling and case",
    "fill_null": "Replace missing values with a chosen value",
    "drop_nulls": "Remove rows with missing values in the column",
    "remove_duplicates": "Remove repeated rows",
    "flag_duplicates": "Add a column marking repeated rows",
    "flag_outliers": "Add a column marking statistical outliers",
    "replace_value": "Replace one value with another",
    "regex_replace": "Replace values matching a pattern",
    "clip_numeric": "Cap values to a configured range",
    "drop_column": "Remove the column from the dataset",
    "rename_column": "Rename the column",
}

HIGH_RISK_OPERATIONS = {
    "drop_column", "remove_duplicates", "drop_nulls", "fill_null", "clip_numeric",
}
MEDIUM_RISK_OPERATIONS = {
    "standardize_date", "standardize_datetime", "coerce_numeric", "coerce_boolean",
    "normalize_currency", "normalize_phone", "normalize_email", "normalize_category",
    "replace_value", "regex_replace",
}


def _risk_for(op_type: str) -> str:
    if op_type in HIGH_RISK_OPERATIONS:
        return "high"
    if op_type in MEDIUM_RISK_OPERATIONS:
        return "medium"
    return "low"


def generate_transformation_preview(
    df: pl.DataFrame,
    operations: list[dict],
    preview_rows: int = 5,
) -> list[dict]:
    """
    Generate before/after preview for each operation without modifying the original.

    Each preview reports the operation's rule, how many rows and cells it would
    change, the affected columns, its risk level and representative samples so a
    user can approve or reject it with evidence.
    """
    previews = []
    for op in operations:
        op_type = op.get("type", "")
        col = op.get("column")
        base = {
            "op": op_type,
            "rule": OPERATION_RULES.get(op_type, "Custom operation"),
            "risk": _risk_for(op_type),
            "column": col,
            "affected_columns": [col] if col else [],
            "parameters": op.get("parameters") or {},
            "reason": op.get("reason", ""),
            "confidence": op.get("confidence", 0.8),
        }

        if not col or col not in df.columns:
            previews.append({
                **base,
                "before": [],
                "after": [],
                "samples": [],
                "changed_rows": 0,
                "changed_cells": 0,
                "rows_removed": 0,
                "changed": False,
                "preview_available": False,
                "note": "Column not found in this version",
            })
            continue

        before_series = df[col].cast(pl.Utf8).fill_null(_NULL_SENTINEL)
        try:
            result = TransformationEngine(df).execute_operations([op])
            output = result["df"]
            entry = result["log"][0] if result["log"] else {}
            if col in output.columns:
                after_series = output[col].cast(pl.Utf8).fill_null(_NULL_SENTINEL)
                changed_rows = entry.get("changed_rows", 0) or 0
            else:
                after_series = None
                changed_rows = int(before_series.is_not_null().sum()) if op_type == "drop_column" else 0
        except Exception as error:
            previews.append({
                **base,
                "before": [],
                "after": [],
                "samples": [],
                "changed_rows": 0,
                "changed_cells": 0,
                "rows_removed": 0,
                "changed": False,
                "preview_available": False,
                "note": f"Preview failed: {error}",
            })
            continue

        samples: list[dict[str, Any]] = []
        if after_series is not None and len(before_series) == len(after_series):
            difference = (before_series != after_series)
            changed_indices = [i for i, flag in enumerate(difference.to_list()) if flag]
            for index in changed_indices[:preview_rows]:
                samples.append({
                    "row": index,
                    "before": None if before_series[index] == _NULL_SENTINEL else before_series[index],
                    "after": None if after_series[index] == _NULL_SENTINEL else after_series[index],
                })
            if not changed_indices:
                for index in range(min(preview_rows, len(before_series))):
                    samples.append({
                        "row": index,
                        "before": None if before_series[index] == _NULL_SENTINEL else before_series[index],
                        "after": None if after_series[index] == _NULL_SENTINEL else after_series[index],
                    })
        elif after_series is None:
            for index in range(min(preview_rows, len(before_series))):
                value = before_series[index]
                samples.append({
                    "row": index,
                    "before": None if value == _NULL_SENTINEL else value,
                    "after": None,
                })

        previews.append({
            **base,
            "before": [sample["before"] for sample in samples],
            "after": [sample["after"] for sample in samples],
            "samples": samples,
            "changed_rows": changed_rows,
            "changed_cells": entry.get("changed_cells", changed_rows) or 0,
            "rows_removed": entry.get("rows_removed", 0) or 0,
            "changed": bool(changed_rows) or bool(entry.get("rows_removed")),
            "preview_available": True,
        })

    return previews
