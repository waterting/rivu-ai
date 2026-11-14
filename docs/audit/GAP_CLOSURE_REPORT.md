# Gap Closure Report

Status: **Sprint close-out**
Date: 2026-11-14
Scope: Priority 7 of the production-readiness sprint.
Baseline: `docs/RIVU_PRODUCT_AUDIT.md` (findings §7.1–§7.8, §6 matrix).

## Status legend

| Label | Meaning |
|-------|---------|
| **FIXED** | Change implemented, tested, and committed. |
| **STILL OPEN** | Real gap; documented, not fixed this sprint (often intentional). |
| **BLOCKED — CREDENTIALS** | Code exists; needs a secret the environment does not have. |
| **BLOCKED — ENVIRONMENT** | Needs infra this machine lacks (e.g. hosted DB/object storage). |
| **NOT IMPLEMENTED** | Deliberately not built (no official API, or out of scope). |

---

## Findings §7.1 – §7.8

### §7.1 "AI mapping" is deterministic fuzzy matching — **FIXED**
Relabeled the marketing from "AI-assisted mapping" to **"Smart, rule-based
mapping"** in `app/(marketing)/platform/page.tsx` and
`app/(marketing)/nav-config.ts`. The genuinely AI-powered dataset refinement
planner (`ai/planner.py`, Groq) is left labeled as AI. Commit `93bf5a2`.

### §7.2 Shopify is custom-app token flow, not full OAuth — **STILL OPEN (OAuth not implemented)**
The custom-app Admin API token flow works (real GraphQL client, draft-first
`productCreate`). OAuth redirect/callback, webhooks, uninstall handling, and
token revocation are **not implemented**. Fully documented in
`docs/audit/SHOPIFY_GAP_ANALYSIS.md` with a remediation path. The integration
must not be marketed as an installable app until then. Commit `f750fad`.

### §7.3 Razorpay test-mode bypass — **FIXED**
`verify_payment_signature` now:
- Always verifies real HMAC-SHA256 over `order_id|payment_id` with
  `RAZORPAY_KEY_SECRET`.
- Only honours the `sig_test_` / `valid_test_signature` bypass when `APP_ENV`
  is an explicit non-production test env **and** `RAZORPAY_ALLOW_TEST_SIGNATURES`
  is explicitly enabled.
- Fails closed on missing/unknown env, missing secret, or production.
- Production settings validation rejects `RAZORPAY_ALLOW_TEST_SIGNATURES=True`
  and placeholder/missing `RAZORPAY_KEY_SECRET`.

Covered by `tests/test_razorpay_security.py` (11 cases) and the updated
`test_saas_ecommerce.py` (real HMAC + forged-signature rejection). Commit
`a75a710`.

### §7.4 No large-catalogue benchmark measured — **FIXED (cleaning core)**
Added `backend/scripts/benchmark_cleaning.py`; measured the deterministic
cleaning engine at 1k / 5k / 8k / 20k rows × 11 ops. Throughput is flat at
**~35k–38k rows/sec** and scales linearly; 20k rows in ~0.55 s. Numbers and
method in `docs/audit/SCALE_BENCHMARK_REPORT.md`. Commit `a4ebf69`.
**Scope note:** this measures the deterministic core only; full pipeline
(upload/parse/DB/LLM) remains unmeasured (no hosted infra).

### §7.5 Two DBs / two auth systems — **STILL OPEN (intentional)**
Documented as an intentional data boundary (separate `CATALOGUE_DATABASE_URL`,
separate JWT secret, `workspace_id` scoping). A product decision on unified
identity is still pending. No change this sprint.

### §7.6 GST invoicing — **BLOCKED — CREDENTIALS**
Invoice/order code exists, but no real company GSTIN/tax rules are configured
(correctly — none invented). Needs the founder's GSTIN + tax rules to produce
compliant PDFs.

### §7.7 IndiaMART — **NOT IMPLEMENTED (correct)**
No IndiaMART integration; no official API. File-based workflow only. No claim
of direct integration.

### §7.8 Lead pipeline / sample prospects — **BLOCKED — CREDENTIALS**
Sales CRM structure exists; the 8 prospect slots must be filled only with
founder-supplied real data. None hardcoded (correct).

---

## §6 acceptance matrix — movement

| Feature | Before | After |
|---------|--------|-------|
| DB-backed tests vs real Postgres | ❌ not run (env blocked) | ✅ **FIXED** — embedded PG 17.2, migrations + integration tests |
| Razorpay signature verify | ⚠️ test bypass open | ✅ **FIXED** — env-gated, fail-closed, tested |
| Large-catalogue benchmark | ❌ not measured | ✅ **FIXED** — cleaning core measured (~35k rows/s) |
| AI mapping honesty | ❌ mislabeled | ✅ **FIXED** — relabeled to rule-based |
| Shopify OAuth | ❌ not implemented | ⏸ **STILL OPEN** — documented gap |
| GST invoicing | ⚠️ blocked | ⏸ **BLOCKED — CREDENTIALS** |
| AI enrichment (Groq) | ⚠️ blocked | ⏸ **BLOCKED — CREDENTIALS** |
| IndiaMART | ❌ none | ⏸ **NOT IMPLEMENTED (correct)** |

---

## Summary

- **4 findings fixed** (7.1, 7.3, 7.4, plus the DB-testing blocker from §7).
- **2 intentionally open** (7.2 Shopify OAuth, 7.5 dual-DB/identity).
- **2 blocked on credentials** (7.6 GST, 7.8 prospects; plus Groq/Shopify/Razorpay
  live keys).
- **1 correctly not implemented** (7.7 IndiaMART).

No metric, customer, or live-integration claim was fabricated. Every "fixed"
item is backed by committed code + tests in this repository.