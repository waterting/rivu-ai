# Final Production Readiness

Status: **Conditionally ready — not fully production-ready**
Date: 2026-11-14
Scope: Sprint close-out (Priority 7).
Baseline: `docs/RIVU_PRODUCT_AUDIT.md`. See also `GAP_CLOSURE_REPORT.md`,
`DB_INTEGRATION_REPORT.md`, `SCALE_BENCHMARK_REPORT.md`,
`FUNCTION_INVENTORY.md`, `SHOPIFY_GAP_ANALYSIS.md`.

## Verdict

The core product is **real, tested, and honest**. This sprint closed the
highest-value gaps (Razorpay security, real-Postgres verification, benchmark,
mapping honesty) and documented the rest with no fabricated claims.

It is **not** declared fully production-ready, because several items are
**blocked on credentials or a product decision** that only the operator can
supply. The blockers below are external, not code defects.

## Verified this sprint

| Area | Evidence |
|------|----------|
| Razorpay signature verification | Env-gated, fail-closed; 11 security tests + updated e2e (real HMAC, forged sig rejected) |
| Real PostgreSQL | Alembic chain 0001–0007 applies clean on PostgreSQL 17.2; 4 real-DB integration tests (tenant isolation, role gates, pending-invite denial) |
| Regression suite | 146 passed with DB; 142 passed + 4 skipped hermetic (no DB) |
| Frontend | `npm run lint` + `npm run build` clean |
| Cleaning benchmark | ~35k–38k rows/sec, linear to 20k rows |
| Mapping honesty | Relabeled to "Smart, rule-based mapping" |

## Hard blockers before going live (external, cannot be closed in-repo)

1. **Hosted PostgreSQL** — the migration chain and integration tests pass on a
   local embedded PG 17.2, but production needs a real managed Postgres
   (Neon/RDS) with `AUTO_CREATE_SCHEMA=false` and Alembic run as a release step.
2. **Razorpay live keys** — `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` /
   `RAZORPAY_WEBHOOK_SECRET` must be set in the production environment.
   `RAZORPAY_ALLOW_TEST_SIGNATURES` must remain **false** (production validation
   now enforces this).
3. **Groq API key** — required for AI refinement planning and catalogue
   enrichment.
4. **S3 / object storage** — endpoint + credentials for dataset/export storage.
5. **SMTP / email provider** — for verification and password-reset emails.
6. **Google OAuth client ID/secret** — for Google login.
7. **Company GSTIN + tax rules** — required for compliant GST invoice PDFs.
8. **Shopify decision** — custom-app token flow works for a single store; a
   public app needs the OAuth + webhook work in `SHOPIFY_GAP_ANALYSIS.md`.

## Known open items (documented, not blocking core)

- **Shopify OAuth/webhooks/uninstall** — not implemented (gap analysis done).
- **Dual DB / dual identity** — intentional; unified identity is a product call.
- **Catalogue real-DB migration run** — main DB verified end-to-end; catalogue
  boundary covered by mock suite; a live catalogue DB run is a follow-up.
- **Full-pipeline throughput** — only the deterministic cleaning core is
  benchmarked; upload/parse/DB/LLM latency is unmeasured (no hosted infra).

## What is explicitly NOT claimed

- No customer counts, revenue, conversion, or prospect data.
- No "live" integration without credentials.
- No end-to-end pipeline performance number.
- No production-ready certification until the blockers above are supplied and a
  staging deploy is verified.

## Recommended order to reach production

1. Provision managed Postgres; run Alembic as a release step.
2. Set the credentials in §"Hard blockers" (Razorpay, Groq, S3, SMTP, Google).
3. Deploy to staging; smoke-test signup → login → upload → profile → plan →
   approve → transform → export, and a Razorpay test-mode payment with the
   bypass disabled.
4. Decide the Shopify public-app question (build OAuth or ship custom-app only).
5. Supply GSTIN + tax rules for invoice PDFs.
6. Re-run the full suite against the staging DB before promoting to prod.