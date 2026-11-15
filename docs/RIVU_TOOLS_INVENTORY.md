# Rivu AI — Tools Inventory

> Companion to `RIVU_COMPLETE_CAPABILITY_INVENTORY.md` §2. Every tool listed with
> input / processing / output / export / AI / backend engine / frontend surface /
> DB usage / status / evidence.

## Legend
- **Functional** = a user can actually run it and get a real result.
- **Where** = the surface a user actually invokes it from (marketing `/tools`
  catalog is *not* functional for any tool).

---

## A. Tools marketed on the public `/tools` page

The public page (`app/(marketing)/tools/page.tsx`) renders 14 cards. They are
**static `<div>`s with no buttons, no upload, no processing, and no link to a
functional tool**. None of them run on that page. The "functional" column below
reflects whether the named capability exists *somewhere* in the product.

| # | Marketed tool | Functional? | Real location | Engine / evidence |
|---|---|---|---|---|
| 1 | Format Studio | ✅ | Workspace tool `/dashboard/tools/format-studio` | `endpoints/datasets.py` export handler |
| 2 | Data Profiler | ✅ | Dashboard / Data Studio | `profiler/engine.py` |
| 3 | Data Cleaner | ✅ | Refinement transform | `cleaning/engine.py` |
| 4 | Data Validator | ✅ | Quality analysis | `profiler/quality.py` |
| 5 | Smart Column Mapper | ✅ (catalogue only) | Catalogue Portal | `catalogue/mapping.py` |
| 6 | AI Product Enrichment | ✅ (advisory) | Catalogue Portal | `catalogue/ai_enrich.py` |
| 7 | Catalogue Normalizer | ✅ | Catalogue Portal | `catalogue/mapping.py` |
| 8 | Duplicate Finder | ✅ | Refinement ops | `cleaning/engine.py` (`flag_duplicates`, `remove_duplicates`) |
| 9 | Data Compare | ✅ | Workspace tool `/dashboard/tools/compare` | Profile endpoints (`insights.py`) diffed client-side; no new backend needed |
| 10 | SKU & Variant Manager | ⚠️ partial | PIM model only | `models/commerce.py` (`Product`, `ProductVariant`) |
| 11 | Media Matcher | ✅ | Workspace tool `/dashboard/tools/media-matcher` | Deterministic filename↔SKU audit over PIM records (`commerce.py`) |
| 12 | Bulk Exporter | ⚠️ partial | Catalogue export | `catalogue/exporter.py` |
| 13 | Data Quality Report | ✅ | Dashboard / PDF | `endpoints/reports.py` |
| 14 | Custom Transformation Builder | ⚠️ partial | Refinement (fixed allowlist) | `cleaning/engine.py` |

---

## B. Detailed functional tool entries

### B.1 Data Profiler
- **Input:** an ingested `DatasetVersion` (CSV/XLSX/XLS/JSON/Parquet already parsed).
- **Processing:** structural stats (row/col counts, nulls, distinct), per-column
  type inference, semantic type detection (email/phone/date/currency/etc.).
- **Output:** `DataProfile` + `ColumnProfile` rows; rendered in dashboard & Data Studio.
- **Export:** not directly (feeding quality/report).
- **AI:** none.
- **Backend:** `profiler/engine.py` (+ `profiler/quality.py` for scores).
- **Frontend:** `app/dashboard/page.tsx`, `app/services/page.tsx`.
- **DB:** `data_profiles`, `column_profiles`.
- **Status:** WORKING & TESTED.

### B.2 Data Quality Validator
- **Input:** a `DataProfile` + the parsed frame.
- **Processing:** weighted completeness / validity / consistency / uniqueness /
  integrity scoring → issue findings (`QualityIssue`).
- **Output:** `QualityReport` + issues.
- **Export:** via reports (JSON/PDF).
- **AI:** none (deterministic).
- **Backend:** `profiler/quality.py`.
- **Frontend:** dashboard + dataset detail.
- **DB:** `quality_reports`, `quality_issues`.
- **Status:** WORKING & TESTED.

### B.3 Data Cleaner (transformation engine)
- **Input:** a `TransformationPlan` (from AI planner or manual ops) + version.
- **Processing:** deterministic Polars ops; 23 operations (see
  `RIVU_SERVICES_INVENTORY.md` §Cleaning engine). Type-changing ops flagged.
- **Output:** new immutable `DatasetVersion` (preview → approve → execute).
- **Export:** inherited from dataset export.
- **AI:** AI *plans* the ops; AI never executes.
- **Backend:** `cleaning/engine.py`; `endpoints/transformations.py`.
- **Frontend:** `app/dashboard/dataset/[id]/page.tsx`.
- **DB:** `transformation_plans`, `transformation_runs`, `dataset_versions`.
- **Status:** WORKING & TESTED.

