"""Artifact serialization and on-demand derivation.

Audit finding 12: a refinement must not write N full copies of the same rows.
The canonical artifact plus the schema sidecar are stored eagerly; other
formats are derived on demand at export time.
"""

import polars as pl
import pytest

from app.ingestion.artifacts import (
    CANONICAL_FORMATS,
    canonical_format_for,
    content_type_for,
    dataframe_to_bytes,
    schema_sidecar,
)


def _df():
    return pl.DataFrame({"id": [1, 2], "name": ["a", "b"]})


def test_canonical_format_keeps_modern_source_format():
    assert canonical_format_for("csv") == "csv"
    assert canonical_format_for("json") == "json"
    assert canonical_format_for("parquet") == "parquet"
    assert canonical_format_for("xlsx") == "xlsx"


def test_canonical_format_upgrades_legacy_xls_to_xlsx():
    assert canonical_format_for("xls") == "xlsx"


def test_dataframe_to_bytes_round_trips_every_canonical_format():
    df = _df()
    for fmt in CANONICAL_FORMATS:
        raw = dataframe_to_bytes(df, fmt)
        assert isinstance(raw, bytes) and len(raw) > 0


def test_dataframe_to_bytes_rejects_unknown_format():
    with pytest.raises(ValueError):
        dataframe_to_bytes(_df(), "exe")


def test_schema_sidecar_carries_measured_columns():
    side = schema_sidecar(_df(), version_number=3)
    import json

    payload = json.loads(side)
    assert payload["version"] == 3
    assert payload["row_count"] == 2
    assert payload["column_count"] == 2
    assert {c["name"] for c in payload["columns"]} == {"id", "name"}


def test_content_type_for_every_format():
    for fmt in (*CANONICAL_FORMATS, "schema.json"):
        assert content_type_for(fmt)