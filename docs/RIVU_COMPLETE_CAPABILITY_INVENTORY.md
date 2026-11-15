# Rivu AI — Complete Capability Inventory

> **Nature of this document:** a factual, evidence-based discovery of the Rivu AI
> repository as it exists today. It is **not** a roadmap and does **not** modify
> code. Every claim is tied to a file path and (where useful) a line number.
> Where the marketing site or pitch deck claims something the code does not
> implement, that gap is called out explicitly.

- **Repository:** `rivu-ai` (Next.js frontend + FastAPI backend, monorepo).
- **Audit date:** 2026-11-15.
- **Method:** full read of frontend `app/**`, backend `backend/app/**`, Alembic
  migrations, `render.yaml`, `vercel.json`, `docker-compose.yml`, `requirements.txt`,
  `package.json`; plus a live probe of the deployed API (`https://rivu-ai.onrender.com`)
  and a headless-browser probe of the live site (`https://rivu-ai-woad.vercel.app`).
- **Companion documents (detailed tables):**
  - `docs/RIVU_TOOLS_INVENTORY.md`
  - `docs/RIVU_SERVICES_INVENTORY.md`
  - `docs/RIVU_INTEGRATIONS_INVENTORY.md`
  - `docs/RIVU_API_INVENTORY.md`
  - `docs/RIVU_WORKFLOWS.md`

---

## Status vocabulary (used throughout)

| Label | Meaning |
|---|---|
| **WORKING & TESTED** | Code exists, automated tests pass, behaviour verified. |
| **WORKING** | Code exists and runs; not necessarily covered by an automated test. |
| **PARTIAL** | Some steps implemented; a material step is missing or simulated. |
| **UI ONLY** | Frontend present; backend not wired or returns static data. |
| **MOCKED / SIMULATED** | Returns hardcoded/fixture data instead of real work. |
| **BLOCKED — CREDENTIALS** | Real code exists; needs a secret not present in this environment. |
| **BLOCKED — ENVIRONMENT** | Needs infrastructure (e.g. a running background worker) not present. |
| **NOT IMPLEMENTED** | Not built. |
| **UNUSED / DEPRECATED** | Code exists but no caller (dead path) or superseded. |

> **"Working" is never asserted just because source exists.** Where a feature was
> exercised live, it is marked verified with the evidence noted.

---

## 1. Complete product module inventory

Rivu ships **two product surfaces** that share one codebase but have separate
identity and data boundaries:

1. **Main Rivu app** — tenant-isolated workspace (`/dashboard`, `/services`) for
   data ingestion, profiling, AI-assisted refinement, transformation, export,
   plus PIM/commerce, billing, analytics, CRM.
2. **Catalogue Data Entry portal** — a separate application with its own database
   (`CATALOGUE_DATABASE_URL`), its own JWT secret, and `workspace_id` scoping
   (`/our-solutions/catalogue-data-entry`).

### Module map

