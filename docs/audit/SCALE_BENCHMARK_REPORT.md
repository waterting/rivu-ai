# Scale Benchmark Report

Status: **Measured** (deterministic cleaning core, real engine)
Date: 2026-11-14
Scope: Priority 5 of the production-readiness sprint.

## What was measured

The deterministic **cleaning engine** (`backend/app/cleaning/engine.py`,
`TransformationEngine`) — the part that actually mutates data after a human
approves a plan. No LLM is involved in this path, so the numbers below are
pure compute.

Harness: `backend/scripts/benchmark_cleaning.py` (committed, reproducible).

### Method

- Synthetic "messy" datasets at **1,000 / 5,000 / 8,000 / 20,000 rows × 7
  columns**, with realistic dirt: padded/mixed-case names, mixed-case emails
  with padded domains, four different date formats, currency-prefixed prices,
  blank numerics, mixed-case categories, plus injected duplicate rows.
- **11 representative operations** per run: trim, title-case, email
  normalization, date standardization, currency normalization, numeric
  coercion, category normalization, de-duplication, outlier flagging.
- Each size timed **3 times**; the **median** is reported.

### Environment

| Component | Value |
|-----------|-------|
| Python | 3.13.0 |
| Polars | 1.17.1 |
| OS | Windows 11 |

## Measured results

| Rows | Columns | Median time (s) | Min (s) | Max (s) | Rows/sec |
|-----:|--------:|----------------:|--------:|--------:|---------:|
| 1,000 | 7 | 0.0294 | 0.0269 | 0.0590 | 34,021 |
| 5,000 | 7 | 0.1401 | 0.1370 | 0.1502 | 35,677 |
| 8,000 | 7 | 0.2111 | 0.2078 | 0.2196 | 37,889 |
| 20,000 | 7 | 0.5451 | 0.5357 | 0.5491 | 36,692 |

Raw engine self-reported durations (from `transformation_complete` log lines)
match the wall-clock medians closely, confirming the timing is dominated by the
transformations themselves, not harness overhead.

## Interpretation

- Throughput is **flat at roughly 35k–38k rows/sec** across a 20× size range,
  i.e. the engine scales **linearly** — no super-linear blow-up at 20k rows.
- 20,000 rows × 11 ops completes in **~0.55 s** on a single machine.
- The slowest individual operations are the ones that fall back to Python
  per-value mapping (`title_case`, `standardize_date` via `dateutil`); Polars
  vectorised ops (`trim`, `lowercase`, `normalize_email`) are much faster. The
  mix above is intentionally weighted toward the slower Python-map ops, so the
  reported throughput is a **conservative** figure for real-world data.

## Explicitly out of scope (not measured, not claimed)

This benchmark measures the **deterministic cleaning core only**. It does not
measure, and this report does **not** claim, end-to-end numbers for:

- File upload + parsing (CSV/XLSX/JSON/PDF) at these sizes.
- Database round-trips (row persistence, versioning).
- Any LLM planner/enrichment latency (Groq), which is network-bound and not
  benchmarked here.

Those remain unmeasured because no hosted database, object storage, or paid AI
credentials are provisioned in this environment. This report makes **no**
production throughput claim for the full pipeline — only for the deterministic
cleaning engine, which is what was actually executed and timed.

## How to reproduce

```powershell
cd backend
python -m scripts.benchmark_cleaning
```