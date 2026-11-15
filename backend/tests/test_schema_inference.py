"""Schema inference and identifier preservation (Tasks 06 and 07)."""

from __future__ import annotations

import polars as pl
import pytest

from app.ingestion.parser import parse_to_polars
from app.profiler.roles import detect_role, resolve_roles, role_summary
from app.profiler.schema import apply_schema, parse_numeric_token, schema_summary


def test_leading_zeroes_survive_ingestion():
    data = "sku,price\n00123,10.50\n00124,12.00\n".encode()
    df, meta = parse_to_polars(data, "csv", "products.csv")

    assert df["sku"].to_list() == ["00123", "00124"]
    assert df["sku"].dtype == pl.Utf8
    assert df["price"].to_list() == [10.5, 12.0]

    schema = {column["column_name"]: column for column in meta["schema"]["columns"]}
    assert schema["sku"]["semantic_type"] == "id_like"
    assert schema["sku"]["preserved"] is True
    assert schema["price"]["semantic_type"] == "currency"


def test_long_numeric_barcodes_stay_text():
    data = "barcode,name\n8901234567890,Widget\n8901234567891,Gadget\n".encode()
    df, meta = parse_to_polars(data, "csv", "barcodes.csv")

    assert df["barcode"].to_list() == ["8901234567890", "8901234567891"]
    assert df["barcode"].dtype == pl.Utf8
    schema = {column["column_name"]: column for column in meta["schema"]["columns"]}
    assert schema["barcode"]["semantic_type"] == "id_like"


def test_plain_integer_and_float_columns_are_numeric():
    df = pl.DataFrame({"qty": ["10", "20", "30"], "rate": ["1.5", "2.25", "3.0"]})
    coerced, schemas = apply_schema(df)
    types = {schema.name: schema.semantic_type for schema in schemas}

    assert types["qty"] == "integer"
    assert types["rate"] == "float"
    assert coerced["qty"].dtype == pl.Int64
    assert coerced["rate"].dtype == pl.Float64
    assert coerced["qty"].to_list() == [10, 20, 30]


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("1,299.00", 1299.0),
        ("₹1,299.00", 1299.0),
        ("$12.5", 12.5),
        ("1.234,56", 1234.56),
        ("(500)", -500.0),
        ("45%", 45.0),
        ("-3", -3.0),
        ("1e5", 100000.0),
        (" 42 ", 42.0),
    ],
)
def test_numeric_token_parsing(raw, expected):
    assert parse_numeric_token(raw) == pytest.approx(expected)


@pytest.mark.parametrize("raw", ["abc", "", "N/A", "12abc", "1.2.3"])
def test_non_numeric_tokens_are_rejected(raw):
    assert parse_numeric_token(raw) is None


def test_percentage_and_currency_markers():
    df = pl.DataFrame(
        {
            "discount_pct": ["10%", "20%", "0%"],
            "amount": ["$10.00", "$20.50", "$5.25"],
        }
    )
    coerced, schemas = apply_schema(df)
    types = {schema.name: schema.semantic_type for schema in schemas}

    assert types["discount_pct"] == "percentage"
    assert types["amount"] == "currency"
    assert coerced["discount_pct"].to_list() == [10.0, 20.0, 0.0]
    assert coerced["amount"].to_list() == [10.0, 20.5, 5.25]


def test_mixed_column_is_text_and_records_invalid_values():
    df = pl.DataFrame({"mixed": ["12", "abc", "34", "xyz"]})
    coerced, schemas = apply_schema(df)

    assert schemas[0].semantic_type == "string"
    assert coerced["mixed"].to_list() == ["12", "abc", "34", "xyz"]
    assert schemas[0].evidence["numeric_ratio"] == 0.5


def test_dates_are_detected_but_kept_as_text():
    df = pl.DataFrame({"order_date": ["2024-01-05", "2024-02-11", "2024-03-20"]})
    coerced, schemas = apply_schema(df)

    assert schemas[0].semantic_type == "date"
    assert schemas[0].evidence["formats"] == ["YYYY-MM-DD"]
    assert coerced["order_date"].dtype == pl.Utf8


def test_mixed_date_formats_are_flagged():
    df = pl.DataFrame({"order_date": ["2024-01-05", "05/02/2024", "2024-03-20"]})
    _, schemas = apply_schema(df)

    assert schemas[0].semantic_type == "date"
    assert len(schemas[0].evidence["formats"]) == 2