| # | Module | Purpose | Frontend | Backend | DB models | Status |
|---|---|---|---|---|---|---|
| 1 | **Auth & Identity** | Signup/login, JWT access+refresh, Google OAuth, email verification, password reset, token revocation | `app/login`, `app/signup`, `app/reset-password`, `app/verify-email` | `api/v1/endpoints/auth.py`, `core/security.py`, `core/email.py` | `User`, `Membership`, `Organization` | WORKING (email/Google blocked by creds) |
| 2 | **Organization & RBAC** | Multi-tenant workspaces; owner/admin/editor/viewer roles | (implicit in dashboard) | `core/security.py` (`require_org_role`), `models/organization.py` | `Organization`, `Membership` | WORKING & TESTED |
| 3 | **Projects** | Group datasets under a workspace project | `app/dashboard` | `api/v1/endpoints/projects.py` | `Project` | WORKING |
| 4 | **Dataset Ingestion** | Upload CSV/XLSX/XLS/JSON/Parquet; validate; store to S3; queue profiling | `app/dashboard`, `app/services` | `endpoints/datasets.py`, `ingestion/parser.py`, `core/storage.py` | `DataSource`, `DatasetVersion` | WORKING (worker-dependent — see §8/known issues) |
| 5 | **Profiling** | Structural/statistical/semantic column profiling | `app/dashboard`, `app/services` | `profiler/engine.py` | `DataProfile`, `ColumnProfile` | WORKING |
| 6 | **Quality Analysis** | Weighted quality scores + issue findings | `app/dashboard`, `app/services` | `profiler/quality.py` | `QualityReport`, `QualityIssue` | WORKING |
| 7 | **AI Refinement Planning** | Groq generates an allowlisted transformation plan | `app/dashboard/dataset/[id]`, `app/services` | `ai/planner.py`, `ai/groq_client.py`, `ai/factory.py` | `TransformationPlan` | WORKING (blocked by `GROQ_API_KEY`) |
| 8 | **Transformation** | Deterministic Polars ops; preview → approve → execute → new version | `app/dashboard/dataset/[id]`, `app/services` | `endpoints/transformations.py`, `cleaning/engine.py` | `TransformationPlan`, `TransformationRun`, `DatasetVersion` | WORKING & TESTED |
| 9 | **Data Export** | Versioned export to CSV/XLSX/JSON/Parquet | `app/dashboard/dataset/[id]` | `endpoints/datasets.py` (export) | `DatasetVersion` | WORKING |
| 10 | **Reports** | JSON / dashboard / PDF / executive-PDF reports (AI summary + fallback) | `app/dashboard`, `app/dashboard/dataset/[id]` | `endpoints/reports.py` | `DataProfile`, `QualityReport` | WORKING (AI summary blocked by key; has fallback) |
| 11 | **PIM / Product Management** | Canonical product records, variants, completeness scoring | `app/dashboard/channels` (read) | `endpoints/commerce.py`, `models/commerce.py` | `Product`, `ProductVariant` | WORKING (create endpoint unused by UI) |
| 12 | **Supplier Management** | Supplier directory + mapping recipes | `app/dashboard/suppliers` | `endpoints/commerce.py` | `Supplier`, `SupplierMappingRecipe` | WORKING |
| 13 | **Channel Management** | Connect stores; publish products as drafts | `app/dashboard/channels` | `endpoints/commerce.py`, `core/shopify.py` | `ChannelConnection`, `ChannelProductListing` | PARTIAL (Shopify sandbox; contract mismatch) |
| 14 | **Catalogue Data Entry** | Separate portal: upload → map → validate → enrich → export | `app/our-solutions/catalogue-data-entry` | `catalogue/router.py`, `catalogue/*` | Catalogue DB models | WORKING (separate DB; enrich advisory) |
| 15 | **Billing & Subscriptions** | Plans, Razorpay orders, HMAC verify, invoices, usage metering | `app/dashboard/billing` | `endpoints/billing.py`, `core/razorpay.py`, `core/entitlements.py` | `SubscriptionPlan`, `Subscription`, `Invoice`, `Payment`, `UsageEvent` | PARTIAL (UI sends simulated signature) |
| 16 | **Entitlements** | Enforce SKU/AI/channel plan limits | (used by commerce) | `core/entitlements.py` | `SubscriptionPlan`, `Subscription`, `UsageEvent` | WORKING (only 2 event types enforced) |
| 17 | **Analytics** | Workspace KPIs + (unauthenticated-role) admin KPIs | none (no UI caller) | `endpoints/analytics.py` | aggregates over commerce/billing | PARTIAL (admin endpoint has no role gate; "MRR" is monthly invoices) |
| 18 | **Custom Solutions & Sales CRM** | Enterprise project pipeline + lead CRM | none (no UI caller) | `endpoints/custom_solutions.py` | `CustomSolutionProject`, `ProjectMilestone`, `Lead` | WORKING but UNUSED by UI (leads not org-scoped) |
| 19 | **Background Jobs / Worker** | Durable DB-backed job queue + processor | n/a | `workers/runner.py`, `workers/processor.py` | `Job`, `JobLog` | WORKING (worker not running on live deploy — see Known Issues) |
| 20 | **Marketing site** | Public pages, 3D scenes, pricing, docs hub | `app/(marketing)/**`, `app/our-services`, `app/services` (marketing) | none (static) | n/a | STATIC-MARKETING |

> **Duplicate/legacy surfaces to note:** `app/services` is an *authenticated*
> "Data Studio" that duplicates the dashboard refinement flow; `app/our-services`
> is a marketing page; `app/our-solutions/catalogue-data-entry` is the catalogue
> portal. `app/(marketing)/tools` is a **catalog only** (no functional tools).

---

