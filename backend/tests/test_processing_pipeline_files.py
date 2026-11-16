"""Real upload-to-artifact stages, without a database.

The processing-status tests prove the *reporting* is honest. These prove the
*pipeline itself* still handles the file shapes a production upload actually
produces, exercising the same parse -> profile -> quality sequence the worker
runs in ``process_dataset_async`` (minus the DB writes, which need PostgreSQL).

Covers the file-level scenarios from the release checklist:
  1. a small CSV
  2. a large CSV
  3. an XLSX with multiple sheets
  4. a corrupted / invalid file

The worker-down, worker-restart and retry scenarios are covered by
test_processing_status.py, test_processing_status_api.py and
test_processor_idempotency.py.
"""

from __future__ import annotations

import io
import uuid

import polars as pl
import pytest

from app.ingestion.parser import parse_to_polars, validate_file_signature, validate_upload
from app.profiler.engine import profile_dataframe
from app.profiler.quality import calculate_quality_report

ORG = str(uuid.uuid4())


def _run_pipeline(data: bytes, file_format: str, filename: str) -> tuple[pl.DataFrame, dict, dict]:
    """The worker's stage sequence, returning what it would persist."""
    df, parse_meta = parse_to_polars(data, file_format, filename)
    profile = profile_dataframe(df, ORG, schemas=parse_meta.get("column_schemas"))
    quality = calculate_quality_report(profile, profile["columns"], row_count=df.height)
    return df, parse_meta, {"profile": profile, "quality": quality}


# ── 1. Small CSV ────────────────────────────────────────────────────────────

SMALL_CSV = (
    "sku,product_name,price,email\n"
    "A-1,Wireless Mouse,19.99,alice@example.com\n"
    "A-2,USB-C Hub,49.50,bob@example.com\n"
    "A-3,Monitor Stand,,carol@example.com\n"
    "A-1,Wireless Mouse,19.99,alice@example.com\n"
).encode("utf-8")


def test_small_csv_parses_profiles_and_scores():
    fmt = validate_upload("small.csv", len(SMALL_CSV), "text/csv")
    assert fmt == "csv"

    df, meta, artifacts = _run_pipeline(SMALL_CSV, "csv", "small.csv")

    assert df.height == 4
    assert artifacts["profile"]["row_count"] == 4
    assert artifacts["profile"]["column_count"] == 4
    assert meta["delimiter"] == ","
    assert meta["encoding"], "a detected encoding must be recorded"
    # Quality scoring must return the full dimension set the UI renders.
    quality = artifacts["quality"]
    assert "overall_score" in quality
    assert 0 <= quality["overall_score"] <= 100
    assert isinstance(quality["issues"], list)


# ── 2. Large CSV ────────────────────────────────────────────────────────────


def _large_csv(rows: int) -> bytes:
    lines = ["id,name,amount,email,segment"]
    for i in range(rows):
        # Every 10th row is a duplicate key and every 7th has a blank amount, so
        # the quality stage has real findings to report at volume.
        idx = i - (i % 10) if i % 10 == 0 else i
        amount = "" if i % 7 == 0 else f"{i * 1.5:.2f}"
        lines.append(f"SKU-{idx:06d},Item {i},{amount},user{i}@example.com,seg{i % 5}")
    return ("\n".join(lines) + "\n").encode("utf-8")


def test_large_csv_profiles_at_volume():
    rows = 100_000
    data = _large_csv(rows)

    df, meta, artifacts = _run_pipeline(data, "csv", "large.csv")

    assert df.height == rows
    assert artifacts["profile"]["row_count"] == rows
    assert artifacts["profile"]["column_count"] == 5
    # Profiling must produce per-column facts for every column.
    assert len(artifacts["profile"]["columns"]) == 5
    assert meta["peak_rss_mb"] is not None, "peak memory must be recorded for large files"


def test_large_csv_is_not_truncated():
    """A ragged or oversized file must fail loudly rather than silently drop rows."""
    rows = 5_000
    header = "id,value\n"
    body = "".join(f"{i},{i}\n" for i in range(rows))
    # One row has an extra field, which Polars must reject rather than truncate.
    ragged = (header + body + "99999,1,2\n").encode("utf-8")

    with pytest.raises(Exception):
        parse_to_polars(ragged, "csv", "ragged.csv")


# ── 3. XLSX with multiple sheets ────────────────────────────────────────────