def test_boolean_columns_are_detected_from_name_and_values():
    df = pl.DataFrame({"is_active": ["yes", "no", "yes"], "flag": ["1", "0", "1"]})
    _, schemas = apply_schema(df)
    types = {schema.name: schema.semantic_type for schema in schemas}

    assert types["is_active"] == "boolean"
    assert types["flag"] == "boolean"


def test_phone_numbers_keep_formatting():
    df = pl.DataFrame({"phone": ["+91 98765 43210", "+91 98765 43211"]})
    coerced, schemas = apply_schema(df)

    assert schemas[0].semantic_type == "phone"
    assert coerced["phone"].to_list() == ["+91 98765 43210", "+91 98765 43211"]


def test_identifier_column_with_numeric_values_is_not_measured():
    df = pl.DataFrame({"customer_id": ["1001", "1002", "1003"]})
    _, schemas = apply_schema(df)

    assert schemas[0].semantic_type == "id_like"
    assert schemas[0].dtype == "Utf8"


def test_low_confidence_is_surfaced_not_hidden():
    df = pl.DataFrame({"mystery": ["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8", "i9", "j10", "k11"]})
    _, schemas = apply_schema(df)
    summary = schema_summary(schemas)

    assert summary["columns"][0]["confidence"] <= 0.8
    assert summary["low_confidence"]


@pytest.mark.parametrize(
    "column,semantic,expected_role",
    [
        ("Selling Price", "currency", "price"),
        ("Qty Sold", "integer", "quantity"),
        ("Order Date", "date", "date"),
        ("SKU", "id_like", "sku"),
        ("Barcode", "id_like", "barcode"),
        ("Product Name", "string", "product_name"),
        ("Brand", "categorical", "brand"),
    ],
)
def test_role_detection_from_column_names(column, semantic, expected_role):
    role, confidence, _ = detect_role(column, semantic)
    assert role == expected_role
    assert confidence >= 0.7


def test_unrecognised_column_is_explicitly_other():
    role, confidence, evidence = detect_role("mystery_column", "string")
    assert role == "other"
    assert confidence < 0.7
    assert evidence["matched_by"] == "none"


def test_manual_override_wins_and_is_flagged():
    columns = [
        {"column_name": "amount", "semantic_type": "currency", "sample_values": ["10", "20"]},
        {"column_name": "note", "semantic_type": "string", "sample_values": ["x"]},
    ]
    resolved = resolve_roles(columns, overrides={"amount": "revenue", "note": "product_name"})
    by_name = {column["column_name"]: column for column in resolved}

    assert by_name["amount"]["role"] == "revenue"
    assert by_name["amount"]["role_confidence"] == 1.0
    assert by_name["amount"]["role_overridden"] is True
    assert by_name["note"]["role"] == "product_name"


def test_ambiguous_roles_are_reported():
    columns = [
        {"column_name": "unit_price", "semantic_type": "currency", "sample_values": ["10"]},
        {"column_name": "selling_price", "semantic_type": "currency", "sample_values": ["12"]},
    ]
    resolved = resolve_roles(columns)
    summary = role_summary(resolved)

    assert "price" in summary["roles"]
    assert summary["roles"]["price"] == ["unit_price", "selling_price"]
    assert summary["ambiguous"] == ["unit_price", "selling_price"]


def test_messy_csv_round_trips_row_and_column_counts():
    data = (
        "sku,product_name,selling_price,qty,order_date,is_active\n"
        '00123, Apple Juice ,"₹1,299.00",10,2024-01-05,yes\n'
        "00124,BANANA,45%,2,05/02/2024,no\n"
        ",Mango,(500),3,2024-03-20,1\n"
    ).encode()
    df, meta = parse_to_polars(data, "csv", "messy.csv")

    assert df.height == 3
    assert df.width == 6
    assert meta["schema"]["type_counts"]["id_like"] == 1
    assert df["sku"].to_list()[0] == "00123"
    assert df["selling_price"].to_list()[0] == pytest.approx(1299.0)
    assert df["qty"].dtype == pl.Int64
    assert df["is_active"].to_list() == ["yes", "no", "1"]