## 2. Tools inventory (summary)

**Critical finding:** the public `/tools` page is a **marketing catalog of 14
named tools, none of which are functional on that page** (no upload, no
processing, no export — the cards are static `<div>`s). The tools that are
*actually functional* live inside the authenticated workspace
(`/dashboard`, `/dashboard/dataset/[id]`, `/services`, and the Catalogue Portal).

| Tool (as marketed) | Actually functional? | Where it really lives | Backend engine |
|---|---|---|---|
| Format Studio | ✅ (as export formats) | Dataset export | `endpoints/datasets.py` export |
| Data Profiler | ✅ | Dashboard / Data Studio | `profiler/engine.py` |
| Data Cleaner | ✅ | Refinement transform | `cleaning/engine.py` |
| Data Validator | ✅ | Quality analysis | `profiler/quality.py` |
| Smart Column Mapper | ✅ (catalogue only) | Catalogue Portal | `catalogue/mapping.py` |
| AI Product Enrichment | ✅ (advisory) | Catalogue Portal | `catalogue/ai_enrich.py` |
| Catalogue Normalizer | ✅ | Catalogue Portal | `catalogue/mapping.py` |
| Duplicate Finder | ✅ (op `flag_duplicates`/`remove_duplicates`) | Refinement | `cleaning/engine.py` |
| Data Compare | ❌ | — | NOT IMPLEMENTED |
| SKU & Variant Manager | ⚠️ partial | PIM model exists; no UI | `models/commerce.py` |
| Media Matcher | ❌ | — | NOT IMPLEMENTED |
| Bulk Exporter | ⚠️ partial | Catalogue export | `catalogue/exporter.py` |
| Data Quality Report | ✅ | Dashboard / PDF reports | `endpoints/reports.py` |
| Custom Transformation Builder | ⚠️ partial | Refinement ops (fixed allowlist) | `cleaning/engine.py` |

Full per-tool detail (input/processing/output/export/AI/backend/frontend/DB/status/evidence)
is in `docs/RIVU_TOOLS_INVENTORY.md`.

**Bottom line:** ~8 tools are genuinely functional (profiler, quality validator,
cleaner, format/export, catalogue mapper/normalizer/validator, AI enrichment,
duplicates). 3 are partial (SKU manager, bulk exporter, custom transformation),
and 3 are **not implemented** (Data Compare, Media Matcher, and the standalone
"Format Studio" as a distinct tool).

---

## 3. Services & internal engines (summary)

All backend services live under `backend/app/`. Full per-service detail is in
`docs/RIVU_SERVICES_INVENTORY.md`.

### Processing engines
- **Cleaning engine** (`cleaning/engine.py`) — deterministic, allowlisted
  Polars transformations. **23 operations** supported (trim, case, date/datetime
  standardise, numeric/boolean/currency/phone/email/category coercion, fill/drop
  nulls, remove/flag duplicates, flag outliers, replace, regex, clip, drop/rename
  column). LLM never executes. **WORKING & TESTED.**
- **Ingestion parser** (`ingestion/parser.py`) — CSV/XLSX/XLS/JSON/Parquet with
  encoding + delimiter detection + binary-signature checks. **WORKING.**
- **Profiler** (`profiler/engine.py`) — dataset + per-column stats, semantic-type
  inference. **WORKING.**
- **Quality engine** (`profiler/quality.py`) — weighted completeness/validity/
  consistency/uniqueness/integrity scoring + issue findings. **WORKING.**
- **AI planner** (`ai/planner.py`) — Groq JSON plan + strict allowlist/column/
  parameter validation. **WORKING (blocked by key).**
- **Catalogue engine** (`catalogue/mapping.py`, `parser.py`, `validator.py`,
  `exporter.py`, `templates.py`, `ai_enrich.py`) — deterministic fuzzy mapping,
  PDF/Excel/CSV/JSON parsing, validation, XLSX/CSV/JSON export, AI enrichment
  with rule-based fallback. **WORKING.**

### Core services
- **Config** (`core/config.py`) — validated settings + production security gate.
- **Security** (`core/security.py`) — PBKDF2 hashing, JWT issue/decode, user
  resolution, org-role gates, Google ID-token verify. **WORKING.**
