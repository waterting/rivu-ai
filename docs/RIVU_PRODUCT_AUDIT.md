# Rivu AI — Complete Product Audit & Implementation Roadmap

**Date:** 2026-11-15  
**Auditor:** Principal SaaS Architect & Senior Full-Stack Engineer  
**Repository:** `waterting/rivu-ai`  
**Branch:** `main`

---

## 1. Executive Summary

Rivu AI is an AI-powered data intelligence platform transitioning into an **Intelligent Data and Catalogue Operations Platform for Modern Commerce**.

Currently, the repository contains two major subsystems:
1. **Rivu Data Refinery** (Core): A dataset ingestion, profiling, data quality analysis, AI-assisted transformation planning, and S3-backed artifact generation platform built with Next.js 16 (React 19), FastAPI, SQLAlchemy (PostgreSQL/Neon), and Polars.
2. **Catalogue Portal** (`/our-solutions/catalogue-data-entry`): A specialized catalogue management workflow for uploading supplier catalogues (CSV, XLSX, XLS, JSON, PDF), mapping supplier columns to canonical schemas, inline data editing, template-based validation, and export generation (Shopify CSV, WooCommerce CSV, ERP formats).

This audit evaluates the current codebase against the Master Product Build requirements and establishes a phased execution plan to make Rivu AI a fully realized e-commerce data intelligence SaaS platform.

---

## 2. Capability Matrix: Current vs. Target

| Capability | Current State | Target Product Spec | Gap & Next Steps | Status |
|---|---|---|---|---|
| **Multi-Tenant Architecture** | Basic orgs (`organizations`, `memberships`) in core DB; standalone accounts in catalogue DB. | Unified multi-tenancy: Super Admin, Org Owner, Org Admin, Catalogue Manager, Operator, Viewer with strict row-level tenant isolation. | Integrate role permissions across all endpoints, add Super Admin controls and audit logging. | **Partial** |
| **Universal Data Ingestion** | File parsing for CSV, XLSX, XLS, JSON, PDF (text) up to 500MB. Multi-sheet workbook selection. | Chunked processing, duplicate detection, upload history, job tracking, supplier connectors, and error handling. | Add persistent upload jobs, background task queue tracking, and supplier metadata. | **Working / Partial** |
| **PIM & SKU Management** | In-memory catalogue rows or standalone catalogue tables; basic canonical fields (name, sku, price, etc.). | Full PIM with parent/variant SKUs, barcodes, attributes, specs, commercial & inventory data, channels, media. | Build dedicated PIM database models, parent/variant handling, and canonical product repository. | **Partial** |
| **AI Mapping Engine** | Deterministic synonym matching + Groq AI mapping suggestions; custom template saving. | Mapping memory, column similarity, confidence scores, human approval, supplier-specific memory. | Persist mapping recipes per supplier/org, store confidence metrics. | **Working / Partial** |
| **Data Quality & Cleaning** | In-memory validation engine checking required fields, duplicate SKUs, numeric prices, URLs, regex. | Comprehensive Data Quality Dashboard with completeness score, error classification, bulk fix actions, audit history. | Expose quality metrics dashboard API and bulk remediation rules. | **Working / Partial** |
| **Product Enrichment** | AI enrichment via Groq (`/catalogue/enrich`) with fallback rules. | SEO titles, bullet points, attribute extraction, batch enrichment queue with usage tracking. | Connect enrichment directly to PIM records with cost/token metering. | **Working / Partial** |
| **Large Catalogue Processing** | Synchronous parsing in memory; limits scalability to ~10,000 SKUs without high RAM. | Chunked stream processing with Polars, background worker jobs, progress tracking, 20,000 SKU scalability. | Implement chunked Polars processor and background job runner for catalogue files. | **Missing** |
| **Supplier & IndiaMART Workflows** | Ad-hoc file uploads; no supplier directory or supplier-specific templates. | Supplier Directory, supplier-specific mapping templates, comparison, IndiaMART export-format workflow. | Create Supplier entity, link catalogue imports to suppliers, add IndiaMART template. | **Missing** |
| **Commerce Operations & Channels** | File exports formatted for Shopify and WooCommerce CSVs. | Native Shopify GraphQL Admin API integration (OAuth, read, draft create, sync, webhooks) and WooCommerce adapter. | Implement Shopify GraphQL client, OAuth flow, connection management, and draft product sync. | **Partial (Templates only)** |
| **Subscriptions & Billing** | No billing engine or plan enforcement; free access. | Tiered subscription engine (₹4,999 to ₹2,49,999/mo), Razorpay Subscriptions, usage entitlements, GST invoicing. | Build Subscription, Plan, Entitlement, Invoice models + Razorpay integration + entitlement middleware. | **Missing** |
| **Custom E-Commerce Solutions** | Static service descriptions on `/our-services`. | Custom Solutions Workspace: proposals, scope definitions, quotations, milestone tracking, onboarding. | Create CustomSolutionProject models, endpoints, and admin/client workspace. | **Missing** |
| **Internal CRM & Lead Pipeline** | None. | Internal Sales CRM: 8 stages, lead tracking, discovery, proposal status, separate from customer orgs. | Build Lead & Pipeline models, CSV import, and management API/UI. | **Missing** |
| **Analytics & Reporting** | Static or simple summary metrics. | Live API-backed organization & Super Admin dashboards: SKU completeness, processing jobs, revenue, churn. | Implement real aggregation endpoints reading from operational tables. | **Missing** |

