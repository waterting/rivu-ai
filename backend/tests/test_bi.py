"""Tests for the deterministic Business Intelligence engine.

These run without a database or network: the engine is a pure function over a
polars DataFrame plus profiled column facts.
"""

import polars as pl
import pytest

from app.ai.bi import ColumnFacts, analyse_business_data, detect_column_roles


def _sales_frame() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "order_date": ["2026-01-03", "2026-01-04", "2026-02-01", "2026-02-11"],
            "sku": ["A-1", "A-2", "A-1", "A-3"],
            "qty": [2, 1, 5, 3],
            "unit_price": [100.0, 200.0, 100.0, 50.0],
            "unit_cost": [60.0, 120.0, 60.0, 30.0],
            "stock": [1, 10, 1, 4],
        }
    )


def _facts() -> list[ColumnFacts]:
    return [
        ColumnFacts(name="order_date", semantic_type="date", dtype="Utf8"),
        ColumnFacts(name="sku", semantic_type="string", dtype="Utf8"),
        ColumnFacts(name="qty", semantic_type="integer", dtype="Int64"),
        ColumnFacts(name="unit_price", semantic_type="currency", dtype="Float64"),
        ColumnFacts(name="unit_cost", semantic_type="currency", dtype="Float64"),
        ColumnFacts(name="stock", semantic_type="integer", dtype="Int64"),
    ]


def test_detect_column_roles_maps_expected_columns():
    roles, applied = detect_column_roles(_facts())
    assert applied == {}

    assert roles.date == "order_date"
    assert roles.quantity == "qty"
    assert roles.unit_price == "unit_price"
    assert roles.cost == "unit_cost"
    assert roles.stock == "stock"
    assert roles.product == "sku"
    assert roles.revenue is None


def test_revenue_derived_from_quantity_times_price():
    result = analyse_business_data(_sales_frame(), _facts())

    revenue = next(m for m in result["metrics"] if m["key"] == "revenue_total")
    assert revenue["available"] is True
    assert revenue["value"] == pytest.approx(2 * 100 + 1 * 200 + 5 * 100 + 3 * 50)
    assert revenue["formula"] == "sum(qty * unit_price)"


def test_units_and_margin_are_measured():
    result = analyse_business_data(_sales_frame(), _facts())

    units = next(m for m in result["metrics"] if m["key"] == "units_total")
    assert units["value"] == 11

    margin = next(m for m in result["metrics"] if m["key"] == "gross_margin")
    assert margin["available"] is True
    # revenue 1050, cogs 2*60 + 1*120 + 5*60 + 3*30 = 630
    assert margin["value"] == pytest.approx(420.0)
    assert margin["margin_pct"] == pytest.approx(40.0)


def test_top_products_and_trend_are_computed_from_rows():
    result = analyse_business_data(_sales_frame(), _facts())

    top = {row["product"]: row["revenue"] for row in result["top_products"]}
    assert top["A-1"] == pytest.approx(700.0)
    assert list(top)[0] == "A-1"

    trend = {row["period"]: row["revenue"] for row in result["demand_trend"]}
    assert trend["2026-01"] == pytest.approx(400.0)
    assert trend["2026-02"] == pytest.approx(650.0)


def test_restock_flags_products_where_sold_exceeds_stock():
    result = analyse_business_data(_sales_frame(), _facts())

    products = {row["product"]: row for row in result["restock"]}
    assert "A-1" in products
    assert products["A-1"]["units_sold"] == pytest.approx(7.0)
    assert products["A-1"]["stock_on_hand"] == pytest.approx(1.0)
    assert products["A-1"]["gap"] == pytest.approx(6.0)


def test_missing_columns_are_reported_not_guessed():
    frame = pl.DataFrame({"sku": ["A-1"], "qty": [1]})
    facts = [ColumnFacts(name="sku", semantic_type="string"), ColumnFacts(name="qty", semantic_type="integer")]

    result = analyse_business_data(frame, facts)

    revenue = next(m for m in result["metrics"] if m["key"] == "revenue_total")
    assert revenue["available"] is False
    assert revenue["value"] is None
    assert set(revenue["missing"]) == {"revenue", "unit_price"}

    margin = next(m for m in result["metrics"] if m["key"] == "gross_margin")
    assert margin["available"] is False
    assert "cost" in margin["missing"]

    assert any("revenue column" in limitation for limitation in result["limitations"])


def test_revenue_column_is_preferred_over_quantity_times_price():
    frame = pl.DataFrame({"amount": [10.0, 20.0], "qty": [1, 1], "price": [5.0, 5.0]})
    facts = [
        ColumnFacts(name="amount", semantic_type="currency", dtype="Float64"),
        ColumnFacts(name="qty", semantic_type="integer", dtype="Int64"),
        ColumnFacts(name="price", semantic_type="currency", dtype="Float64"),
    ]

    result = analyse_business_data(frame, facts)

    revenue = next(m for m in result["metrics"] if m["key"] == "revenue_total")
    assert revenue["value"] == pytest.approx(30.0)
    assert revenue["formula"] == "sum(amount)"


def test_empty_frame_is_reported_honestly():
    frame = pl.DataFrame({"sku": [], "qty": []}, schema={"sku": pl.Utf8, "qty": pl.Int64})

    result = analyse_business_data(frame, [])

    assert result["row_count"] == 0
    assert result["metrics"] == []
    assert result["limitations"] == ["Dataset contains no rows."]
def test_bi_route_is_registered():
    """The BI endpoint must be mounted on the datasets router."""
    from app.main import app

    paths = {getattr(route, "path", "") for route in app.routes}
    assert any(p.endswith("/bi") for p in paths), sorted(p for p in paths if "dataset" in p)
