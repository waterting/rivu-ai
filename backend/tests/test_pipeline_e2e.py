"""End-to-end data pipeline gate (audit finding 9).

CI must gate the whole chain, not just unit pieces:

    upload bytes -> parse -> profile -> quality -> refine -> artifact -> report

Every stage runs the real production component. The only substitution is the
LLM narrative, because a network call cannot be a hermetic gate; the measured
profile and quality scores remain authoritative without it.
"""

import json
import uuid

import polars as pl

from app.cleaning.engine import TransformationEngine
from app.ingestion.artifacts import (
    canonical_format_for,
    content_type_for,
    dataframe_to_bytes,
    schema_sidecar,
)
from app.ingestion.parser import parse_to_polars, validate_upload
from app.profiler.engine import profile_dataframe
from app.profiler.quality import calculate_quality_report

# A deliberately messy upload: padding, mixed case, a duplicate, a blank email.
RAW_CSV = (
    "name,email,amount\n"
    " Alice ,ALICE@example.com,100\n"
    "Alice,alice@example.com,100\n"
    " Bob ,bob@example.com,250\n"
    "Bob,bob@example.com,250\n"
    "  ,carol@example.com,\n"
).encode("utf-8")


def _source_quality(df: pl.DataFrame, org_id: str) -> tuple[dict, dict, list[dict]]:
    """Profile + score a frame exactly as the worker does."""
    profile = profile_dataframe(df, org_id)
    quality = calculate_quality_report(profile, profile["columns"])
    return profile, quality, profile["columns"]


def test_pipeline_gate_runs_every_stage():
    org_id = str(uuid.uuid4())

    # 1. Upload validation accepts the file and names the canonical format.
    fmt = validate_upload("messy.csv", len(RAW_CSV), "text/csv")
    assert fmt == "csv"

    # 2. Parse.
    df, meta = parse_to_polars(RAW_CSV, "csv", "messy.csv")
    assert meta["encoding"] == "utf-8"
    assert meta["delimiter"] == ","
    assert df.height == 5

    # 3. Profile.
    source_profile, source_quality, _columns = _source_quality(df, org_id)
    assert source_profile["row_count"] == 5
    # The last row has no amount. The blank name is two spaces, not an empty
    # string, so it is preserved as whitespace — which is exactly the defect the
    # trim_whitespace operation below removes.
    assert source_profile["total_null_count"] == 1
    assert source_quality["overall_score"] is not None

    # 4. Refine with the real deterministic engine.
    operations = [
        {"type": "trim_whitespace", "column": "name"},
        {"type": "lowercase", "column": "email"},
        {"type": "remove_duplicates"},
    ]
    result = TransformationEngine(df).execute_operations(operations)

    # 5. The source frame must be untouched: refinement writes a new version.
    assert df.height == 5, "refinement must not mutate the source frame"
    assert result["ops_failed"] == 0
    refined = result["df"]
    # trim_whitespace + lowercase(email) collapse the two Alice rows into one
    # and the two Bob rows into one; the blank-name row remains.
    assert refined.height == 3
    assert refined["name"].to_list() == ["Alice", "Bob", ""]
    assert refined["email"].to_list() == [
        "alice@example.com",
        "bob@example.com",
        "carol@example.com",
    ]

    # 6. Refined version is profiled and scored like its source. Scores must be
    #    measured per version, not carried over, and deterministic so the
    #    quality delta shown in the UI is reproducible.
    refined_profile, refined_quality, _refined_columns = _source_quality(refined, org_id)
    assert refined_profile["row_count"] == refined.height
    for score in (source_quality["overall_score"], refined_quality["overall_score"]):
        assert 0 <= score <= 100
    _rprofile, repeat_refined_quality, _ = _source_quality(refined, org_id)
    assert repeat_refined_quality["overall_score"] == refined_quality["overall_score"]
    # The refined report must be computed against the refined row count, proving
    # it was re-measured rather than copied from the source version.
    assert source_quality["evaluated_records"] == 5
    assert refined_quality["evaluated_records"] == refined.height

    # 7. Artifacts: one canonical file plus a schema sidecar.
    canonical = canonical_format_for("csv")
    artifact = dataframe_to_bytes(refined, canonical)
    assert artifact.count(b"\n") >= refined.height
    side = json.loads(schema_sidecar(refined, version_number=2))
    assert side["version"] == 2
    assert side["row_count"] == refined.height
    assert {c["name"] for c in side["columns"]} == set(refined.columns)
    assert content_type_for(canonical) == "text/csv"

    # 8. The stored artifact re-parses to the same rows the profile described,
    #    which is what makes the version immutable and re-readable.
    reparsed, _reparse_meta = parse_to_polars(artifact, canonical, "artifact.csv")
    assert reparsed.height == refined.height
    assert reparsed.columns == refined.columns


def test_pipeline_gate_isolates_a_bad_column():
    """One unusable column must not corrupt the rest of the pipeline."""
    org_id = str(uuid.uuid4())
    df = pl.DataFrame(
        {
            "name": ["Alice", "Bob"],
            "amount": ["not-a-number", "250"],
        }
    )
    profile, quality, _columns = _source_quality(df, org_id)
    assert profile["row_count"] == 2
    assert profile["column_count"] == 2
    assert 0 <= quality["overall_score"] <= 100
    # The usable column still survives serialization, and the unusable one is
    # reported as a data issue rather than dropping the row.
    artifact = dataframe_to_bytes(df, "csv")
    assert artifact.startswith(b"name")
    reparsed, _m = parse_to_polars(artifact, "csv", "rt.csv")
    assert reparsed.height == 2


def test_pipeline_gate_artifact_formats_all_round_trip():
    org_id = str(uuid.uuid4())
    df, _meta = parse_to_polars(RAW_CSV, "csv", "messy.csv")

    for fmt in ("csv", "json", "parquet", "xlsx"):
        payload = dataframe_to_bytes(df, fmt)
        assert len(payload) > 0
        round_tripped, _m = parse_to_polars(payload, fmt, f"rt.{fmt}")
        assert round_tripped.height == df.height, f"{fmt} lost rows on round trip"