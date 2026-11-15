# Rivu AI — Database, Data Structure & End-to-End Workflows

> Companion to `RIVU_COMPLETE_CAPABILITY_INVENTORY.md` §7–§8.

## A. Database architecture

### A.1 Main DB (`DATABASE_URL`)
- **Engine/session:** `core/database.py` (`Base` at `database.py:24`).
- **Migrations:** Alembic `0001` → `0007_ecommerce_platform` (latest revision
  renamed to `0007_ecommerce_platform`, 23 chars; idempotent `DO $$` widening of
  `alembic_version.version_num` to VARCHAR(255)).
- **Current ORM models** (`app/models/`):

| Domain | Models |
|---|---|
| Identity | `User` (`user.py:12`), `Organization` (`organization.py:12`, plan default "free"), `Membership` |
| Projects | `Project` |
| Data | `DataSource`, `DatasetVersion`, `DataProfile`, `ColumnProfile`, `QualityReport`, `QualityIssue` |
| Jobs | `Job`, `JobLog` |
| Transformations | `TransformationPlan`, `TransformationRun` |
| Billing | `SubscriptionPlan`, `Subscription`, `UsageEvent`, `Invoice`, `Payment` |
| Commerce | `Supplier`, `SupplierMappingRecipe`, `Product`, `ProductVariant`, `ChannelConnection`, `ChannelProductListing` |
| Solutions/CRM | `CustomSolutionProject`, `ProjectMilestone`, `Lead` |

### A.2 Catalogue DB (`CATALOGUE_DATABASE_URL`, separate)
- **Base:** `CatalogueBase` (`catalogue/auth_models.py:11`).
- **Guard:** `catalogue/auth_db.py:20-33` refuses the main DB and requires a
  separate JWT secret ≥32 chars.
- **Models:** `catalogue_accounts`, `catalogue_workspaces`, `catalogue_sessions`,
  `catalogue_saved_templates`.
- **Auth:** `catalogue/auth.py:98-124`.

### A.3 Legacy / dead schema
Tables present **only** in the legacy `f5cbb61b8929` migration (no current ORM
class): `api_keys`, `ai_analyses`, `ai_conversations`, `ai_messages`,
`schema_analyses`, `analytics_queries`, `dashboards`, `exports`, `audit_logs`,
`usage_records` → effectively dead.

---

## B. Tenant isolation (server-side)
- JWT carries `org_id`; `get_current_user` validates `Membership`; every query
  filters `current_user.active_org_id` (or `workspace_id` for catalogue).
- Catalogue realm is physically separate (own DB + secret).

---

## C. End-to-end workflows

### C.1 Ingestion (upload → parse → profile → store) — ✅ WORKING
1. `POST /api/v1/datasets/upload` → validate + store raw bytes to S3 → create
   `DataSource` + `DatasetVersion(status="uploaded")` → enqueue `profile` job
   (`datasets.py:162-181`).
2. Worker (`workers/runner.py`) claims queued job → `processor` fetches raw bytes
   → `parser` parses → `profiler` builds `DataProfile`/`ColumnProfile` →
   `quality` builds `QualityReport` → version `status="ready"`.
3. **Mitigation:** `INLINE_PROCESSING=True` (default) runs the job inline in the
   API process when a `BackgroundTasks` is provided (`_run_inline_job`).
- **Live issue:** Render worker not running → jobs stuck "queued" (see Known
  Issues).

### C.2 Transformation (plan → preview → approve → execute) — ✅ WORKING
1. `POST /datasets/{id}/ai-plan` → `ai/planner.py` (Groq) → validated
   `TransformationPlan` (allowlist + column + param checks).
2. `POST /datasets/{id}/transform/preview` → dry-run new frame.
3. `POST /datasets/{id}/transform/approve` → mark approved.
4. `POST /datasets/{id}/transform/execute` → `cleaning/engine.py` applies ops →
   new immutable `DatasetVersion`.
- Human approves; AI never executes.

### C.3 Catalogue (upload → map → validate → enrich → export) — ✅ WORKING
1. `POST /catalogue/upload` → parse file.
2. `POST /catalogue/map` → `catalogue/mapping.py` (fuzzywuzzy, confidence).
3. `POST /catalogue/validate` → `catalogue/validator.py`.
4. `POST /catalogue/enrich` → `catalogue/ai_enrich.py` (Groq, advisory + fallback).
5. `POST /catalogue/export` → `catalogue/exporter.py` (XLSX/CSV/JSON).
- Separate DB + auth; enrich is advisory (not persisted as canonical).

### C.4 AI (request → Groq → validate → apply) — ✅ WORKING
- Only transformation planning + catalogue enrichment + report summaries.
- Strict allowlist validation; blocked by `GROQ_API_KEY`; no free-form chat.

### C.5 E-commerce (connect → publish) — ⚠️ PARTIAL
- Shopify GraphQL draft-first `productCreate`; custom-app token flow; sandbox stub;
  no OAuth/webhooks/uninstall. WooCommerce not implemented.

### C.6 Billing (subscribe → order → verify → subscription) — ⚠️ PARTIAL
- `POST /billing/subscribe` → Razorpay order; `POST /billing/verify-payment` →
  HMAC verify (hardened, env-gated fail-closed); no webhook endpoint. UI verify
  sends simulated signature → 400.

---

## D. Frontend route map (26 routes)

| Status | Routes |
|---|---|
| **FUNCTIONAL** | `/dashboard`, `/dashboard/suppliers`, `/dashboard/dataset/[id]`, `/login`, `/signup`, `/reset-password`, `/verify-email`, `/services`, `/our-solutions/catalogue-data-entry` |
| **PARTIAL** | `/contact` (mailto), `/dashboard/billing` (simulated verify), `/dashboard/channels` (sandbox + mismatch), `/our-services` (WhatsApp) |
| **STATIC-MARKETING** | `/`, `/about`, `/integrations`, `/platform`, `/platform/data-refinery`, `/pricing`, `/resources`, `/security`, `/solutions`, `/solutions/custom`, `/solutions/ecommerce`, `/solutions/supplier-data`, `/tools` |

**3D scenes:** `lib/three/Scene3D.tsx` kinds `hero|stream|mesh|globe`; mounted via
`PageHero`/`Scene3DMount` (`app/(marketing)/ui.tsx`); `use3D.ts` → `pending|on|
reduced|off` with CSS fallback. Decorative (pointer-events: none).

---

## E. Known issues (evidence-backed)

1. **Live worker not running** — upload 202 + `queued` job; dataset stuck
   `"uploaded"`; `/profile` 202 "still processing" indefinitely. Verified: job
   `e380df07-…` stayed `queued` 10+ min. `render.yaml` defines `rivu-worker` but
   live API reports `environment: development` (render.yaml says `production`).
   Mitigation: `INLINE_PROCESSING` default-true.
2. **Billing verify contract** — UI `"sig_valid_simulation"` rejected by verifier.
3. **Channel publish contract** — request/response mismatch → 422.
4. **`/tools` non-functional** — static cards.
5. **Analytics admin** — no role gate; MRR miscomputed.
6. **Catalogue templates** — memory/DB dual-write; delete 404 on memory-only.
7. **Legacy schema** — dead tables only in old migration.

*End of workflows document.*