---

## 3. Detailed Architectural Findings

### 3.1 Frontend (`app/`, `lib/`)
- **Framework:** Next.js 16 (App Router), React 19, TypeScript.
- **Styling:** CSS Modules (`dashboard.module.css`, `login.module.css`, `catalogue.module.css`). Pure CSS with liquid glass design aesthetic.
- **State Management:** Local storage tokens (`rivu_access_token`, `rivu_refresh_token`, `catalogue_access_token`) and React component state.
- **Auth:** Standard email/password + Google OAuth GIS button on `/login` and `/signup`. Independent Catalogue Portal login on `/our-solutions/catalogue-data-entry`.

### 3.2 Backend (`backend/app/`)
- **Framework:** FastAPI, Pydantic v2, structlog.
- **ORM & DB:** SQLAlchemy 2.0 (asyncpg), PostgreSQL (Neon compatible), Alembic migrations.
- **Processing Engine:** Polars, pandas, openpyxl, reportlab.
- **AI Integrations:** Groq client with fallback heuristics.
- **Storage:** S3/MinIO compatible object store (`boto3`/`aioboto3`).

---

## 4. Phase-by-Phase Implementation Plan

### Phase 1: Core Multi-Tenant Foundation & Commercial Engine
1. **Unified Multi-Tenancy & RBAC:**
   - Define canonical user roles: `super_admin`, `owner`, `admin`, `catalogue_manager`, `operator`, `viewer`.
   - Implement organization-scoped security dependencies.
2. **Subscription & Billing System (Module J):**
   - Models: `SubscriptionPlan`, `PlanEntitlement`, `Subscription`, `Payment`, `Invoice`, `UsageEvent`.
   - Plans: Starter (₹4,999/mo), Growth, Business, Enterprise/Custom (up to ₹2,49,999/mo).
   - Razorpay recurring billing integration with webhook verification and test-mode fallback.
   - Server-side entitlement enforcement and GST invoice generation.

### Phase 2: Enhanced PIM, SKU & Supplier Intelligence
1. **Canonical Product & SKU Models (Module B):**
   - Canonical `Product`, `ProductVariant`, `ProductAttribute`, `ProductMedia`, `Category`.
   - Full support for internal SKU, parent/variant hierarchy, commercial data, inventory, and custom fields.
2. **Supplier Data Workflows (Module G):**
   - `Supplier` directory, supplier-specific mapping recipes, and IndiaMART-compatible templates.
3. **Chunked Large-Catalogue Processing (Module F):**
   - Asynchronous job execution for 1,000 to 20,000+ SKU workloads with Polars.
   - Real-time job status and row-level progress tracking.

### Phase 3: Commerce Operations & Shopify GraphQL Integration
1. **Channel Adapter Interface (Module H & 12):**
   - Reusable connector interface (`connect`, `sync`, `publish`, `status`).
2. **Shopify Integration (Module 11):**
   - Shopify GraphQL Admin API connector.
   - OAuth flow, credentials storage, draft product creation (`productCreate`), variant mapping, and webhook handlers.
   - Sandbox verification with clear credential requirements.

### Phase 4: Custom Solutions & Internal Sales CRM
1. **Custom Solutions Workspace (Module I):**
   - Models: `CustomSolutionProject`, `CustomSolutionProposal`, `Milestone`.
   - Proposal generator, quotation records, and client onboarding workflow.
2. **Internal CRM & Lead Pipeline (Module N):**
   - Lightweight CRM for Rivu sales team: 8-stage pipeline, lead tracking, and conversion metrics.

### Phase 5: Analytics Dashboards, UI Unification & Verification
1. **Real Operational Analytics (Module M):**
   - Organization data intelligence metrics (completeness, issues, sync status).
   - Super Admin revenue and platform usage metrics.
2. **Unified Navigation & Frontend Polish (Module 21):**
   - Integrated enterprise sidebar navigation covering Catalogues, Products, Suppliers, Channels, Billing, and Analytics.
3. **Acceptance Testing & Verification:**
   - Automated test suite covering subscriptions, Shopify adapters, large SKU pipelines, and multi-tenant security.

