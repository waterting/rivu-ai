# Function Inventory

Status: **Baseline inventory of the codebase as built**
Date: 2026-11-14
Scope: Priority 3 of the production-readiness sprint.

This is a factual inventory of what actually exists in the repository. Status
labels are conservative:

- **Working** — implemented and exercised by the automated test suite.
- **Working (needs creds)** — real client code exists, but the external service
  requires credentials not provisioned in this environment.
- **Deterministic core** — pure Python/Polars, no external dependency.
- **Partial / honest gap** — implemented but with a documented limitation.

Nothing here is claimed to be "live" without the credentials/infrastructure to
back it.

---

## 1. Backend — API surface (`/api/v1`)

Router registration: `backend/app/api/v1/router.py`.

### Authentication — `/auth` (`auth.py`)
| Endpoint | Purpose | Status |
|----------|---------|--------|
| `POST /signup` | Register account, send verification email | Working |
| `POST /verify-email` | Confirm email token | Working |
| `POST /resend-verification` | Re-issue verification email | Working |
| `POST /password-reset/request` | Request reset token | Working |
| `POST /password-reset/complete` | Complete reset | Working |
| `POST /login` | Password login → access + refresh tokens | Working |
| `POST /google` | Google OAuth login (ID-token verified) | Working (needs creds) |
| `POST /refresh` | Rotate refresh token | Working |
| `POST /logout` | Revoke refresh token | Working |
| `GET /me` | Current user profile | Working |

### Projects — `/projects` (`projects.py`)
`POST /` create · `GET /` list · `GET /{id}` detail · `DELETE /{id}` — Working
(tenant-scoped by active org).

### Datasets — `/datasets` (`datasets.py`)
`POST /projects/{id}/upload` (202, background job) · `GET /{id}` ·
`GET /{id}/versions` · `GET /{id}/export/{version}` — Working.

### Dataset Intelligence — `/datasets` (`insights.py`)
`GET /{id}/profile` · `GET /{id}/quality` · `GET /{id}/jobs` ·
`POST /{id}/ai-plan` (Groq refinement planner) · `GET /{id}/preview` — Working.

### Transformations — `/datasets` (`transformations.py`)
`POST /{id}/transform/preview` · `POST /{id}/transform/approve` ·
`POST /{id}/transform/execute` (201) — Working (deterministic engine).

### Reports — `/reports` (`reports.py`)
`GET /{id}/json` · `GET /{id}/dashboard` · `GET /{id}/pdf` ·
`GET /{id}/executive-pdf` — Working.

### Billing & Subscriptions — `/billing` (`billing.py`)
`GET /plans` · `GET /current` · `GET /usage` · `POST /subscribe` (Razorpay
order) · `POST /verify-payment` (HMAC-verified, fail-closed) · `GET /invoices`
— Working. Live card capture requires real `RAZORPAY_*` credentials; signature
verification and subscription activation are real and tested.

### Commerce PIM & Channels — `/commerce` (`commerce.py`)
`GET/POST /suppliers` · `GET/POST /products` · `GET /channels` ·
`POST /channels/connect` · `POST /channels/publish` — Working.
Shopify connect/publish uses a **custom-app token flow** (store URL + access
token), not OAuth. See §6.

### Custom Solutions & CRM — `/solutions` (`custom_solutions.py`)
`GET/POST /custom-solutions/projects` · `GET/POST /crm/leads` — Working.

### Operational Analytics — `/analytics` (`analytics.py`)
`GET /organization` · `GET /admin` — Working.

---

## 2. Catalogue Data Entry portal (`/api/v1/catalogue`)

Separate product surface. Own database (`CATALOGUE_DATABASE_URL`), own JWT
secret, `workspace_id` scoping, own auth router (`auth_router.py`).

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `POST /catalogue/auth/signup` | Catalogue user signup | Working |
| `POST /catalogue/auth/login` | Catalogue login | Working |
| `POST /catalogue/auth/refresh` | Refresh | Working |
| `GET /catalogue/auth/me` | Profile | Working |
| `POST /catalogue/auth/logout` | Logout | Working |
| `POST /catalogue/upload` | Parse CSV/XLSX/JSON/PDF → columns + rows | Working |
| `POST /catalogue/map` | Apply field mappings → products | Working (deterministic) |
| `POST /catalogue/validate` | Validate mapped products | Working |
| `POST /catalogue/enrich` | Optional AI enrichment | Working (needs Groq) |
| `GET /catalogue/templates` | List templates | Working |
| `POST /catalogue/templates` | Create template | Working |
| `DELETE /catalogue/templates/{id}` | Delete template | Working |
| `POST /catalogue/export/preview` | Preview export | Working |
| `POST /catalogue/export` | Export CSV/XLSX/JSON | Working |