- **Database** (`core/database.py`) — async engine/session. **WORKING.**
- **Storage** (`core/storage.py`) — S3/MinIO client. **WORKING (dev).**
- **Email** (`core/email.py`) — SMTP. **BLOCKED — CREDENTIALS** (no SMTP set).
- **Razorpay** (`core/razorpay.py`) — orders + HMAC verify. **PARTIAL (sandbox).**
- **Shopify** (`core/shopify.py`) — GraphQL Admin 2024-10. **PARTIAL (sandbox stub).**
- **Entitlements** (`core/entitlements.py`) — plan-limit enforcement. **WORKING.**
- **Worker** (`workers/runner.py`, `processor.py`) — DB-backed job loop. **WORKING.**

---

## 4. Third-party services & technology stack (summary)

Full table in `docs/RIVU_INTEGRATIONS_INVENTORY.md`.

| Provider | Purpose | Code | Connected? | Creds needed |
|---|---|---|---|---|
| PostgreSQL (asyncpg) | Main DB | `core/database.py` | Yes | `DATABASE_URL` |
| PostgreSQL (separate) | Catalogue DB | `catalogue/auth_db.py` | Optional | `CATALOGUE_DATABASE_URL` + `CATALOGUE_JWT_SECRET` |
| S3 / MinIO | Object storage | `core/storage.py` | Yes (MinIO dev) | `S3_*` |
| Groq | LLM (only provider) | `ai/groq_client.py` | Yes (if key) | `GROQ_API_KEY` |
| Google OAuth | ID-token login | `core/security.py` | Yes (if client id) | `GOOGLE_CLIENT_ID` |
| Razorpay | Payments | `core/razorpay.py` | Sandbox only | `RAZORPAY_*` |
| Shopify Admin GraphQL | Draft product publish | `core/shopify.py` | Sandbox stub | per-connection token |
| SMTP | Verification/reset email | `core/email.py` | No (unset) | `SMTP_*` |
| WooCommerce | Export template only | `catalogue/templates.py` | No (no API) | — |
| OpenAI / Gemini | **Unused** (adapters absent) | — | No | — |
| Next.js / React / three.js / R3F | Frontend + 3D | `app/`, `lib/three/` | Yes | — |
| Vercel / Render | Hosting | `vercel.json`, `render.yaml` | Yes | — |

---

## 5. API inventory (summary)

Full table in `docs/RIVU_API_INVENTORY.md`. **63 versioned endpoints** under
`/api/v1`, plus `GET /health` and `GET /`.

| Module | Base | # endpoints | Notable |
|---|---|---|---|
| Auth | `/api/v1/auth` | 10 | signup/login/refresh/logout/google/reset/verify |
| Billing | `/api/v1/billing` | 6 | plans/current/usage/subscribe/verify-payment/invoices |
| Commerce | `/api/v1/commerce` | 7 | suppliers/products/channels/connect/publish |
| Custom Solutions | `/api/v1/solutions` | 4 | projects/leads (no UI caller) |
| Analytics | `/api/v1/analytics` | 2 | organization/admin (admin lacks role gate) |
| Projects | `/api/v1/projects` | 4 | create/list/detail/delete |
| Datasets | `/api/v1/datasets` | 4 | upload/get/versions/export |
| Insights | `/api/v1/datasets` | 5 | profile/quality/jobs/ai-plan/preview |
| Reports | `/api/v1/reports` | 4 | json/dashboard/pdf/executive-pdf |
| Transformations | `/api/v1/datasets` | 3 | preview/approve/execute |
| Catalogue | `/api/v1/catalogue` | 9 + 5 auth | upload/map/validate/enrich/templates/export |

**Endpoints that are mocked/simulated or broken:**
- `POST /billing/verify-payment` — frontend sends `"sig_valid_simulation"`, which
  the hardened verifier **rejects** (accepted test tokens are `valid_test_signature`
  / `sig_test_`). Live payment verify will 400 unless a real signature is sent.
- `POST /commerce/channels/publish` — **contract mismatch**: frontend posts
  `{channel_id, publish_as_draft}` and reads `synced_count`/`failed_count`, but the
  API expects `{channel_connection_id, product_ids}` and returns
  `total_requested`/`results` → request will 422.
- `POST /commerce/channels/connect` — sandbox token (`shpat_sandbox_test_token`)
  returns a simulated shop fixture.
