# Rivu AI — Services & Engines Inventory

> Companion to `RIVU_COMPLETE_CAPABILITY_INVENTORY.md` §3. Every backend service,
> its file, what it does, status, and evidence.

## A. Processing engines

### A.1 Cleaning / Transformation engine
- **File:** `backend/app/cleaning/engine.py`
- **Class:** `TransformationEngine`
- **Does:** deterministic, allowlisted Polars transformations. LLM never executes.
- **Operations (23):**
  1. `trim_whitespace`
  2. `lowercase`
  3. `uppercase`
  4. `title_case`
  5. `standardize_date`
  6. `standardize_datetime`
  7. `to_numeric`
  8. `to_boolean`
  9. `to_currency`
  10. `to_phone`
  11. `to_email`
  12. `to_category`
  13. `fill_nulls`
  14. `drop_nulls`
  15. `remove_duplicates`
  16. `flag_duplicates`
  17. `flag_outliers`
  18. `replace_value`
  19. `regex_replace`
  20. `clip`
  21. `drop_column`
  22. `rename_column`
  23. `standardize_phone`/`standardize_email` (normalisation variants; see file)
- **Dispatch:** `engine.py:117-141`.
- **Type-changing ops flagged:** `engine.py:48-52`.
- **Status:** WORKING & TESTED (`test_cleaning_engine.py`).

### A.2 Ingestion parser
- **File:** `backend/app/ingestion/parser.py`
- **Does:** CSV/XLSX/XLS/JSON/Parquet; encoding + delimiter detection;
  binary-signature checks.
- **Status:** WORKING.

### A.3 Profiler
- **File:** `backend/app/profiler/engine.py`
- **Does:** dataset + per-column stats; semantic-type inference.
- **Status:** WORKING.

### A.4 Quality engine
- **File:** `backend/app/profiler/quality.py`
- **Does:** weighted completeness/validity/consistency/uniqueness/integrity
  scoring + issue findings.
- **Status:** WORKING & TESTED.

### A.5 AI planner
- **File:** `backend/app/ai/planner.py`
- **Does:** Groq JSON plan + strict allowlist/column/parameter validation.
- **Status:** WORKING (blocked by `GROQ_API_KEY`).

### A.6 Catalogue engine (sub-modules)
- `catalogue/mapping.py` — deterministic fuzzy (fuzzywuzzy) mapping + confidence.
- `catalogue/parser.py` — PDF/Excel/CSV/JSON parsing.
- `catalogue/validator.py` — validation rules.
- `catalogue/exporter.py` — XLSX/CSV/JSON export.
- `catalogue/templates.py` — target templates (memory + DB).
- `catalogue/ai_enrich.py` — Groq enrichment with rule-based fallback.
- **Status:** WORKING.

---

## B. Core services

### B.1 Config
- **File:** `backend/app/core/config.py`
- **Does:** validated settings (~50 fields) + production security gate.
- **Notable:** `APP_ENV` default `"development"`; `INLINE_PROCESSING: bool = True`;
  JWT HS256; Google OAuth; SMTP; separate catalogue DB boundary; stack
  FastAPI/SQLAlchemy/asyncpg/Pydantic-settings/structlog/aioboto3/boto3/httpx/
  PyJWT/passlib/google-auth.
- **Status:** WORKING.

### B.2 Security
- **File:** `backend/app/core/security.py`
- **Does:** PBKDF2 hashing, JWT issue/decode, user resolution (`get_current_user`
  :58-100), org-role gates (`require_org_role` :128-136), Google ID-token verify.
- **Status:** WORKING.

### B.3 Database
- **File:** `backend/app/core/database.py`
- **Does:** async engine/session. Main `Base` at `database.py:24`.
- **Status:** WORKING.

### B.4 Storage
- **File:** `backend/app/core/storage.py`
- **Does:** S3/MinIO client.
- **Status:** WORKING (dev/MinIO).

### B.5 Email
- **File:** `backend/app/core/email.py`
- **Does:** SMTP send (verification/reset).
- **Status:** BLOCKED — CREDENTIALS (SMTP unset).

### B.6 Razorpay
- **File:** `backend/app/core/razorpay.py`
- **Does:** order creation + HMAC signature verify (env-gated fail-closed).
- **Status:** PARTIAL (sandbox; UI verify sends simulated signature).

### B.7 Shopify
- **File:** `backend/app/core/shopify.py`
- **Does:** GraphQL Admin 2024-10 client; draft-first `productCreate`;
  custom-app token flow (`store_url` + `access_token` in body). No OAuth/webhooks.
- **Status:** PARTIAL (sandbox stub token returns fixture).

### B.8 Entitlements
- **File:** `backend/app/core/entitlements.py`
- **Does:** server-side plan-limit enforcement (SKU/AI/channel).
- **Status:** WORKING (only 2 event types enforced).

### B.9 Worker (background jobs)
- **File:** `backend/app/workers/runner.py`, `processor.py`
- **Does:** DB-backed job loop; `runner` claims queued `profile` jobs; `processor`
  fetches raw bytes from storage and processes.
- **Status:** WORKING (not running on live deploy — see Known Issues).

### B.10 Catalogue auth (separate realm)
- **Files:** `catalogue/auth_db.py`, `auth.py`, `auth_models.py`
- **Does:** separate JWT realm; `auth_db.py:20-33` refuses main DB + requires
  `SECRET_KEY ≥32`; `auth.py:98-124` user resolution; `CatalogueBase` at
  `auth_models.py:11`; `users` (`user.py:12`), `organizations` (`organization.py:12`,
  plan default "free").
- **Status:** WORKING.

---

## C. Service dependency graph (summary)

```
config ──► security / database / storage / email / razorpay / shopify / entitlements
database ──► models ──► endpoints
storage ──► worker.processor ──► cleaning/profiler/quality
groq_client ──► ai.planner ──► transformations endpoint
groq_client ──► catalogue.ai_enrich ──► catalogue router
worker.runner ──► job queue ──► worker.processor
```

*End of services inventory.*