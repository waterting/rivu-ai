# Rivu AI — Third-Party Integrations Inventory

> Companion to `RIVU_COMPLETE_CAPABILITY_INVENTORY.md` §4. Every external service,
> its purpose, code location, whether it is actually connected, and what it needs.

## Legend
- **Connected** = code path exists and can run (may still need a key).
- **Sandbox/stub** = returns fixture/simulated data.
- **Template only** = no client, just a schema/template.
- **Unused** = dependency or code present, no caller.

---

## 1. Data & infrastructure

### 1.1 PostgreSQL (main) — asyncpg
- **Purpose:** primary application DB.
- **Code:** `core/database.py` (`DATABASE_URL`, async engine/session, `Base`).
- **Connected:** Yes.
- **Needs:** `DATABASE_URL`.
- **Status:** WORKING.

### 1.2 PostgreSQL (Catalogue, separate) — asyncpg
- **Purpose:** separate catalogue DB + JWT realm.
- **Code:** `catalogue/auth_db.py`, `auth_models.py`.
- **Connected:** Optional (feature-flagged).
- **Needs:** `CATALOGUE_DATABASE_URL` + `CATALOGUE_JWT_SECRET` (≥32 chars; separate
  from main secret).
- **Status:** WORKING (when configured).

### 1.3 S3 / MinIO
- **Purpose:** object storage for raw + processed files.
- **Code:** `core/storage.py`.
- **Connected:** Yes (MinIO in dev).
- **Needs:** `S3_*` (endpoint, bucket, keys).
- **Status:** WORKING (dev).

---

## 2. AI

### 2.1 Groq
- **Purpose:** the **only** LLM provider (transformation planning, catalogue
  enrichment, report executive summary).
- **Code:** `ai/groq_client.py`, `ai/factory.py`, `ai/planner.py`.
- **Connected:** Yes (if key).
- **Needs:** `GROQ_API_KEY`.
- **Status:** WORKING (blocked by missing key).

### 2.2 OpenAI
- **Purpose:** none.
- **Code:** `openai` in `requirements.txt`; **no adapter, no caller**.
- **Status:** UNUSED / DEPRECATED.

### 2.3 Google Gemini
- **Purpose:** none.
- **Code:** none (only `tiktoken` present).
- **Status:** UNUSED.

---

## 3. Auth

### 3.1 Google OAuth
- **Purpose:** ID-token login.
- **Code:** `core/security.py` (Google ID-token verify).
- **Connected:** Yes (if configured).
- **Needs:** `GOOGLE_CLIENT_ID`.
- **Status:** WORKING (blocked by creds).

---

## 4. Payments & commerce

### 4.1 Razorpay
- **Purpose:** subscription payments.
- **Code:** `core/razorpay.py` (order create + HMAC verify), `endpoints/billing.py`.
- **Connected:** Sandbox only.
- **Needs:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
- **Status:** PARTIAL — no webhook endpoint; UI verify sends simulated signature.

### 4.2 Shopify (Admin GraphQL 2024-10)
- **Purpose:** publish products as drafts.
- **Code:** `core/shopify.py` (draft-first `productCreate`), `endpoints/commerce.py`.
- **Connected:** Sandbox stub (fixture shop).
- **Needs:** per-connection `store_url` + `access_token` (custom-app token flow).
- **Status:** PARTIAL — no OAuth, no webhooks, no uninstall handler.

### 4.3 WooCommerce
- **Purpose:** export template only.
- **Code:** `catalogue/templates.py` (template); **no API client**.
- **Status:** NOT IMPLEMENTED (templates only).

---

## 5. Email

### 5.1 SMTP
- **Purpose:** verification + password reset email.
- **Code:** `core/email.py`.
- **Connected:** No (SMTP unset).
- **Needs:** `SMTP_*` (host, port, user, pass, from).
- **Status:** BLOCKED — CREDENTIALS.

---

## 6. Frontend / rendering / hosting

### 6.1 Next.js 16 / React 19
- **Purpose:** frontend app + marketing site.
- **Code:** `app/`, `package.json`.
- **Status:** WORKING.

### 6.2 three.js + @react-three/fiber
- **Purpose:** 3D marketing scenes (`lib/three/*`).
- **Status:** WORKING (decorative).

### 6.3 Vercel
- **Purpose:** frontend hosting.
- **Code:** `vercel.json`.
- **Status:** DEPLOYED (`https://rivu-ai-woad.vercel.app`).

### 6.4 Render
- **Purpose:** backend + worker hosting.
- **Code:** `render.yaml`.
- **Status:** PARTIAL — API deployed, **worker service not running** (see Known
  Issues).

---

## 7. Integration status matrix

| Provider | Purpose | Connected? | Creds needed | Status |
|---|---|---|---|---|
| PostgreSQL (main) | DB | Yes | `DATABASE_URL` | WORKING |
| PostgreSQL (catalogue) | DB | Optional | `CATALOGUE_*` | WORKING (if set) |
| S3 / MinIO | Storage | Yes (dev) | `S3_*` | WORKING |
| Groq | LLM | Yes (if key) | `GROQ_API_KEY` | WORKING (blocked) |
| OpenAI | — | No | — | UNUSED |
| Gemini | — | No | — | UNUSED |
| Google OAuth | Login | Yes (if set) | `GOOGLE_CLIENT_ID` | WORKING (blocked) |
| Razorpay | Payments | Sandbox | `RAZORPAY_*` | PARTIAL |
| Shopify | Publish | Sandbox | per-conn token | PARTIAL |
| WooCommerce | Export | No | — | NOT IMPL (template) |
| SMTP | Email | No | `SMTP_*` | BLOCKED |
| Vercel | Hosting | Yes | — | DEPLOYED |
| Render | Hosting | Partial | — | API only |

*End of integrations inventory.*