- `POST /billing/subscribe` — hardcoded `provider_gstin="27AABCU9603R1ZM"`.
- `GET /analytics/admin` — any authenticated user can call it (no role gate); "MRR"
  is actually paid invoices dated this calendar month.

---

## 6. Frontend routes & UX (summary)

Full table in `docs/RIVU_WORKFLOWS.md` / `docs/RIVU_TOOLS_INVENTORY.md`.
26 routes total.

| Status | Routes |
|---|---|
| **FUNCTIONAL** (real API wiring) | `/dashboard`, `/dashboard/suppliers`, `/dashboard/dataset/[id]`, `/login`, `/signup`, `/reset-password`, `/verify-email`, `/services`, `/our-solutions/catalogue-data-entry` |
| **PARTIAL** | `/contact` (mailto only), `/dashboard/billing` (simulated verify), `/dashboard/channels` (sandbox token + contract mismatch), `/our-services` (WhatsApp only) |
| **STATIC-MARKETING** | `/`, `/about`, `/integrations`, `/platform`, `/platform/data-refinery`, `/pricing`, `/resources`, `/security`, `/solutions`, `/solutions/custom`, `/solutions/ecommerce`, `/solutions/supplier-data`, `/tools` |

**3D scenes** are real WebGL (`three` + `@react-three/fiber`) and render on all
marketing pages via `PageHero` / `Scene3DMount` (kinds: hero/stream/mesh/globe),
with a CSS fallback when WebGL is unavailable or reduced-motion is set. Verified
live: 2 canvases on the homepage, WebGL true, no console errors. They are
**decorative** (pointer-events: none), not interactive.

---

## 7. Database & data structure (summary)

Two physically separate PostgreSQL databases. Full model list in
`docs/RIVU_WORKFLOWS.md` §A.

- **Main DB** (`DATABASE_URL`), managed by Alembic (`0001`→`0007_ecommerce_platform`)
  + ORM models in `app/models/`: `User`, `Organization`, `Membership`, `Project`,
  `DataSource`, `DatasetVersion`, `DataProfile`, `ColumnProfile`, `QualityReport`,
  `QualityIssue`, `Job`, `JobLog`, `TransformationPlan`, `TransformationRun`,
  `SubscriptionPlan`, `Subscription`, `UsageEvent`, `Invoice`, `Payment`,
  `Supplier`, `SupplierMappingRecipe`, `Product`, `ProductVariant`,
  `ChannelConnection`, `ChannelProductListing`, `CustomSolutionProject`,
  `ProjectMilestone`, `Lead`.
- **Catalogue DB** (`CATALOGUE_DATABASE_URL`), separate `CatalogueBase` +
  `catalogue_accounts`, `catalogue_workspaces`, `catalogue_sessions`,
  `catalogue_saved_templates`. The catalogue DB guard refuses to point at the main
  DB and requires a separate JWT secret ≥32 chars.

Legacy tables (`api_keys`, `ai_analyses`, `ai_conversations`, `ai_messages`,
`schema_analyses`, `analytics_queries`, `dashboards`, `exports`, `audit_logs`,
`usage_records`) exist **only** in the legacy `f5cbb61b8929` migration, not as
current ORM classes → effectively dead schema.

---

## 8. End-to-end workflows (summary)

Full trace in `docs/RIVU_WORKFLOWS.md §C`.

| Workflow | Status | Notes |
|---|---|---|
| **A. Ingestion** upload→parse→profile→store | ✅ WORKING | Worker or inline (`INLINE_PROCESSING`); **live deploy has no running worker → jobs stuck "queued"** (see Known Issues) |
| **B. Transformation** plan→preview→approve→execute | ✅ WORKING | LLM plans, deterministic code executes, human approves, new immutable version |
| **C. Catalogue** upload→map→validate→enrich→export | ✅ WORKING | Separate DB/auth; enrich is advisory (not persisted) |
| **D. AI** request→Groq→validate→apply | ✅ WORKING | Strict allowlist validation; blocked by `GROQ_API_KEY`; no free-form chat |
| **E. E-commerce** connect→publish | ⚠️ PARTIAL | Shopify GraphQL real but sandbox stub; WooCommerce not implemented |
| **F. Billing** subscribe→order→verify→subscription | ⚠️ PARTIAL | HMAC verify hardened; UI sends simulated signature; no webhook endpoint |

---

## 9. Feature & capability status matrix

