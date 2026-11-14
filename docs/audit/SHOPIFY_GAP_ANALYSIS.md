# Shopify Integration — Gap Analysis

Status: **Gap analysis** (code reviewed, no live store credentials available)
Date: 2026-11-14
Scope: Priority 6 of the production-readiness sprint.
Files reviewed: `backend/app/core/shopify.py`,
`backend/app/api/v1/endpoints/commerce.py`.

## What is actually implemented

`ShopifyGraphQLClient` (`app/core/shopify.py`) is a real Shopify Admin
**GraphQL** client (API version `2024-10`):

- `execute_query()` — POSTs to `https://{store}.myshopify.com/admin/api/2024-10/graphql.json`
  with the `X-Shopify-Access-Token` header; handles 401 (invalid/revoked token),
  429 (rate limit), and GraphQL `errors`.
- `verify_connection()` — `shop` query (name, domain, plan).
- `create_draft_product()` — official `productCreate` mutation, **DRAFT by
  default** (only `ACTIVE` when the caller explicitly passes `publish_live`).

Endpoint wiring (`commerce.py`):
- `POST /commerce/channels/connect` — takes `{channel_type, store_url,
  access_token}`, verifies the connection, stores the token server-side.
- `POST /commerce/channels/publish` — loads the stored token and publishes
  products as drafts.

This is **genuine API code**, not a mock — but it is the **custom-app access
token** flow, not a full Shopify app.

## Gap: custom-app token flow vs. a production Shopify app

The integration expects the merchant to manually create a **custom app** in
their Shopify admin and paste an **Admin API access token** into the connect
form. This is a legitimate integration style for a single store, but it is not
a distributable app and has material gaps for production:

| # | Gap | Impact | Severity |
|---|-----|--------|----------|
| 1 | **No OAuth install flow** — no `/auth` redirect, no callback handler, no `state`/HMAC validation, no `POST /admin/api/{ver}/oauth/access_token` token exchange | Merchants cannot install the app from the Shopify App Store; token must be pasted manually | High |
| 2 | **No webhook subscriptions** — no `app/uninstalled`, `shop/update`, or product/order webhooks, and no HMAC verification of webhook payloads | App never learns when a merchant uninstalls or revokes access; no reactive sync | High |
| 3 | **No uninstall / revocation handling** — a revoked token keeps failing at publish time with only a 401 error; the stored connection is not marked disconnected | Stale connections accumulate; poor UX | Medium |
| 4 | **Scopes not managed** — no OAuth scopes requested or documented; token scope is whatever the merchant grants in the custom app | Unclear least-privilege; may under- or over-permission | Medium |
| 5 | **Write surface is create-only** — only `productCreate`. No update, delete, inventory/price sync, or order import | Publish is one-way and draft-only; edits in Rivu do not propagate | Medium |
| 6 | **No rate-limit backoff** — a 429 raises immediately with no retry/backoff | Bulk publish can fail under Shopify's leaky-bucket limits | Medium |
| 7 | **Sandbox simulation is indistinguishable from success in logs unless inspected** — when `is_configured()` is false the client returns fixtures (`shop.name = "Sandbox Test Store"`, `product.id = gid://shopify/Product/sandbox_*`) | Safe for dev, but a misconfigured deploy could silently "succeed" in tests | Low |
| 8 | **API version pinned to 2024-10** — no version negotiation or upgrade path | Will drift as Shopify deprecates versions | Low |

## What is NOT claimed

- No OAuth app listing, no App Store review artifacts, no webhook endpoints.
- No live publish against a real store was run (no credentials).
- The draft-first behaviour is a safety feature, not a full publish workflow.

## Recommended remediation path (for a real app)

1. **OAuth**: implement `/auth` (redirect with `scope` + `state`), `/callback`
   (validate `hmac`, exchange code for token), and store the token encrypted.
2. **Webhooks**: register `app/uninstalled` + `shop/update`; verify
   `X-Shopify-Hmac-Sha256`; mark connections disconnected on uninstall.
3. **Lifecycle**: on 401 from any call, set the connection status to
   `disconnected` and surface a re-auth prompt.
4. **Write coverage**: add `productUpdate`, `productDelete`,
   `inventorySetOnHand`, and price sync for two-way updates.
5. **Resilience**: add bounded exponential backoff on 429 and honour the
   `Retry-After`/`cost` headers.
6. **Versioning**: make the API version configurable and add a deprecation check.

## Decision

The current custom-app token flow is **acceptable for a single-store, manual
integration** and is honestly scoped as such. It is **not** a production
Shopify App. Until the OAuth + webhook work above is done, the integration must
**not** be marketed as "installable Shopify app" — only as a "connect a store
with an Admin API token" flow. This matches the relabeling done in
`FUNCTION_INVENTORY.md`.