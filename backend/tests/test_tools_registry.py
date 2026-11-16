"""Tools Centre: registry/runner parity and runner behaviour.

The parity test is the important one. Part 11 of the brief forbids tool cards
that do nothing, so a tool listed in the registry with no runner behind it is a
defect, not a cosmetic gap. This file fails the build if that ever happens.

The runner tests exercise the real engines (profiler, cleaner, duplicates,
quality) on small frames. They assert measured facts, not snapshots, so a
legitimate change in scoring does not break them while a broken pipeline does.
"""

from __future__ import annotations

import polars as pl
import pytest

from app.core.exceptions import ValidationError
from app.tools import registry, runner


# ── registry ────────────────────────────────────────────────────────────────


def test_every_registered_tool_has_a_runner():
    """A listed tool with no runner would be a dead button."""
    missing = [slug for slug in registry.TOOL_SLUGS if slug not in runner.RUNNERS]
    assert not missing, f"Tools listed without an execution path: {missing}"


def test_every_runner_is_listed():
    orphaned = [slug for slug in runner.RUNNERS if slug not in registry.TOOLS_BY_SLUG]
    assert not orphaned, f"Runners with no catalogue entry: {orphaned}"


def test_tool_slugs_are_unique():
    assert len(registry.TOOL_SLUGS) == len(set(registry.TOOL_SLUGS))


def test_every_tool_declares_categories_and_formats():
    for tool in registry.TOOLS:
        assert tool.category in registry.CATEGORIES, f"{tool.slug} has an unknown category"
        assert tool.input_formats, f"{tool.slug} declares no input formats"
        assert tool.output_formats, f"{tool.slug} declares no output formats"
        assert tool.tagline, f"{tool.slug} has no tagline"
        assert tool.description, f"{tool.slug} has no description"


def test_config_field_keys_are_unique_within_a_tool():
    for tool in registry.TOOLS:
        keys = [f.key for f in tool.fields]
        assert len(keys) == len(set(keys)), f"{tool.slug} has duplicate config keys"


def test_tools_by_category_covers_every_tool():
    grouped = registry.tools_by_category()
    listed = [t["slug"] for items in grouped.values() for t in items]
    assert sorted(listed) == sorted(registry.TOOL_SLUGS)


# ── fixtures ────────────────────────────────────────────────────────────────


def _sample() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "sku": ["A-1", "A-2", "A-3", "A-1", "A-5"],
            "product_name": ["  wireless mouse ", "usb-c hub", "monitor stand", "wireless mouse", None],
            "price": ["$19.99", "49.50", None, "19.99", "12"],
            "email": ["alice@example.com", "bob@example.com", "not-an-email", "alice@example.com", None],
            "category": ["electronics", "Electronics", "furniture", "electronics", "furniture"],
        }
    )


# ── runners ─────────────────────────────────────────────────────────────────


async def test_data_profiler_reports_measured_facts():
    result = await runner.run_tool("data-profiler", _sample(), {})
    assert result["metrics"]["row_count"] == 5
    assert result["metrics"]["column_count"] == 5
    assert result["metrics"]["total_null_count"] >= 1
    assert 0 <= result["metrics"]["overall_score"] <= 100
    assert len(result["columns"]) == 5
    assert result["output_df"] is None, "a profiler must not rewrite the dataset"


async def test_data_cleaner_changes_cells_and_keeps_row_count():
    before = _sample()
    result = await runner.run_tool("data-cleaner", before, {"rules": ["trim_whitespace"]})
    assert result["metrics"]["rows_in"] == before.height
    assert result["metrics"]["rows_out"] == before.height
    assert result["metrics"]["cells_changed"] >= 1
    assert result["output_df"] is not None
    assert result["output_df"]["product_name"][0] == "wireless mouse"


async def test_data_cleaner_rejects_unknown_rule():
    with pytest.raises(ValidationError):
        await runner.run_tool("data-cleaner", _sample(), {"rules": ["make_it_nice"]})


async def test_data_cleaner_requires_a_rule():
    with pytest.raises(ValidationError):
        await runner.run_tool("data-cleaner", _sample(), {"rules": []})


async def test_duplicate_finder_counts_extra_copies_on_a_key():
    result = await runner.run_tool(
        "duplicate-finder", _sample(), {"key_columns": ["sku"], "ignore_case": True}
    )
    # sku A-1 appears twice, so there is exactly one extra copy.
    assert result["metrics"]["extra_copies"] == 1
    assert result["metrics"]["duplicate_group_count"] == 1
    assert result["metrics"]["compared_on"] == ["sku"]


async def test_duplicate_finder_on_whole_rows_needs_identical_rows():
    """With no key columns the comparison is whole-row, not per column."""
    df = pl.DataFrame({"a": ["x", "x", "y"], "b": ["1", "1", "2"]})
    result = await runner.run_tool("duplicate-finder", df, {})
    assert result["metrics"]["extra_copies"] == 1
    assert result["metrics"]["compared_on"] == "all columns"


async def test_duplicate_finder_on_chosen_columns():
    result = await runner.run_tool(
        "duplicate-finder", _sample(), {"key_columns": ["sku"], "ignore_case": True}
    )
    assert result["metrics"]["compared_on"] == ["sku"]