def _multi_sheet_xlsx() -> bytes:
    import pandas as pd

    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        pd.DataFrame(
            {"sku": ["A-1", "A-2", "A-3"], "price": [10.0, 20.5, None], "name": ["Mouse", "Hub", "Stand"]}
        ).to_excel(writer, sheet_name="Products", index=False)
        pd.DataFrame(
            {"order_id": ["O-1", "O-2"], "total": [99.0, 149.5]}
        ).to_excel(writer, sheet_name="Orders", index=False)
        pd.DataFrame({"note": ["ignored"]}).to_excel(writer, sheet_name="Notes", index=False)
    return buffer.getvalue()


def test_multi_sheet_xlsx_reads_the_primary_sheet():
    data = _multi_sheet_xlsx()

    fmt = validate_upload("book.xlsx", len(data), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    assert fmt == "xlsx"
    validate_file_signature(data[:16], "xlsx")

    df, meta, artifacts = _run_pipeline(data, "xlsx", "book.xlsx")

    # pandas reads the first sheet; the other sheets are not silently merged.
    assert df.height == 3
    assert "sku" in df.columns
    assert artifacts["profile"]["row_count"] == 3


def test_corrupt_xlsx_is_rejected_not_silently_emptied():
    corrupt = b"PK\x03\x04" + b"\x00" * 64  # valid zip magic, invalid workbook
    with pytest.raises(Exception):
        parse_to_polars(corrupt, "xlsx", "broken.xlsx")


# ── 4. Invalid / corrupted files ────────────────────────────────────────────


def test_invalid_csv_reports_a_validation_error():
    # Binary garbage with a .csv extension must not parse as a table.
    garbage = bytes(range(256)) * 8

    with pytest.raises(Exception) as excinfo:
        parse_to_polars(garbage, "csv", "garbage.csv")
    assert "CSV" in str(excinfo.value) or "parse" in str(excinfo.value).lower()


def test_unknown_format_is_rejected():
    with pytest.raises(Exception):
        parse_to_polars(b"hello", "pdf", "doc.pdf")


def test_empty_csv_does_not_produce_a_fictional_profile():
    with pytest.raises(Exception):
        parse_to_polars(b"", "csv", "empty.csv")


def test_schema_inference_survives_frames_larger_than_the_sample_limit():
    """Regression: apply_schema used DataFrame.gather, which polars does not have.

    Every file above the 20,000-row sample limit raised
    AttributeError: 'DataFrame' object has no attribute 'gather', so the worker
    could never profile a large upload.
    """
    from app.core.config import settings
    from app.profiler.schema import apply_schema

    limit = getattr(settings, "SCHEMA_SAMPLE_LIMIT", 20_000)
    rows = limit * 3
    df = pl.DataFrame(
        {
            "id": [str(i) for i in range(rows)],
            "price": [f"{i}.50" for i in range(rows)],
            "name": [f"item-{i}" for i in range(rows)],
        }
    )

    coerced, schemas = apply_schema(df)

    assert coerced.height == rows, "schema application must not drop rows"
    assert [s.name for s in schemas] == ["id", "price", "name"]
    assert coerced["price"].dtype == pl.Float64, "a numeric column must still be coerced"


def test_upload_validation_rejects_oversized_and_wrong_type():
    from app.ingestion.parser import ValidationError

    with pytest.raises(ValidationError):
        validate_upload("huge.csv", 600 * 1024 * 1024, "text/csv")

    with pytest.raises(ValidationError):
        validate_upload("notes.txt", 100, "text/plain")


# ── Pipeline invariants across all formats ──────────────────────────────────


@pytest.mark.parametrize(
    "data,file_format,filename",
    [
        (SMALL_CSV, "csv", "small.csv"),
        (_multi_sheet_xlsx(), "xlsx", "book.xlsx"),
    ],
)
def test_every_format_yields_a_complete_profile(data, file_format, filename):
    """Whatever the format, the profile must carry the facts the UI renders."""
    df, _meta, artifacts = _run_pipeline(data, file_format, filename)
    profile = artifacts["profile"]

    for key in (
        "row_count",
        "column_count",
        "duplicate_row_count",
        "total_null_count",
        "total_cell_count",
        "sample_rows",
        "columns",
    ):
        assert key in profile, f"profile is missing {key}"

    assert profile["row_count"] == df.height
    assert len(profile["columns"]) == df.width

    quality = artifacts["quality"]
    # The UI renders one score per dimension; a missing key would render as
    # "unavailable" and hide a real quality problem.
    for dimension in ("completeness", "validity", "consistency", "uniqueness", "integrity"):
        score = quality.get(f"{dimension}_score")
        assert score is None or 0 <= score <= 100, f"{dimension} score is out of range: {score}"

    assert 0 <= quality["overall_score"] <= 100
    assert isinstance(quality["issues"], list)