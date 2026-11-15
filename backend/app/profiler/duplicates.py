"""Duplicate detection for rows, identifiers and near-identical records.

Detection is measured, not guessed: every finding reports the affected rows and
the values that caused it, so the UI can show evidence and the user can decide
whether a duplicate is an error or an intentional variant.
"""

from __future__ import annotations

import difflib
import re
from typing import Any

import polars as pl

_WHITESPACE_RE = re.compile(r"\s+")
_DIGITS_RE = re.compile(r"\d+")
MAX_EXAMPLE_GROUPS = 25
MAX_EXAMPLE_ROWS = 20
FUZZY_THRESHOLD = 0.92
FUZZY_BLOCK_SIZE = 4
MAX_FUZZY_ROWS = 20000
MAX_FUZZY_PAIRS = 200


def normalize_key(value: Any) -> str:
    """Case/whitespace-insensitive key used for duplicate comparison."""
    if value is None:
        return ""
    return _WHITESPACE_RE.sub(" ", str(value)).strip().lower()


def _row_indices(frame: pl.DataFrame, value: str) -> list[int]:
    try:
        return frame.filter(pl.col("_key") == value)["_row"].to_list()[:MAX_EXAMPLE_ROWS]
    except Exception:
        return []


def _duplicate_groups(df: pl.DataFrame, column: str, normalized: bool) -> dict[str, Any]:
    series = df[column].cast(pl.Utf8)
    if normalized:
        keys = series.map_elements(normalize_key, return_dtype=pl.Utf8)
    else:
        keys = series
    frame = df.select(keys.alias("_key")).with_row_index("_row")

    counts = frame["_key"].value_counts(sort=True)
    duplicated = counts.filter(pl.col("count") > 1)

    total_rows = df.height
    extra_rows = int((duplicated["count"] - 1).sum()) if duplicated.height else 0
    duplicate_groups = int(duplicated.height)

    examples: list[dict[str, Any]] = []
    if duplicated.height:
        for row in duplicated.head(MAX_EXAMPLE_GROUPS).to_dicts():
            value = row["_key"]
            examples.append(
                {
                    "value": value,
                    "count": int(row["count"]),
                    "row_indices": _row_indices(frame, value),
                }
            )

    return {
        "column": column,
        "compared_normally": normalized,
        "total_values": total_rows,
        "duplicate_values": duplicate_groups,
        "duplicate_groups": duplicate_groups,
        "extra_rows": extra_rows,
        "pct": round(extra_rows / max(total_rows, 1) * 100, 3),
        "examples": examples,
    }


def _exact_duplicate_rows(df: pl.DataFrame) -> dict[str, Any]:
    total_rows = df.height
    if total_rows == 0:
        return {"count": 0, "pct": 0.0, "row_indices": []}

    try:
        unique_rows = df.unique(maintain_order=True)
        duplicate_count = total_rows - unique_rows.height
        row_indices: list[int] = []
        if duplicate_count:
            seen: set[str] = set()
            flagged: set[int] = set()
            for index, row in enumerate(df.iter_rows()):
                signature = repr(row)
                if signature in seen:
                    flagged.add(index)
                    if len(flagged) >= MAX_EXAMPLE_ROWS:
                        break
                else:
                    seen.add(signature)
            row_indices = sorted(flagged)
    except Exception:
        duplicate_count = 0

    return {
        "count": int(duplicate_count),
        "pct": round(duplicate_count / max(total_rows, 1) * 100, 3),
        "row_indices": row_indices,
    }


def _numbered_variant(left: str, right: str) -> bool:
    """'Apple Product 12' and 'Apple Product 13' are different products, not typos."""
    return _DIGITS_RE.sub("", left) == _DIGITS_RE.sub("", right)


def _near_duplicates(df: pl.DataFrame, column: str) -> dict[str, Any]:
    total_rows = df.height
    if total_rows == 0 or total_rows > MAX_FUZZY_ROWS:
        return {"column": column, "count": 0, "pairs": [], "reason": "row_limit"}

    values = [normalize_key(value) for value in df[column].cast(pl.Utf8).to_list()]
    values = [value for value in values if value]

    blocks: dict[str, list[int]] = {}
    for index, value in enumerate(values):
        blocks.setdefault(value[:FUZZY_BLOCK_SIZE], []).append(index)

    pairs: list[dict[str, Any]] = []
    seen_pairs: set[tuple[int, int]] = set()
    for indices in blocks.values():
        if len(indices) < 2:
            continue
        for position, left in enumerate(indices):
            for right in indices[position + 1:]:
                if (left, right) in seen_pairs:
                    continue
                seen_pairs.add((left, right))
                if values[left] == values[right]:
                    continue
                if _numbered_variant(values[left], values[right]):
                    continue
                similarity = difflib.SequenceMatcher(None, values[left], values[right]).ratio()
                if similarity >= FUZZY_THRESHOLD:
                    pairs.append(
                        {
                            "value_a": values[left],
                            "value_b": values[right],
                            "similarity": round(similarity, 3),
                            "row_indices": [left, right],
                        }
                    )
                    if len(pairs) >= MAX_FUZZY_PAIRS:
                        return {"column": column, "count": len(pairs), "pairs": pairs, "truncated": True}

    return {"column": column, "count": len(pairs), "pairs": pairs, "truncated": False}


def detect_duplicates(
    df: pl.DataFrame,
    key_columns: list[str] | None = None,
    fuzzy_columns: list[str] | None = None,
) -> dict[str, Any]:
    """Detect exact row duplicates, duplicate keys and near-duplicate names."""
    key_columns = [column for column in (key_columns or []) if column in df.columns]
    fuzzy_columns = [column for column in (fuzzy_columns or []) if column in df.columns]

    keys: dict[str, Any] = {}
    for column in key_columns:
        exact = _duplicate_groups(df, column, normalized=False)
        normalized = _duplicate_groups(df, column, normalized=True)
        keys[column] = {
            "exact": exact,
            "normalized": normalized,
            "extra_rows": max(exact["extra_rows"], normalized["extra_rows"]),
            "pct": max(exact["pct"], normalized["pct"]),
            "examples": (normalized if normalized["extra_rows"] else exact)["examples"],
        }

    near: list[dict[str, Any]] = [_near_duplicates(df, column) for column in fuzzy_columns]
    near = [entry for entry in near if entry["count"]]

    return {
        "row_count": df.height,
        "exact_rows": _exact_duplicate_rows(df),
        "keys": keys,
        "near_duplicates": near,
        "total_extra_rows": int(sum(entry["extra_rows"] for entry in keys.values())),
    }