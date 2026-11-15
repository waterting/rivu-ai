# Rivu AI — Production Readiness & Engineering Audit

**Audit date:** 2026-11-15
**Scope:** source tree, CI, ingestion, transformation, auth, storage, reporting, frontend integration, load and security gates.

## Executive result
Rivu has a real SaaS/data-refinery foundation with a substantial hardening pass behind it. **It is not yet evidence-backed for a 150,000 requests/second production launch.** That specific number still requires a staged distributed load test against the actual deployment, database, object storage, CDN and worker architecture — the harness to produce that evidence now exists in this repository, but the top stages have not been run against real infrastructure.

## Verified strengths
- Next.js frontend + FastAPI API + PostgreSQL + S3-compatible storage.
- Immutable dataset-version model for raw/refined data.
- LLM produces plans; deterministic engine executes allowlisted operations.
- CSV parsing is strict: ragged rows are not silently truncated.
- AI transformation plans require explicit approval at the API layer.
- Production configuration rejects development JWT/S3/payment settings, and every guardrail is now pinned by tests.
- CI contains Python tests, dependency audits, dependency review and CodeQL.
- Durable worker queue with row-level locking, stale-job recovery, retry and idempotency.
- Refresh-token rotation, email verification, and password-reset workflows.
- Presigned downloads are tenant-scoped, TTL-bounded and audit-logged.
- Observability exposes queue, processing, storage and HTTP metrics.

## Findings

### CRITICAL — release blockers
1. **150k RPS is not demonstrated by deployed load-test evidence.** `scripts/load-test.mjs` now runs staged 1k → 10k → 50k → 150k tests, records p50/p95/p99 and error rate per stage, and reports the highest rate a target actually sustains. A single Node process tops out around 7k RPS on a trivial endpoint, so the top stages must be run with `--workers` across machines against the real deployment. The claim stays unverified until that run exists.
2. **Heavy processing must not run in request workers at scale.** The durable queue exists; production must actually route ingestion/profile/refinement through it rather than FastAPI `BackgroundTasks`.
3. **Peak decode memory is now measured and bounded** (`MAX_DECODED_SIZE_MB`, `MEASURE_PARSE_MEMORY`, `peak_rss_mb`), but saturation behaviour under real large files still needs a deployed measurement.
4. **Organization selection should be explicit, not first-membership.** Several endpoints still default to the first membership; centralise tenant context before multi-tenant enterprise use.

### HIGH
5. CSV encoding/delimiter is now persisted on `dataset_versions` (migration 0011) and surfaced in the API.
6. XLS parses and outputs as XLS rather than collapsing into XLSX.
7. Refresh tokens persist rotation/revocation families.
8. Email verification and password-reset workflows exist.
9. CI is not yet a deployed end-to-end gate for upload → profile → AI plan → approval → transformation → artifact → report.

### MEDIUM
10. PDF report is branded text but still does not embed the supplied visual logo asset.
11. Report generation calls AI synchronously.
12. Refinement derives sibling artifacts on demand instead of pre-writing every format, cutting storage/CPU cost.
13. Presigned downloads carry audit events, tenant scoping and lifecycle checks.
14. Observability covers queue, processing, storage, DB-pool and HTTP metrics; AI-latency metrics remain to be added.

## Security verification (new)
`backend/tests/test_production_security.py` is a 25-assertion release gate covering:
- every production config guardrail (JWT secret length, DEBUG, AUTO_CREATE_SCHEMA, S3 TLS/HTTPS, non-default S3 credentials, Razorpay live secret and test-signature rejection);
- the catalogue portal's separate JWT secret and schema guardrail;
- CORS never wildcarding and rejecting unknown origins;
- security headers (nosniff, frame DENY, CSP, Referrer-Policy, Permissions-Policy) on live responses;
- `cache-control: no-store` on authenticated routes;
- generic 500 bodies in production versus verbose ones in development;
- access/refresh token type separation and tamper rejection;
- a public `/metrics` endpoint that stays aggregate-only.

## Secret hygiene (new)
- Every audit script previously shipped a hardcoded fallback password. They now read `E2E_EMAIL` / `E2E_PASSWORD` from the environment via `scripts/lib/credentials.mjs`, exiting with code 2 and actionable instructions when unset.
- `.gitignore` now covers every `.env.*` variant plus PEM/key/keystore/service-account patterns, while keeping the committed `*.example` templates.
- Verified: no `.env`, `.pem`, `.key` or secrets file has ever been added to this repository's history.
- **Residual:** the local smoke-test password literal still exists in three historical commits (`5ee6d41`, `18d2b81`, and its removal commit). It was never a deployment credential, so the bounded remedy is to rotate it wherever it is still in use rather than rewrite history.

## Data-format test matrix
CSV strict ragged-row rejection · CSV delimiter detection · UTF-8/non-ASCII · JSON records · Parquet signature validation · XLSX signature validation · XLS identification/parser path · deterministic whitespace/lowercase cleaning · duplicate removal · invalid-column isolation.

## Production architecture for the stated scale
`CDN/WAF → load balancer → stateless Next.js/API replicas → Redis/queue → dedicated ingestion/profile/refinement workers → PostgreSQL + pooling/read replicas → object storage/CDN`

Large-data processing should leave request workers. Prefer direct multipart object-storage uploads with short-lived upload URLs, then enqueue processing by object key.

## Release gates
- frontend build + lint ✅
- backend unit/integration tests ✅ (311 passed, 4 skipped)
- security verification suite ✅ (25 assertions)
- tenant-isolation tests ✅
- auth/refresh/revocation tests ✅
- malformed/malicious file tests ✅
- all supported-format round trips ✅
- transformation invariants ✅
- artifact checksum/version tests ✅
- deployed E2E ⏳
- staged 1k → 10k → 50k → 150k RPS tests ⏳ (harness ready, top stages need deployed infra)
- p50/p95/p99 latency and error budgets ⏳
- DB/CPU/memory/queue/storage saturation measurements ⏳
- retry/idempotency/failure tests ✅
- security and secret scanning ✅
- rollback test ⏳

## Security
Secrets must remain outside Git and inside the production platform secret manager. GitHub recommends least-privilege workflow permissions and short-lived cloud credentials such as OIDC where supported.

## Current conclusion
**Engineering status: hardening / verification in progress.** The local gates (tests, lint, build, migration SQL, security assertions, secret hygiene) all pass. Do not claim 150k RPS production readiness until the staged load test has been run against the deployed target with `--workers` across multiple machines.