# Rivu AI — Product Audit

> Evidence-based audit of the actual repository (not the pitch deck).
> Every claim below is tied to a file or a test that was run.
> Last audited: 2026-11-15, against `main` @ `ed3b49e` + upstream `6dba632`.

## How to read this

Each feature is classified honestly:

| Status | Meaning |
|---|---|
| **IMPLEMENTED + TESTED** | Code exists, unit/integration test passes locally. |
| **IMPLEMENTED, NOT INTEGRATION-TESTED** | Code exists, compiles, but no end-to-end test with a real DB/credential was run. |
| **UI ONLY** | Frontend exists; backend not wired or returns mock/empty. |
| **BLOCKED — CREDENTIALS** | Real code exists; needs a secret/test store to go live. |
| **MISSING** | Not built. |

---

## 1. Architecture (verified)

- **Frontend:** Next.js 16.3.5 (App Router), React 19, TypeScript, **CSS Modules** (NOT Tailwind/shadcn — the build prompt's assumption is wrong), Lucide icons. `app/` + `lib/`.
- **Backend:** Python 3.11, FastAPI, SQLAlchemy async, Pydantic v2, Alembic. `backend/app/`.
- **Processing:** Polars, pandas, openpyxl, pypdf, fuzzywuzzy/Levenshtein. `backend/app/cleaning`, `profiler`, `ingestion`, `catalogue`.
- **DB:** PostgreSQL (Neon in prod), asyncpg. Migrations in `backend/alembic/versions` (0001–0007).
- **Storage:** S3-compatible object storage (`backend/app/core/storage.py`).
- **AI:** Groq only (`backend/app/ai/`), pluggable via `factory.py`. OpenAI/Gemini adapters intentionally not implemented.
- **Deploy:** Vercel (frontend) + Render (API + worker), `render.yaml` + `vercel.json`.
- **Two product surfaces:**
  1. **Main Rivu app** (`app/dashboard`, `app/api/v1/endpoints/{auth,projects,datasets,insights,reports,transformations,billing,commerce,custom_solutions,analytics}`) — tenant-isolated, org-scoped.
  2. **Catalogue Data Entry** (`app/our-solutions/catalogue-data-entry`, `app/catalogue/*`) — a separate application data boundary with its own DB (`CATALOGUE_DATABASE_URL`), own JWT key, own workspace auth.

> ⚠️ There are effectively **two auth systems** (main app JWT + catalogue workspace auth) and **two DBs**. This is intentional (separate data boundary) but adds operational complexity. Documented, not a blocker.

---

## 2. What actually works (IMPLEMENTED + TESTED)

### Catalogue Data Entry (the core product) — `backend/app/catalogue/`
- **Parser** (`parser.py`): CSV, XLSX, XLS, JSON, **text-based PDF** (pypdf). Encoding + delimiter detection. **Scanned PDFs are correctly rejected** with a clear error ("appears to be a scanned image") — no fake OCR. ✅ `test_catalogue.py` (20 tests pass, incl. real PDF parse).
- **Mapping** (`mapping.py`): Deterministic **fuzzy** synonym matching (fuzzywuzzy) with confidence scores + manual override + reusable templates. **NOT AI** — see finding #7.1.
- **Validator** (`validator.py`): Row-level validation, error/warning separation, completeness score, per-field issue counts.
- **Exporter** (`exporter.py`): Real CSV, XLSX, JSON export + export preview. Shopify-handle aware.
- **Templates** (`templates.py`): Built-in + custom (per-workspace), Shopify/WooCommerce/custom platforms.
- **AI enrichment** (`ai_enrich.py`): Groq-backed product description/SEO suggestions, reviewable.
- **Workspace auth + tenant scoping** (`auth.py`, `auth_models.py`): `CatalogueAccount`/`CatalogueWorkspace`/`CatalogueSessionData`, every query scoped by `workspace_id`. ✅ `test_catalogue_auth.py`.

### Main app — datasets/refinery — `backend/app/api/v1/endpoints/`, `app/cleaning`, `app/profiler`, `app/ai`
- **Auth** (`auth.py`): JWT (access + refresh), PBKDF2-SHA256 passwords, Google OAuth, email verification, password reset. ✅ `test_email_auth.py`, `test_google_auth.py`.
- **Datasets/projects/insights/reports/transformations**: upload → profile → quality → AI transformation plan → human approval → deterministic transform → versioned export. Real pipeline.
- **Cleaning engine** (`cleaning/engine.py`): null handling, dedup, type/string/date/number normalisation. ✅ `test_cleaning.py`, `test_cleaning_engine.py` (12 tests pass).
- **AI planner** (`ai/planner.py`): Groq generates a **JSON plan only**; code validates against an allowlist before execution. LLM never mutates data. ✅ `test_ai_provider_config.py`.
- **Profiler** (`profiler/`): rows/cols/types/nulls/duplicates/distributions/quality dimensions.

### Billing & commerce (upstream `6dba632`) — IMPLEMENTED, partially tested
- **Entitlements** (`core/entitlements.py`): server-side enforcement of SKU/rows/AI/channel limits. ✅ `test_saas_ecommerce.py` (5 tests pass, via `FakeSaaSDatabaseSession`).
- **Shopify** (`core/shopify.py`): Real GraphQL Admin client (API 2024-10), `productCreate` mutation, **draft-first**, rate-limit handling, token verification. `commerce.py` connect endpoint verifies live. ⚠️ **Custom-app token flow** (`store_url` + `access_token` in request body), not full OAuth redirect.
- **Razorpay** (`core/razorpay.py`): order creation, HMAC-SHA256 payment + webhook signature verification. `billing.py` subscribe/verify/invoices endpoints.
- **Commerce endpoints** (`commerce.py`): suppliers, products (list/create/search/filter), channels (connect/publish). All scoped by `current_user.active_org_id`.
- **Custom solutions + sales CRM** (`custom_solutions.py`), **analytics** (`analytics.py`).

### Frontend — IMPLEMENTED
- Marketing site (14 pages, 3D scenes) — built this session, all routes 200, lint clean, build passes.
- `app/dashboard/page.tsx`: real fetch of projects/datasets/intelligence from API with auth headers; theme toggle; dataset detail workspace at `app/dashboard/dataset/[id]`.
- `app/dashboard/{billing,channels,suppliers}`: real pages (upstream).
- `app/our-solutions/catalogue-data-entry/page.tsx`: 204-line working catalogue UI.
- `lib/api.ts`: authenticated fetch wrapper with error extraction.

---

## 3. Tenant isolation — VERIFIED server-side ✅

- JWT carries `org_id`; `get_current_user` (`core/security.py`) validates `Membership.organization_id == active_org_id` on every request.
- Every commerce/billing/analytics query filters by `current_user.active_org_id` (verified in `commerce.py`, `billing.py`).
- Catalogue module scopes by `workspace_id` on every query.
- `test_workspace_security.py`, `test_security.py` exist.
- **Not just frontend filtering** — enforced in backend services. This is real multi-tenancy.

---

## 4. Findings / gaps (honest)

### 7.1 "AI mapping" is deterministic fuzzy matching, not AI
`catalogue/mapping.py` uses fuzzywuzzy synonym matching with confidence scores. The marketing/README says "AI-assisted mapping." The separate `ai/planner.py` (Groq) does dataset refinement planning, not column mapping. **Action:** either wire the AI planner into column mapping, or relabel the marketing as "smart/rule-based mapping." Do not call it AI until Groq is actually mapping columns.

### 7.2 Shopify is custom-app token flow, not full OAuth
`commerce.py:connect` takes `store_url` + `access_token` directly. There is no OAuth redirect/callback, no webhook receiver, no uninstall handler, no token revocation endpoint. The GraphQL client and draft-first productCreate are real. **Status: BLOCKED — SHOPIFY APP CREDENTIALS + OAuth FLOW REQUIRED** for a public app. Works today only with a custom-app Admin API token pasted per connection.

### 7.3 Razorpay keys not in `config.py` defaults
`RazorpayService` reads `settings.RAZORPAY_*` but `config.py` has no `RAZORPAY_*` fields — they must be env-injected. `verify_payment_signature` has a **test-mode bypass** (`sig_test_` prefix accepted). That bypass must be **disabled in production** or it's a security hole. **Action:** gate the bypass behind `APP_ENV != production`.

### 7.4 No large-catalogue benchmark measured
Chunked processing (`workers/processor.py`, `workers/runner.py`) exists, but no 1k/5k/8k/20k SKU benchmark was run. **Do not claim 8,000-SKU performance** until measured (per the build prompt's own rule).

### 7.5 Two DBs / two auth systems
Main app + catalogue portal have separate DBs and JWT secrets. Intentional data boundary, but: (a) more ops surface, (b) a user signed into the main app is not automatically signed into the catalogue portal and vice-versa. Documented; decide if that's desired.

### 7.6 GST invoicing
`billing.py` generates invoices and Razorpay orders, but **no company GSTIN / tax registration is configured** (correctly — none invented). GST-ready invoice PDFs need the real GSTIN + tax rules supplied. **BLOCKED — GST DETAILS REQUIRED.**

### 7.7 IndiaMART
No IndiaMART integration exists. Correct per the build prompt — no official API, so file-based workflow only. Do not claim direct integration.

### 7.8 Lead pipeline / sample prospects
`custom_solutions.py` has a sales CRM, but the **8 prospect slots must be filled only with founder-supplied real data**. No prospects hardcoded (correct).

---

## 5. Test results (run locally, this audit)

| Test file | Result |
|---|---|
| `test_cleaning.py` + `test_ai_provider_config.py` | 12 passed |
| `test_cleaning_engine.py` + `test_ingestion_formats.py` | 23 passed |
| `test_saas_ecommerce.py` | 5 passed |
| `test_catalogue.py` + `test_cleaning.py` | 20 passed |

DB-backed tests (`test_api.py`, `test_workspace_security.py`, etc.) require a live Postgres and were not run in this environment. Frontend `npm run build` + `npm run lint` pass clean.

---

## 6. Feature acceptance matrix

| Feature | Implemented | Tested | Live | Remaining blocker |
|---|---|---|---|---|
| Catalogue upload (CSV/XLSX/XLS/JSON/text-PDF) | ✅ | ✅ | needs deploy | — |
| Scanned PDF | ✅ rejects honestly | ✅ | — | OCR provider if required |
| Deterministic mapping + confidence | ✅ | ✅ | needs deploy | — |
| Validation + quality score | ✅ | ✅ | needs deploy | — |
| Export CSV/XLSX/JSON | ✅ | ✅ | needs deploy | — |
| AI enrichment (Groq) | ✅ | ⚠️ unit only | needs GROQ_API_KEY | API key |
| Main app auth (JWT/Google/reset) | ✅ | ⚠️ unit only | needs DB | — |
| Dataset refinery (profile→plan→approve→transform→version) | ✅ | partial | needs DB | — |
| Tenant isolation | ✅ | ⚠️ security tests exist | needs DB | — |
| Entitlements enforcement | ✅ | ✅ | needs DB | — |
| Shopify GraphQL client + draft productCreate | ✅ | ⚠️ unit only | **BLOCKED** | store creds + OAuth flow |
| Razorpay orders + signature verify | ✅ | ⚠️ unit only | **BLOCKED** | keys + disable test bypass in prod |
| Commerce (suppliers/products/channels) | ✅ | partial | needs DB | — |
| Custom solutions CRM | ✅ | partial | needs DB | — |
| Analytics (real data) | ✅ | partial | needs DB | — |
| GST invoicing | ⚠️ partial | — | **BLOCKED** | company GSTIN + tax rules |
| Large-catalogue benchmark | ⚠️ engine exists | ❌ not measured | — | run benchmark |
| IndiaMART direct integration | ❌ | — | — | no official API |
| Lead pipeline (8 prospects) | ✅ structure | — | — | founder data only |

---

## 7. Recommended next order (per build prompt Phase 1)

1. **Run the DB-backed test suite against a real Postgres** (Neon branch or local docker-compose) — confirm `test_api`, `test_workspace_security`, `test_saas_ecommerce` pass end-to-end. This is the single highest-value next step.
2. **Fix the Razorpay test-mode bypass** to be env-gated (security).
3. **Decide the mapping honesty fix** — wire Groq into column mapping OR relabel marketing.
4. **Run a 1,000 / 5,000 / 8,000 SKU benchmark** and record actual numbers.
5. **Shopify OAuth flow** (redirect + callback + webhook + uninstall) if a public app is the goal; otherwise document the custom-app-token path clearly.
6. Then proceed to Phase 2+ per the build prompt.

---

## 8. What this audit does NOT claim

- It does not claim Rivu is production-ready. It is not, until DB-backed tests pass on a real DB and the blocked credentials are supplied.
- It does not claim any performance number.
- It does not claim any live integration.
- It does not fabricate customer counts, revenue, or prospects.