"""Cleaning-engine throughput benchmark.

Generates synthetic "messy" datasets at several sizes, runs a representative
set of deterministic cleaning operations through the real
``TransformationEngine``, and reports measured wall-clock throughput.

This measures the actual deterministic core (Polars + Python coercion), not a
mock. It does NOT call any LLM.

Run:
    python -m scripts.benchmark_cleaning
    python scripts/benchmark_cleaning.py

Output is a Markdown table suitable for pasting into
docs/audit/SCALE_BENCHMARK_REPORT.md.
"""

from __future__ import annotations

import platform
import random
import statistics
import time
from datetime import datetime, timezone

import polars as pl

from app.cleaning.engine import TransformationEngine

# Deterministic seed so runs are reproducible.
random.seed(1234)

SIZES = [1_000, 5_000, 8_000, 20_000]
REPEAT = 3  # timed repetitions per size; we report the median.

FIRST = ["  alice", "BOB", "carol ", "dave", "  Eve", "frank", "grace", "Heidi"]
LAST = ["Smith", "  jones", "BROWN", "davis", " Wilson ", "taylor", "lee", "Khan"]
DOMAINS = ["Example.COM", "mail.test", "  shop.io", "ACME.co"]
DATE_FORMATS = ["%m/%d/%Y", "%Y-%m-%d", "%d-%m-%Y", "%b %d, %Y"]
CATEGORIES = ["electronics", "  Books", "CLOTHING", "home & kitchen", "Toys"]


def _messy_email(i: int) -> str:
    dom = DOMAINS[i % len(DOMAINS)]
    return f"{FIRST[i % len(FIRST)].strip()}.{LAST[i % len(LAST)].strip()}{i}@{dom}"


def _messy_date(i: int) -> str:
    fmt = DATE_FORMATS[i % len(DATE_FORMATS)]
    d = datetime(2023, 1, 1, tzinfo=timezone.utc).timestamp() + i * 3600
    return datetime.fromtimestamp(d).strftime(fmt)


def _messy_price(i: int) -> str:
    r = random.random()
    base = f"{random.randint(100, 90000) / 100:.2f}"
    if r < 0.2:
        return f"₹{base}"
    if r < 0.35:
        return f"${base}"
    if r < 0.45:
        return f"  {base}  "
    return base


def build_dataset(n: int) -> pl.DataFrame:
    rows = []
    for i in range(n):
        rows.append(
            {
                "first_name": FIRST[i % len(FIRST)],
                "last_name": LAST[i % len(LAST)],
                "email": _messy_email(i),
                "signup_date": _messy_date(i),
                "price": _messy_price(i),
                "quantity": str(random.randint(1, 50)) if random.random() > 0.1 else "",
                "category": CATEGORIES[i % len(CATEGORIES)],
            }
        )
    # Introduce duplicate rows to exercise de-duplication.
    if n > 10:
        rows[n // 2] = dict(rows[0])
    return pl.DataFrame(rows)


def representative_operations() -> list[dict]:
    """A realistic mix of the deterministic cleaning ops."""
    return [
        {"type": "trim_whitespace", "column": "first_name"},
        {"type": "trim_whitespace", "column": "last_name"},
        {"type": "title_case", "column": "first_name"},
        {"type": "title_case", "column": "last_name"},
        {"type": "normalize_email", "column": "email"},
        {"type": "standardize_date", "column": "signup_date", "parameters": {}},
        {"type": "normalize_currency", "column": "price"},
        {"type": "coerce_numeric", "column": "quantity"},
        {"type": "normalize_category", "column": "category"},
        {"type": "remove_duplicates", "column": None},
        {"type": "flag_outliers", "column": "price"},
    ]


def _run_once(df: pl.DataFrame, ops: list[dict]) -> float:
    engine = TransformationEngine(df)
    start = time.perf_counter()
    result = engine.execute_operations(ops)
    elapsed = time.perf_counter() - start
    # Sanity: engine reports its own duration and applied ops.
    assert result["ops_applied"] > 0, "no operations applied"
    return elapsed


def benchmark() -> list[dict]:
    ops = representative_operations()
    results = []
    for n in SIZES:
        df = build_dataset(n)
        samples = []
        for _ in range(REPEAT):
            samples.append(_run_once(df, ops))
        median_s = statistics.median(samples)
        rows_per_sec = n / median_s if median_s > 0 else 0.0
        results.append(
            {
                "rows": n,
                "cols": df.width,
                "median_s": median_s,
                "min_s": min(samples),
                "max_s": max(samples),
                "rows_per_sec": rows_per_sec,
            }
        )
    return results


def format_markdown(results: list[dict]) -> str:
    lines = [
        "## Cleaning engine throughput (measured)",
        "",
        f"- Python: {platform.python_version()} | Polars: {pl.__version__} | "
        f"OS: {platform.system()} {platform.release()}",
        f"- Ops per run: {len(representative_operations())} (trim, title-case, "
        "email/date/currency/numeric/category normalization, de-dupe, outlier flag)",
        f"- Timed repetitions per size: {REPEAT} (median reported)",
        "",
        "| Rows | Columns | Median time (s) | Min (s) | Max (s) | Rows/sec |",
        "|-----:|--------:|----------------:|--------:|--------:|---------:|",
    ]
    for r in results:
        lines.append(
            f"| {r['rows']:,} | {r['cols']} | {r['median_s']:.4f} | "
            f"{r['min_s']:.4f} | {r['max_s']:.4f} | {r['rows_per_sec']:,.0f} |"
        )
    return "\n".join(lines)


def main() -> None:
    print("Running cleaning benchmark (deterministic core, no LLM)...")
    results = benchmark()
    print()
    print(format_markdown(results))


if __name__ == "__main__":
    main()