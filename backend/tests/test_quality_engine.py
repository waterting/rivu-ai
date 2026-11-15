"""Quality engine behaviour: measured scores, honest gaps, duplicate evidence."""

from __future__ import annotations

import polars as pl
import pytest

from app.ingestion.parser import parse_to_polars
from app.profiler.duplicates import detect_duplicates, normalize_key
from app.profiler.engine import profile_dataframe
from app.profiler.quality import WEIGHTS, calculate_quality_report, quality_methodology


def _profile(csv: str):
    df, meta = parse_to_polars(csv.encode("utf-8"), "csv", "data.csv")
    profile = profile_dataframe(df, "org", schemas=meta["column_schemas"])
    return df, profile


def _duplicates(df: pl.DataFrame, profile: dict) -> dict:
    keys = [
        column["column_name"]
        for column in profile["columns"]
        if column.get("role") in {"sku", "barcode", "order_id"}
    ]
    fuzzy = [
        column["column_name"]
        for column in profile["columns"]
        if column.get("role") == "product_name"
    ]
    return detect_duplicates(df, key_columns=keys, fuzzy_columns=fuzzy)


def test_duplicate_skus_are_reported_with_row_evidence():
    rows = "\n".join(f"{index % 3:05d},Item {index}" for index in range(12))
    df, profile = _profile(f"SKU,Product Name\n{rows}\n")
    duplicates = _duplicates(df, profile)
    report = calculate_quality_report(profile, profile["columns"], duplicates=duplicates, row_count=df.height)

    sku_issue = next(issue for issue in report["issues"] if issue["affected_column"] == "SKU")
    assert sku_issue["affected_row_count"] == 9
    assert report["uniqueness_score"] == pytest.approx(25.0)
    assert sku_issue["evidence"]["examples"]


def test_invalid_values_lower_validity_instead_of_reading_perfect():
    csv = "sku,price\n001,10.00\n002,N/A\n003,12.50\n004,abc\n"
    df, profile = _profile(csv)
    report = calculate_quality_report(profile, profile["columns"], row_count=df.height)

    assert report["validity_score"] < 100
    issue = next(i for i in report["issues"] if i["issue_type"] == "invalid_values")
    assert issue["affected_column"] == "price"
    # "N/A" is a documented null token, so only the non-numeric text counts as invalid.
    assert issue["affected_row_count"] == 1
    assert "abc" in issue["evidence"]["examples"]

    missing = next(i for i in report["issues"] if i["issue_type"] == "missing_values")
    assert missing["affected_column"] == "price"
    assert missing["affected_row_count"] == 1


def test_invalid_dates_are_detected_as_calendar_errors():
    csv = "sku,order_date\n001,2024-01-05\n002,2024-13-45\n003,2024-02-30\n"
    df, profile = _profile(csv)
    report = calculate_quality_report(profile, profile["columns"], row_count=df.height)

    issue = next(i for i in report["issues"] if i["issue_type"] == "invalid_values")
    assert issue["affected_row_count"] == 2
    assert report["validity_score"] < 100


def test_missing_dimension_is_reported_as_unavailable_not_perfect():
    csv = "sku,price\n001,10.00\n002,20.00\n"
    df, profile = _profile(csv)
    report = calculate_quality_report(profile, profile["columns"], duplicates=None, row_count=df.height)

    assert report["uniqueness_score"] is None
    assert "uniqueness" in report["unavailable_dimensions"]
    assert report["overall_score"] > 0

    available_weights = sum(WEIGHTS[key] for key in WEIGHTS if key != "uniqueness")
    expected = sum(
        report[f"{key}_score"] * WEIGHTS[key] for key in WEIGHTS if key != "uniqueness"
    ) / available_weights
    assert report["overall_score"] == pytest.approx(round(expected, 2), abs=0.01)


def test_methodology_is_published_with_the_score():
    methodology = quality_methodology()
    assert methodology["weights"] == WEIGHTS
    assert methodology["outlier_method"]
    assert "unavailable_dimension_policy" in methodology


def test_negative_prices_are_integrity_violations():
    csv = "sku,selling_price\n001,10.00\n002,-500.00\n003,12.00\n004,15.00\n"
    df, profile = _profile(csv)
    report = calculate_quality_report(profile, profile["columns"], row_count=df.height)

    issue = next(i for i in report["issues"] if i["issue_type"] == "outlier")
    assert issue["affected_column"] == "selling_price"
    assert issue["affected_row_count"] == 1
    assert issue["evidence"]["observed_min"] == -500.0


def test_case_variants_are_consistency_issues_with_examples():
    csv = "sku,brand\n001,Apple\n002,APPLE\n003,apple\n004,Samsung\n"
    df, profile = _profile(csv)
    report = calculate_quality_report(profile, profile["columns"], row_count=df.height)

    issue = next(i for i in report["issues"] if i["affected_column"] == "brand")
    assert issue["issue_type"] == "inconsistent_format"
    assert set(issue["evidence"]["variants"]["apple"]) == {"Apple", "APPLE", "apple"}


def test_numbered_product_names_are_not_fuzzy_duplicates():
    csv = "sku,product_name\n001,Apple Product 12\n002,Apple Product 13\n003,Apple Product 14\n"
    df, profile = _profile(csv)
    duplicates = _duplicates(df, profile)

    assert duplicates["near_duplicates"] == []


def test_true_near_duplicates_are_reported():
    csv = "sku,product_name\n001,Coca Cola 500ml\n002,CocaCola 500ml\n003,Pepsi 1L\n"
    df, profile = _profile(csv)
    duplicates = _duplicates(df, profile)

    assert duplicates["near_duplicates"], "expected a fuzzy pair"
    assert duplicates["near_duplicates"][0]["count"] >= 1


def test_normalize_key_ignores_case_and_spacing():
    assert normalize_key("  Coca   Cola ") == "coca cola"
    assert normalize_key(None) == ""


def test_severity_reflects_scale_of_the_problem():
    many = "\n".join(f"{index % 2:05d},Item {index}" for index in range(40))
    df, profile = _profile(f"SKU,Product Name\n{many}\n")
    report = calculate_quality_report(profile, profile["columns"], duplicates=_duplicates(df, profile), row_count=df.height)

    assert report["severity_counts"]["critical"] >= 1
    assert report["total_issues"] > 0
    assert report["evaluated_records"] == df.height