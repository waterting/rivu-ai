"""Peak parse memory must be measured and the decoded size bounded.

Audit finding: heavy processing materializes large files in memory, so peak
memory has to be measured and bounded rather than assumed.
"""

import tracemalloc

import pytest

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.ingestion.memory import current_rss_mb, peak_rss_mb
from app.ingestion.parser import (
    _check_decoded_budget,
    decoded_size_budget_bytes,
    parse_to_polars,
)


def test_peak_rss_is_reported_for_a_csv_parse():
    data = "id,name\n1,Alice\n2,Bob\n".encode("utf-8")
    _df, meta = parse_to_polars(data, "csv", "people.csv")

    # RSS is process-wide, so the assertion is a plausible positive number
    # rather than an exact figure.
    assert meta["peak_rss_mb"] > 0
    assert meta["peak_rss_mb"] >= meta.get("python_alloc_mb", 0)


def test_parsing_does_not_leak_a_python_tracer():
    parse_to_polars("id\n1\n".encode("utf-8"), "csv", "one.csv")
    # A stopped tracer must not stay behind, or later parses would measure the
    # wrong baseline.
    assert not tracemalloc.is_tracing()


def test_memory_helpers_return_numbers():
    assert peak_rss_mb() > 0
    assert current_rss_mb() > 0


def test_decoded_budget_is_derived_from_config(monkeypatch):
    monkeypatch.setattr(settings, "MAX_DECODED_SIZE_MB", 2)

    assert decoded_size_budget_bytes() == 2 * 1024 * 1024


def test_oversized_payload_is_rejected_before_decoding(monkeypatch):
    monkeypatch.setattr(settings, "MAX_DECODED_SIZE_MB", 1)

    payload = b"a" * (1024 * 1024 + 1)

    with pytest.raises(ValidationError, match="too large to decode safely"):
        _check_decoded_budget(payload, "utf-8")


def test_small_payload_passes_the_budget(monkeypatch):
    monkeypatch.setattr(settings, "MAX_DECODED_SIZE_MB", 1)

    _check_decoded_budget(b"a,b\n1,2\n", "utf-8")