async def test_data_validator_separates_errors_from_warnings():
    result = await runner.run_tool(
        "data-validator",
        _sample(),
        {
            "required_columns": ["email"],
            "numeric_columns": ["price"],
            "email_columns": ["email"],
        },
    )
    assert result["metrics"]["error_count"] >= 1
    assert result["metrics"]["warning_count"] >= 1
    # A blank required field is an error; a malformed email is a warning.
    assert any(e["type"] == "required" for e in result["errors"])
    assert any(w["type"] == "format" for w in result["warnings"])


async def test_data_validator_needs_at_least_one_rule():
    with pytest.raises(ValidationError):
        await runner.run_tool("data-validator", _sample(), {})


async def test_quality_report_exposes_methodology():
    result = await runner.run_tool("quality-report", _sample(), {})
    assert result["methodology"], "the score must be explainable"
    for key in ("completeness_score", "validity_score", "uniqueness_score"):
        assert key in result["metrics"]
    assert result["output_df"] is None


async def test_transformation_builder_applies_rename_and_drop():
    result = await runner.run_tool(
        "transformation-builder",
        _sample(),
        {"rename_map": '{"product_name": "title"}', "drop_columns": ["email"], "trim_all": True},
    )
    out = result["output_df"]
    assert "title" in out.columns
    assert "email" not in out.columns
    assert result["metrics"]["ops_applied"] >= 2


async def test_transformation_builder_rejects_bad_json():
    with pytest.raises(ValidationError):
        await runner.run_tool(
            "transformation-builder", _sample(), {"rename_map": "{not json"}
        )


async def test_transformation_builder_rejects_unknown_column():
    with pytest.raises(ValidationError):
        await runner.run_tool(
            "transformation-builder", _sample(), {"rename_map": '{"nope": "x"}'}
        )


async def test_smart_mapper_matches_and_scores():
    result = await runner.run_tool(
        "smart-mapper", _sample(), {"target_fields": "sku, product_name, price"}
    )
    assert result["metrics"]["targets"] == 3
    assert result["metrics"]["matched"] == 3
    assert all(m["confidence"] > 0 for m in result["mappings"])


async def test_smart_mapper_requires_targets():
    with pytest.raises(ValidationError):
        await runner.run_tool("smart-mapper", _sample(), {})


async def test_smart_mapper_reports_unmatched_targets():
    result = await runner.run_tool(
        "smart-mapper", _sample(), {"target_fields": "sku, totally_absent_field"}
    )
    unmatched = [m for m in result["mappings"] if not m["matched"]]
    assert len(unmatched) == 1
    assert unmatched[0]["target_field"] == "totally_absent_field"


async def test_catalogue_normaliser_unifies_category_casing():
    result = await runner.run_tool(
        "catalogue-normaliser" if False else "catalogue-normalizer",
        _sample(),
        {"category_column": ["category"], "price_column": ["price"], "title_column": ["product_name"]},
    )
    out = result["output_df"]
    categories = out["category"].to_list()
    assert len({c for c in categories if c}) == 2, "electronics/furniture variants should collapse"
    assert result["metrics"]["cells_changed"] >= 1
    assert out["price"].dtype == pl.Float64, "prices should become numeric"


async def test_sku_manager_flags_duplicates_and_blanks():
    result = await runner.run_tool("sku-manager", _sample(), {"sku_column": ["sku"]})
    assert result["metrics"]["duplicate_sku_count"] == 1
    assert result["metrics"]["variant_group_count"] == 0
    assert result["output_df"] is None


async def test_sku_manager_requires_a_sku_column():
    with pytest.raises(ValidationError):
        await runner.run_tool("sku-manager", _sample(), {})


async def test_bulk_exporter_produces_real_bytes():
    result = await runner.run_tool(
        "bulk-exporter", _sample(), {"output_format": "csv", "row_limit": 2}
    )
    assert result["metrics"]["rows_exported"] == 2
    assert result["metrics"]["bytes"] > 0
    assert result["output_bytes"].startswith(b"sku,")
    assert result["output_df"].height == 2


async def test_bulk_exporter_selects_columns():
    result = await runner.run_tool(
        "bulk-exporter", _sample(), {"output_format": "json", "columns": ["sku"]}
    )
    assert result["output_df"].columns == ["sku"]


async def test_bulk_exporter_rejects_unknown_format():
    with pytest.raises(ValidationError):
        await runner.run_tool("bulk-exporter", _sample(), {"output_format": "pdf"})


async def test_bulk_exporter_rejects_unknown_column():
    with pytest.raises(ValidationError):
        await runner.run_tool("bulk-exporter", _sample(), {"columns": ["nope"]})


async def test_unknown_tool_is_rejected():
    with pytest.raises(ValidationError):
        await runner.run_tool("does-not-exist", _sample(), {})


async def test_empty_frame_is_rejected():
    with pytest.raises(ValidationError):
        await runner.run_tool("data-profiler", pl.DataFrame({"a": []}), {})


async def test_ai_enrichment_refuses_without_a_key(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "GROQ_API_KEY", "", raising=False)
    with pytest.raises(Exception) as excinfo:
        await runner.run_tool(
            "ai-enrichment", _sample(), {"title_column": ["product_name"], "row_limit": 2}
        )
    assert "GROQ_API_KEY" in str(excinfo.value) or "AI provider" in str(excinfo.value)


async def test_serialise_drops_binary_payloads():
    result = await runner.run_tool("bulk-exporter", _sample(), {"output_format": "csv"})
    payload = runner.serialise(result)
    assert "output_df" not in payload
    assert "output_bytes" not in payload
    assert payload["has_output"] is True
    assert payload["tool"] == "bulk-exporter"