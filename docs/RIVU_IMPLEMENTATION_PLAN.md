# Rivu AI — Website Inventory & Implementation Plan (Phase 0)

> Produced before/alongside Phase 1 work. Inventories every public page, product,
> tool, service and integration as it exists in the repo, maps each to where it
> must open inside the unified workspace, and lays out the phase plan.
> Companion to `RIVU_COMPLETE_CAPABILITY_INVENTORY.md`.

## A. Existing public marketing pages (26 routes)

| Route | Purpose | Functional backend? |
|---|---|---|
| `/` | Home (hero, platform, refinement, demo, solutions, AI/BI, CTA, **Explore card**) | Static marketing + Explore CTA |
| `/platform` | Platform overview | Static |
| `/platform/data-refinery` | Data refinery story | Static |
| `/services` | Data Studio (authenticated app duplicate) | Real (auth) |
| `/our-services` | Marketing services | Static (WhatsApp) |
| `/solutions` | Solutions overview | Static |
| `/solutions/custom` | Custom solutions | Static |
| `/solutions/ecommerce` | E-commerce intelligence | Static |
| `/solutions/supplier-data` | Supplier data | Static |
| `/integrations` | Integrations | Static |
| `/tools` | Tools Centre catalog (**now links to workspace**) | Links to `/signup?tool=` |
| `/pricing` | Pricing & subscriptions | Static (billing in app) |
| `/about` | About | Static |
| `/resources` | Resources | Static |
| `/security` | Security | Static |
| `/contact` | Contact | mailto only |
| `/our-solutions/catalogue-data-entry` | Catalogue portal (separate DB/auth) | Real (separate) |
| `/login`, `/signup`, `/reset-password`, `/verify-email` | Auth | Real |
| `/dashboard` (+ `/dataset/[id]`, `/suppliers`, `/channels`, `/billing`) | Authenticated workspace | Real |

## B. Advertised products → unified workspace section

| Advertised product | Workspace section (target) | Backend today |
|---|---|---|
| Data Refinery | §3 Data Refinery | ✅ engines exist |
| Data cleaning & transformation | §3 / §4 Tools Centre | ✅ `cleaning/engine.py` |
| Data quality & validation | §3 / §4 | ✅ `profiler/quality.py` |
| Data tools (14) | §4 Tools Centre | ~8 functional, 3 partial, 3 missing |
| Data analytics & visualization | §5 Data Analytics | ⚠️ basic endpoints, no UI/charts |
| AI Business Intelligence | §7 AI BI | ❌ not built |
| Sales & inventory analysis | §5 / §7 | ⚠️ needs BI |
| E-commerce & catalogue intelligence | §8 Commerce & Catalogue | ✅ catalogue + PIM |
| Product & SKU management | §9 Product & SKU | ✅ PIM model/API (UI partial) |
| Supplier management | §10 Supplier | ✅ |
| Shopify & WooCommerce | §11 Integrations | ⚠️ Shopify sandbox; Woo not built |
| Automation & workflows | §12 Workflows | ⚠️ job queue only |
| Custom data services | §13 Services | ⚠️ CRM/projects (no UI) |
| Pricing & subscriptions | §14 Billing | ✅ (UI now real Razorpay) |
| About/resources/contact | marketing | static |

## C. Tools Centre (14 tools) → workspace mapping

| Tool | Status today | Workspace target |
|---|---|---|
| Format Studio | export only | §4 tool |
| Data Profiler | ✅ | §4 tool |
| Data Cleaner | ✅ | §4 tool |
| Data Validator | ✅ | §4 tool |
| Smart Column Mapper | ✅ catalogue | §4 tool |
| AI Product Enrichment | ✅ catalogue | §4 tool |
| Catalogue Normalizer | ✅ catalogue | §4 tool |
| Duplicate Finder | ✅ (op) | §4 tool |
| Data Compare | ❌ | §4 tool (implement) |
| SKU & Variant Manager | ⚠️ model only | §9 |
| Media Matcher | ❌ | §4 tool (implement) |
| Bulk Exporter | ⚠️ catalogue | §4 tool |
| Data Quality Report | ✅ | §4 tool |
| Custom Transformation Builder | ⚠️ allowlist | §4 tool |

## D. Phase plan (execution order)

- **Phase 0 — Inventory + plan** (this doc). ✅
- **Phase 1 — Critical bug/security fixes** (this turn):
  1. Billing: removed hardcoded GSTIN → `settings.BUSINESS_GSTIN` (never invented); UI now uses real Razorpay Checkout, no fake `sig_valid_simulation`; fails closed if gateway not configured.
  2. Analytics: `/admin` now requires owner/admin role; MRR is real recurring run-rate (active subs, annual÷12) with `collected_this_month_inr` reported separately.
  3. Leads: added `organization_id` (model + migration `0008`) and scoped list/create to the org — closes the "any user reads all leads" hole.
  4. Catalogue templates: delete now succeeds if the template existed in memory OR DB (no false 404).
  5. Shopify: publish contract fixed (frontend sends `channel_connection_id`+`product_ids`, reads `total_requested`/`results`); connect requires a real token, rejects sandbox tokens in production, marks sandbox status.
  6. `/tools`: cards are now links to `/signup?tool=<id>` (open the workspace tool after auth).
  7. Worker/INLINE_PROCESSING verified (inline default true).
- **Phase 2 — Marketing website**: Explore-the-Tool CTA card added at the bottom of the homepage (done this turn). Remaining: visual polish passes.
- **Phase 3 — Unified workspace**: scaffold one app shell with 15 sections (§Overview…§Billing), wire existing engines. **Not yet built** — largest remaining lift.
- **Phase 4 — Website→product integration**: every public product/tool opens its section. Partially done (`/tools` links; Explore CTA).
- **Phase 5 — Testing**: unit/integration/e2e, lint/typecheck/build. Regression tests for Phase 1 fixes still to add.

## E. Honest status of the big asks

- **One unified mega tool (15 sections)**: NOT yet built. Current app is a set of
  dashboard pages (`/dashboard`, `/services`, catalogue portal) that share
  backend engines but not one shell/nav. This is the main Phase 3 effort.
- **AI Business Intelligence** (what sold, margins, restock, demand): NOT built.
  Needs a BI/analysis layer over datasets + Groq. No fake answers.
- **Data Compare / Media Matcher**: NOT implemented.
- **Shopify OAuth lifecycle / WooCommerce**: credential/setup blocked; custom-app
  token flow only; Woo is template-only.

*End of Phase 0.*