Catalogue modules (`backend/app/catalogue/`): `parser.py`, `mapping.py`,
`validator.py`, `templates.py`, `exporter.py`, `ai_enrich.py`, `auth.py`,
`auth_db.py`, `auth_models.py`, `auth_router.py`, `models.py`, `router.py`.

---

## 3. Backend core services

| Module | Responsibility | Status |
|--------|----------------|--------|
| `app/cleaning/engine.py` | Deterministic transformation engine (Polars) | Deterministic core |
| `app/ingestion/parser.py` | CSV/XLSX/JSON/PDF parsing, encoding/delimiter detection | Working |
| `app/profiler/engine.py` | Schema/type/null/distribution profiling | Working |
| `app/profiler/quality.py` | Quality metrics | Working |
| `app/ai/planner.py` | Groq dataset refinement planning | Working (needs Groq) |
| `app/ai/groq_client.py` | Groq client wrapper | Working (needs Groq) |
| `app/ai/base.py`, `app/ai/factory.py` | AI provider abstraction (Groq only) | Working |
| `app/core/razorpay.py` | Razorpay order + signature verification | Working (fail-closed) |
| `app/core/security.py` | JWT, membership/role gates, Google ID verify | Working |
| `app/core/entitlements.py` | Server-side plan-limit enforcement | Working |
| `app/core/config.py` | Settings + production security validation | Working |
| `app/workers/*` | Background job runner/processor | Working |

### Cleaning engine operations (deterministic)
`trim_whitespace`, `normalize_whitespace`, `lowercase`, `uppercase`,
`title_case`, `standardize_date`, `standardize_datetime`, `coerce_numeric`,
`coerce_boolean`, `normalize_currency`, `normalize_phone`, `normalize_email`,
`normalize_category`, `fill_null`, `drop_nulls`, `remove_duplicates`,
`flag_duplicates`, `flag_outliers`, `replace_value`, `regex_replace`,
`clip_numeric`, `drop_column`, `rename_column`.

---

## 4. Frontend (Next.js App Router)

### Marketing (`app/(marketing)/`)
`/` (home) · `/about` · `/contact` · `/integrations` · `/platform` ·
`/platform/data-refinery` · `/pricing` · `/resources` · `/security` ·
`/solutions` · `/solutions/custom` · `/solutions/ecommerce` ·
`/solutions/supplier-data` · `/tools`.

### Application (`app/dashboard/`)
`/dashboard` · `/dashboard/billing` · `/dashboard/channels` ·
`/dashboard/dataset/[id]` · `/dashboard/suppliers`.

### Other
`/services` · `/our-services` · `/our-solutions/catalogue-data-entry` ·
`/login` · `/signup` · `/reset-password` · `/verify-email`.

All pages build and lint clean (`npm run lint`, `npm run build` verified).

---

## 5. Data models (`backend/app/models/`)

`user.py` (User) · `organization.py` (Organization, Membership) ·
`project.py` · `dataset.py` · `profile.py` · `quality.py` ·
`transformation.py` · `billing.py` (SubscriptionPlan, Subscription, Invoice,
Payment, UsageEvent) · `commerce.py` (Supplier, Product, ChannelConnection,
ChannelProductListing) · `custom_solutions.py`.

Migrations: `backend/alembic/versions/` — chain `f5cbb61b8929` → `0001` → … →
`0007_ecommerce_platform` applies cleanly against PostgreSQL 17.2 (see
`DB_INTEGRATION_REPORT.md`).

---

## 6. Integrations — honest status

| Integration | Mechanism | Status |
|-------------|-----------|--------|
| Razorpay (payments) | Orders + HMAC signature verify | Working; live capture needs real keys |
| Google OAuth | ID-token verification | Working; needs client ID/secret |
| Email (verification/reset) | Provider send | Working; needs SMTP/provider creds |
| Groq AI (refinement/enrichment) | Chat API | Working; needs `GROQ_API_KEY` |
| S3 / MinIO (object storage) | Async client | Working; needs endpoint + creds |
| Shopify | Custom-app **access token** (store URL + token) | Working code; **no OAuth, no webhooks, no uninstall** — see gap analysis |

---

## 7. Known honest gaps (cross-referenced)

- Column "mapping" is deterministic fuzzy synonym matching, **not AI** —
  relabeled in marketing to "Smart, rule-based mapping".
- Shopify integration is custom-app token flow; OAuth/webhooks/uninstall are
  **not implemented**.
- Catalogue portal real-DB migration run against a live catalogue database is a
  follow-up (mock suite covers it; main DB verified end-to-end).
- End-to-end pipeline throughput (upload/parse/DB/LLM) is **not** benchmarked
  (no hosted infra); only the deterministic cleaning core is measured
  (`SCALE_BENCHMARK_REPORT.md`).