| Capability | Status | Evidence |
|---|---|---|
| Multi-tenant auth (JWT, roles) | WORKING & TESTED | `test_workspace_security.py`, `test_db_integration.py` (real PG) |
| Google OAuth login | BLOCKED — CREDENTIALS | `core/security.py:139`; needs `GOOGLE_CLIENT_ID` |
| Email verification / reset | BLOCKED — CREDENTIALS | `core/email.py`; SMTP unset |
| Project CRUD | WORKING | `endpoints/projects.py` |
| Dataset upload (CSV/XLSX/XLS/JSON/Parquet) | WORKING | `ingestion/parser.py`; live upload 202 verified |
| Background processing (profile/quality) | BLOCKED — ENVIRONMENT (live) | `workers/runner.py` exists; **no worker running on Render** → jobs stuck queued |
| Column profiling | WORKING | `profiler/engine.py` |
| Quality scoring | WORKING | `profiler/quality.py` |
| AI transformation plan | BLOCKED — CREDENTIALS | `ai/planner.py`; needs `GROQ_API_KEY` |
| Deterministic transformation (23 ops) | WORKING & TESTED | `cleaning/engine.py`; `test_cleaning_engine.py` |
| Versioned export (CSV/XLSX/JSON/Parquet) | WORKING | `endpoints/datasets.py` export |
| JSON / PDF / executive reports | WORKING (AI summary has fallback) | `endpoints/reports.py` |
| Catalogue portal (upload/map/validate/export) | WORKING | `catalogue/router.py` (separate DB) |
| Catalogue AI enrichment | WORKING (advisory; rule fallback) | `catalogue/ai_enrich.py` |
| PIM product management | WORKING (create unused by UI) | `endpoints/commerce.py` |
| Supplier management | WORKING | `app/dashboard/suppliers` |
| Shopify connect/publish | PARTIAL — BLOCKED | `core/shopify.py` (sandbox); custom-app token, no OAuth/webhooks |
| WooCommerce integration | NOT IMPLEMENTED (templates only) | `catalogue/templates.py` |
| Razorpay payments | PARTIAL — BLOCKED | `core/razorpay.py`; needs real keys |
| Razorpay webhook | NOT IMPLEMENTED | verify helper exists, no endpoint |
| GST invoicing | PARTIAL — BLOCKED | `billing.py`; hardcoded provider GSTIN |
| Entitlements (SKU/AI) | WORKING (2 of N limits) | `core/entitlements.py` |
| Analytics | PARTIAL | admin endpoint lacks role gate |
| Sales CRM / Custom Solutions | WORKING but UNUSED (no UI) | `endpoints/custom_solutions.py` |
| 3D marketing scenes | WORKING (decorative) | `lib/three/*`; verified live |
| Standalone Tools Centre | UI ONLY (catalog) | `app/(marketing)/tools/page.tsx` |
| Data Compare / Media Matcher | NOT IMPLEMENTED | no backend |
| IndiaMART integration | NOT IMPLEMENTED (file workflow) | DB enum + template only |

---

## 10. Product capability summary (direct answers)

1. **What is Rivu AI today?** A two-surface data product: (a) an authenticated
   **data refinery** (ingest → profile → quality → AI-assisted plan → human-approved
   deterministic transform → versioned export) with PIM/commerce/billing/CRM
   modules, and (b) a separate **Catalogue Data Entry portal** (supplier catalogue →
   mapping → validation → AI enrichment → export). Plus a large static marketing site.
2. **Main products?** Data Refinery (dashboard + Data Studio) and Catalogue Data Entry.
3. **How many user-facing tools actually exist?** ~8 genuinely functional
   (profiler, quality validator, cleaner, export, catalogue mapper/normalizer/
   validator, AI enrichment, duplicates). 3 partial, 3 not implemented. The public
   `/tools` page lists 14 but they are not functional there.
4. **All tools & what each does?** See §2 and `RIVU_TOOLS_INVENTORY.md`.
5. **How many backend services?** ~20 modules/engines (see §3); ~12 core services.
6. **Third-party integrations?** PostgreSQL, S3/MinIO, Groq, Google OAuth, Razorpay,
   Shopify, SMTP (see §4). WooCommerce = template only; OpenAI/Gemini unused.
