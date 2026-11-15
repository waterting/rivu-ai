"""Cleaning workflow: measured previews, real changes, version history."""

from __future__ import annotations

import polars as pl
import pytest

from app.cleaning.engine import TransformationEngine, generate_transformation_preview


def test_trim_reports_how_many_cells_actually_changed():
    df = pl.DataFrame({"name": ["  Apple ", "Banana", "  Cherry  "]})
    result = TransformationEngine(df).execute_operations([
        {"type": "trim_whitespace", "column": "name"}
    ])

    assert result["rows_modified"] == 2
    assert result["cells_changed"] == 2
    assert result["log"][0]["changed_rows"] == 2
    assert result["df"]["name"].to_list() == ["Apple", "Banana", "Cherry"]
    assert df["name"].to_list() == ["  Apple ", "Banana", "  Cherry  "]


def test_dropping_rows_reports_removed_rows_not_total_rows():
    df = pl.DataFrame({"sku": ["001", "002", "002", "003"]})
    result = TransformationEngine(df).execute_operations([
        {"type": "remove_duplicates", "column": "sku"}
    ])

    assert result["rows_modified"] >= 1
    assert result["log"][0]["rows_removed"] == 1
    assert result["df"].height == 3


def test_preview_reports_rule_risk_and_affected_rows():
    df = pl.DataFrame({"brand": ["Apple", "APPLE", "apple", "Samsung"]})
    previews = generate_transformation_preview(
        df, [{"type": "normalize_category", "column": "brand"}]
    )

    preview = previews[0]
    assert preview["rule"]
    assert preview["risk"] in {"low", "medium", "high"}
    assert preview["affected_columns"] == ["brand"]
    assert preview["changed_rows"] >= 1
    assert preview["samples"]
    assert preview["preview_available"] is True


def test_preview_of_unknown_column_is_explicit():
    df = pl.DataFrame({"brand": ["Apple"]})
    previews = generate_transformation_preview(
        df, [{"type": "trim_whitespace", "column": "missing"}]
    )

    assert previews[0]["preview_available"] is False
    assert "not found" in previews[0]["note"].lower()


def test_destructive_operations_are_marked_high_risk():
    df = pl.DataFrame({"sku": ["001", "002"]})
    previews = generate_transformation_preview(df, [
        {"type": "drop_column", "column": "sku"},
        {"type": "trim_whitespace", "column": "sku"},
    ])

    assert previews[0]["risk"] == "high"
    assert previews[1]["risk"] == "low"


def test_failed_operation_is_logged_without_aborting_the_plan():
    df = pl.DataFrame({"sku": ["001"]})
    result = TransformationEngine(df).execute_operations([
        {"type": "trim_whitespace", "column": "nope"},
        {"type": "lowercase", "column": "sku"},
    ])

    assert result["ops_failed"] == 1
    assert result["ops_applied"] == 1
    assert result["df"]["sku"].to_list() == ["001"]


def test_unknown_operation_is_skipped_not_applied():
    df = pl.DataFrame({"sku": ["001"]})
    result = TransformationEngine(df).execute_operations([{"type": "teleport", "column": "sku"}])

    assert result["ops_skipped"] == 1
    assert result["df"].to_dicts() == df.to_dicts()


@pytest.mark.parametrize(
    "op_type,column,expected",
    [
        ("lowercase", "name", ["  apple  "]),
        ("uppercase", "name", ["  APPLE  "]),
        ("title_case", "name", ["  Apple  "]),
        ("trim_whitespace", "name", ["aPPLE"]),
        ("normalize_whitespace", "name", ["aPPLE"]),
    ],
)
def test_string_operations_apply(op_type, column, expected):
    df = pl.DataFrame({"name": ["  aPPLE  "]})
    result = TransformationEngine(df).execute_operations([{"type": op_type, "column": column}])
    assert result["df"]["name"].to_list() == expected