### B.4 Format / Export Studio (real capability)
- **Input:** any `DatasetVersion`.
- **Processing:** serialize to requested format.
- **Output:** CSV / XLSX / JSON / Parquet download.
- **Export:** the download itself.
- **AI:** none.
- **Backend:** `endpoints/datasets.py` export.
- **Frontend:** dataset detail page.
- **Status:** WORKING.

### B.5 Smart Column Mapper (Catalogue Portal only)
- **Input:** uploaded catalogue file + chosen target template.
- **Processing:** deterministic fuzzy (fuzzywuzzy) synonym matching with confidence
  scoring — **not AI**.
- **Output:** column mapping proposal, persisted as `catalogue_saved_templates`.
- **Export:** via catalogue export.
- **AI:** none (rule-based).
- **Backend:** `catalogue/mapping.py`.
- **Frontend:** `app/our-solutions/catalogue-data-entry`.
- **DB:** catalogue DB (`catalogue_saved_templates`, workspaces).
- **Status:** WORKING.

### B.6 Catalogue Normalizer
- **Input:** mapped columns.
- **Processing:** normalization per template rules.
- **Output:** normalized records.
- **Backend:** `catalogue/mapping.py`.
- **Status:** WORKING.

### B.7 Catalogue Validator
- **Input:** normalized records.
- **Processing:** validation rules → errors/warnings.
- **Output:** validation report.
- **Backend:** `catalogue/validator.py`.
- **Status:** WORKING.

### B.8 AI Product Enrichment (Catalogue Portal)
- **Input:** normalized product records.
- **Processing:** Groq generates descriptions / SEO / tags; **rule-based fallback**
  when key absent.
- **Output:** advisory enrichment (not persisted as canonical).
- **AI:** Groq (only provider); fallback deterministic.
- **Backend:** `catalogue/ai_enrich.py`.
- **Status:** WORKING (advisory; blocked by `GROQ_API_KEY` for real AI).

### B.9 Duplicate Finder
- **Input:** dataset version + op params.
- **Processing:** `flag_duplicates` / `remove_duplicates` deterministic ops.
- **Output:** flagged/removed rows in new version.
- **Backend:** `cleaning/engine.py`.
- **Status:** WORKING (within refinement).

### B.10 Data Quality Report
- **Input:** quality report + profile.
- **Processing:** assemble JSON / dashboard / PDF / executive PDF (AI summary +
  fallback).
- **Output:** downloadable report.
- **Backend:** `endpoints/reports.py`.
- **Status:** WORKING (AI summary has fallback).

### B.11 Bulk Exporter (Catalogue)
- **Input:** catalogue dataset.
- **Processing:** export to XLSX/CSV/JSON.
- **Output:** file download.
- **Backend:** `catalogue/exporter.py`.
- **Status:** PARTIAL (catalogue-only; no cross-tool bulk export).

### B.12 SKU & Variant Manager
- **Input:** product + variants.
- **Processing:** PIM CRUD (`Product`, `ProductVariant`) exists.
- **Output:** PIM records.
- **Backend:** `endpoints/commerce.py`.
- **Frontend:** no dedicated UI (create endpoint unused).
- **Status:** PARTIAL (model/API only).

### B.13 Custom Transformation Builder
- **Input:** user-selected ops.
- **Processing:** fixed allowlist of 23 ops (not arbitrary code).
- **Output:** transform plan → execution.
- **Backend:** `cleaning/engine.py`.
- **Status:** PARTIAL (fixed allowlist, not free-form).

---

## C. Tools that do NOT exist (NOT IMPLEMENTED)

| Tool | Evidence |
|---|---|
| Data Compare | UI added at `/dashboard/tools/compare`; uses existing profile endpoints. |
| Media Matcher | UI added at `/dashboard/tools/media-matcher`; verifies filename conventions only, not image content. |
| Standalone Format Studio (distinct tool) | UI added at `/dashboard/tools/format-studio` (per-version, four formats). |

---

## D. Truth table (quick reference)

| Capability | Functional somewhere? | Primary surface |
|---|---|---|
| Profile | ✅ | Dashboard / Data Studio |
| Quality validate | ✅ | Dashboard |
| Clean/transform | ✅ | Dataset detail |
| Export (4 formats) | ✅ | Dataset detail |
| Catalogue map/normalize/validate | ✅ | Catalogue Portal |
| Catalogue AI enrich | ✅ (advisory) | Catalogue Portal |
| Duplicates | ✅ | Dataset detail |
| Quality report (PDF) | ✅ | Dashboard / dataset |
| SKU/variant | ⚠️ | PIM API only |
| Bulk export (catalogue) | ⚠️ | Catalogue Portal |
| Custom transform | ⚠️ | Dataset detail (allowlist) |
| Data Compare | ❌ | — |
| Media Matcher | ❌ | — |

*End of tools inventory.*