7. **AI capabilities implemented?** Groq-only: (a) transformation **planning**
   (validated JSON plan), (b) catalogue **enrichment** (advisory descriptions/SEO/
   tags), (c) report **executive summaries**. No free-form chat.
8. **File formats genuinely processed?** CSV, XLSX, XLS, JSON, Parquet (ingestion);
   CSV/XLSX/XLS/JSON/text-PDF (catalogue). Scanned PDFs correctly rejected.
9. **Data transformations?** 23 deterministic ops (see §3).
10. **E-commerce capabilities?** Shopify GraphQL draft-product publish (sandbox),
    supplier/PIM records, channel connections. No WooCommerce API, no OAuth/webhooks.
11. **Billing capabilities?** Plans, Razorpay order creation, HMAC verify (hardened),
    GST invoice structure, usage metering. UI verify is simulated; no webhook.
12. **Strongest capabilities?** Deterministic transformation engine + profiling +
    quality + versioning; catalogue mapping/validation/export; tenant isolation;
    the AI-plan-with-allowlist safety model.
13. **Implemented but incomplete?** Billing verify (UI), channel publish (contract),
    entitlements (only 2 limits), analytics (admin gate), catalogue enrich (not
    persisted), worker (not deployed).
14. **Frontend-only UI?** The entire `/tools` catalog; marketing pages; pricing
    toggle; contact/WhatsApp forms (no backend).
15. **Major absent capabilities?** Real-time collaboration, WooCommerce API, Shopify
    OAuth/webhooks, free-form AI chat, Data Compare, Media Matcher, audit-log UI,
    team invitations (model exists, no flow), webhook endpoints.
16. **Unused/redundant services?** `app/services` duplicates the dashboard; legacy
    tables (api_keys, ai_analyses, ai_conversations, etc.); `openai`/`tiktoken`
    deps; analytics/CRM endpoints with no UI.
17. **Biggest technical limitations?** No running background worker on the live
    deploy (jobs stuck); single AI provider; email/SMTP unset; no Shopify OAuth;
    some frontend↔backend contract mismatches; in-memory catalogue templates
    (partially persisted).
18. **Could be offered to a real customer now?** The **data refinery** (ingest →
    profile → quality → deterministic transform → export) and the **catalogue
    portal** (upload → map → validate → export) are the most saleable, *once the
    worker runs and a DB/storage is provisioned*. AI plan/enrich need a Groq key.
19. **Needs credentials/external setup?** Groq key, SMTP, Razorpay keys, Google
    client ID, S3/MinIO, Shopify access token, and a running worker + managed Postgres.
20. **Most accurate description?** *"Rivu is a real, partially-deployed data
    refinery and catalogue ETL product with a strong deterministic transformation
    core, tenant isolation, and an AI-assisted (Groq) planning layer, wrapped in a
    polished marketing site. It is not yet production-complete: the live
    deployment's background worker is not running, several integrations are
    sandbox/stubbed, and some frontend↔backend contracts are mismatched."*

---

## Known issues discovered during this audit (evidence-backed)

1. **Live background worker not running** — upload returns 202 and creates a
   `queued` `profile` job, but the dataset stays `"uploaded"` indefinitely and
   `/profile` returns `202 "still processing"`. Verified live: job
   `e380df07-…` remained `status="queued"` for 10+ minutes. `render.yaml` defines
   `rivu-worker`, but the live API reports `environment: development` (render.yaml
   says `production`), indicating the deployment is not the one in `render.yaml`
   and the worker service is absent. (Mitigation shipped: `INLINE_PROCESSING`
   default-true processes jobs in the API process — see repo.)
2. **Billing verify contract** — `app/dashboard/billing/page.tsx` sends
   `"sig_valid_simulation"`; `core/razorpay.py` accepts only `valid_test_signature`
   / `sig_test_*` in test envs → live verify 400s.
3. **Channel publish contract** — frontend `{channel_id, publish_as_draft}` vs API
   `{channel_connection_id, product_ids}`; response field mismatch → 422.
4. **`/tools` is non-functional** — cards are static; no tool runs there.
5. **Analytics admin endpoint** has no role gate; "MRR" is miscomputed.
6. **Catalogue templates** are dual-written (memory + DB) but delete relies on DB
   rowcount → memory-only templates report 404.
7. **Legacy schema** tables exist only in an old migration, not in ORM.

---

*End of main inventory. See companion files for exhaustive per-item tables.*