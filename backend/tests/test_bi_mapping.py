"""BI column mapping: overrides, real metrics and honest gaps (Tasks 26-30)."""

from __future__ import annotations

import polars as pl
import pytest

from app.ai.bi import analyse_business_data, detect_column_roles
from app.profiler.schema import apply_schema


def _facts_and_frame(csv: str):
    import io

    frame = pl.read_csv(io.StringIO(csv), infer_schema_length=0)
    frame, schemas = apply_schema(frame)
    facts = [
        type(
            "Facts",
            (),
            {
                "name": schema.name,
                "semantic_type": schema.semantic_type,
                "dtype": schema.dtype,
            },
        )()
        for schema in schemas
    ]
    return frame, facts


SALES_CSV = (
    "order_id,order_date,sku,product_name,category,qty_sold,selling_price,unit_cost,stock\n"
    "ORD-1,2024-01-05,SKU-1,Widget,Snacks,10,9.99,5.50,120\n"
    "ORD-2,2024-01-06,SKU-2,Gadget,Snacks,4,19.50,11.00,80\n"
    "ORD-3,2024-02-11,SKU-1,Widget,Snacks,6,9.99,5.50,120\n"
    "ORD-4,2024-02-12,SKU-3,Gizmo,Dairy,2,249.00,140.00,15\n"
)


def _metric(analysis: dict, key: str) -> dict:
    return next(metric for metric in analysis["metrics"] if metric["key"] == key)


def test_revenue_is_quantity_times_price_when_no_revenue_column():
    frame, facts = _facts_and_frame(SALES_CSV)
    analysis = analyse_business_data(frame, facts)

    revenue = _metric(analysis, "revenue_total")
    assert revenue["available"] is True
    assert revenue["value"] == pytest.approx(10 * 9.99 + 4 * 19.50 + 6 * 9.99 + 2 * 249.00)
    assert "qty_sold" in revenue["formula"]
    assert "selling_price" in revenue["formula"]


def test_gross_margin_uses_cost_and_reports_formula():
    frame, facts = _facts_and_frame(SALES_CSV)
    analysis = analyse_business_data(frame, facts)

    margin = _metric(analysis, "gross_margin")
    assert margin["available"] is True
    assert margin["value"] is not None
    assert "unit_cost" in margin["formula"]


def test_missing_metric_is_unavailable_with_a_reason_not_zero():
    csv = "sku,product_name\nSKU-1,Widget\nSKU-2,Gadget\n"
    frame, facts = _facts_and_frame(csv)
    analysis = analyse_business_data(frame, facts)

    revenue = _metric(analysis, "revenue_total")
    assert revenue["available"] is False
    assert revenue["value"] is None
    assert revenue["missing"], "unavailable metrics must name the missing columns"
    assert analysis["limitations"]


def test_override_reassigns_a_column_to_a_role():
    frame, facts = _facts_and_frame(SALES_CSV)
    baseline, _ = detect_column_roles(facts)
    assert baseline.revenue is None or baseline.revenue != "unit_cost"

    roles, applied = detect_column_roles(facts, overrides={"revenue": "unit_cost"})
    assert roles.revenue == "unit_cost"
    assert applied == {"revenue": "unit_cost"}


def test_override_can_clear_a_role_entirely():
    frame, facts = _facts_and_frame(SALES_CSV)
    roles, applied = detect_column_roles(facts, overrides={"revenue": "other"})
    assert roles.revenue is None
    assert applied["revenue"] == "other"


def test_unknown_column_override_is_ignored_not_fabricated():
    frame, facts = _facts_and_frame(SALES_CSV)
    roles, applied = detect_column_roles(facts, overrides={"revenue": "not_a_column"})
    assert applied == {}
    assert roles.revenue is None or roles.revenue != "not_a_column"


def test_analysis_reports_which_roles_came_from_overrides():
    frame, facts = _facts_and_frame(SALES_CSV)
    analysis = analyse_business_data(frame, facts, overrides={"revenue": "unit_cost"})

    assert analysis["overrides_applied"] == {"revenue": "unit_cost"}
    assert analysis["roles_source"]["revenue"] == "override"
    assert analysis["roles"]["revenue"] == "unit_cost"


def test_analysis_without_overrides_marks_roles_as_auto():
    frame, facts = _facts_and_frame(SALES_CSV)
    analysis = analyse_business_data(frame, facts)

    assert analysis["overrides_applied"] == {}
    assert set(analysis["roles_source"].values()) <= {"auto", "override"}


def test_top_products_come_from_actual_rows():
    frame, facts = _facts_and_frame(SALES_CSV)
    analysis = analyse_business_data(frame, facts)

    assert analysis["top_products"]
    total = sum(item.get("revenue") or 0 for item in analysis["top_products"])
    assert total > 0


def test_empty_frame_returns_no_metrics_not_invented_ones():
    frame, facts = _facts_and_frame("sku,price\n")
    empty = frame.head(0)
    analysis = analyse_business_data(empty, facts)

    assert analysis["row_count"] == 0
    assert analysis["metrics"] == []
    assert analysis["limitations"]
