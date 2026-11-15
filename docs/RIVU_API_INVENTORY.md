# Rivu AI — API Inventory

> Companion to `RIVU_COMPLETE_CAPABILITY_INVENTORY.md` §5. All endpoints, auth,
> and observed contract issues.

## Base paths
- Global prefix: `/api/v1` (`main.py:97`).
- Non-versioned: `GET /health`, `GET /`.
- Catalogue: `/api/v1/catalogue` (+ `/api/v1/catalogue/auth`).

## Auth model
- JWT access + refresh; `Authorization: Bearer <token>`.
- `get_current_user` (`core/security.py:58-100`) validates membership/org.
- `require_org_role` (`core/security.py:128-136`) for role-gated endpoints.
- Catalogue realm: `catalogue/auth.py:98-124`; separate guard `auth_db.py:20-33`.

---

## 1. Auth — `/api/v1/auth` (10)
| Method | Path | Purpose |
|---|---|---|
| POST | `/signup` | create user + org |
| POST | `/login` | password login → tokens |
| POST | `/refresh` | refresh token |
| POST | `/logout` | revoke refresh |
| POST | `/google` | Google ID-token login |
| POST | `/forgot-password` | email reset link |
| POST | `/reset-password` | set new password |
| POST | `/verify-email` | verify email token |
| POST | `/resend-verification` | resend |
| GET | `/me` | current user |

Schema: `schemas/auth.py` — email, username 3–50, password 8–128 (lower+upper+
digit), full_name optional. No email verification enforced at signup.

## 2. Billing — `/api/v1/billing` (6)
| Method | Path | Purpose |
|---|---|---|
| GET | `/plans` | list plans |
| GET | `/current` | current subscription |
| GET | `/usage` | usage metering |
| POST | `/subscribe` | create order |
| POST | `/verify-payment` | HMAC verify |
| GET | `/invoices` | list invoices |

**Issue:** `verify-payment` — frontend sends `"sig_valid_simulation"`; verifier
accepts only `valid_test_signature`/`sig_test_*` → live verify 400s.
`subscribe` hardcodes `provider_gstin="27AABCU9603R1ZM"`.

## 3. Commerce — `/api/v1/commerce` (7)
| Method | Path | Purpose |
|---|---|---|
| GET | `/suppliers` | list suppliers |
| POST | `/suppliers` | create supplier |
| GET | `/products` | list products |
| POST | `/products` | create product |
| GET | `/channels` | list channels |
| POST | `/channels/connect` | connect store |
| POST | `/channels/publish` | publish products |

**Issue:** `channels/publish` — frontend posts `{channel_id, publish_as_draft}`,
API expects `{channel_connection_id, product_ids}` → 422. Response mismatch
(`synced_count`/`failed_count` vs `total_requested`/`results`).
`channels/connect` — sandbox token returns fixture shop.

## 4. Custom Solutions / CRM — `/api/v1/solutions` (4)
| Method | Path | Purpose |
|---|---|---|
| GET | `/projects` | list |
| POST | `/projects` | create |
| GET | `/leads` | list |
| POST | `/leads` | create |

**Issue:** leads not org-scoped; no UI caller.

## 5. Analytics — `/api/v1/analytics` (2)
| Method | Path | Purpose |
|---|---|---|
| GET | `/organization` | org KPIs |
| GET | `/admin` | admin KPIs |

**Issue:** `/admin` has no role gate (any authenticated user); "MRR" = paid
invoices dated this calendar month.

## 6. Projects — `/api/v1/projects` (4)
| Method | Path | Purpose |
|---|---|---|
| POST | `/` | create project |
| GET | `/` | list projects |
| GET | `/{id}` | project detail |
| DELETE | `/{id}` | delete project |

## 7. Datasets — `/api/v1/datasets` (4)
| Method | Path | Purpose |
|---|---|---|
| POST | `/upload` | upload file (202, queued) |
| GET | `/{id}` | dataset detail |
| GET | `/{id}/versions` | list versions |
| GET | `/{id}/export` | export |

## 8. Insights — `/api/v1/datasets` (5)
| Method | Path | Purpose |
|---|---|---|
| POST | `/{id}/profile` | run profile |
| GET | `/{id}/profile` | get profile |
| GET | `/{id}/quality` | get quality |
| POST | `/{id}/ai-plan` | AI transform plan |
| POST | `/{id}/transform/preview` | preview transform |

## 9. Reports — `/api/v1/reports` (4)
| Method | Path | Purpose |
|---|---|---|
| GET | `/{id}/json` | JSON report |
| GET | `/{id}/dashboard` | dashboard report |
| GET | `/{id}/pdf` | PDF report |
| GET | `/{id}/executive-pdf` | executive PDF |

## 10. Transformations — `/api/v1/datasets` (3)
| Method | Path | Purpose |
|---|---|---|
| POST | `/{id}/transform/preview` | preview |
| POST | `/{id}/transform/approve` | approve plan |
| POST | `/{id}/transform/execute` | execute → new version |

## 11. Catalogue — `/api/v1/catalogue` (9) + auth (5)
| Method | Path | Purpose |
|---|---|---|
| POST | `/upload` | upload catalogue file |
| POST | `/map` | map columns |
| POST | `/validate` | validate |
| POST | `/enrich` | AI enrich (advisory) |
| GET | `/templates` | list templates |
| POST | `/templates` | save template |
| DELETE | `/templates/{id}` | delete template |
| POST | `/export` | export |
| GET | `/workspaces` | list workspaces |
| + | `/auth/*` | catalogue signup/login/refresh/etc |

**Issue:** templates dual-written (memory + DB); delete relies on DB rowcount →
memory-only templates report 404.

---

## Contract issues summary
| Endpoint | Issue |
|---|---|
| `POST /billing/verify-payment` | UI sends simulated signature → 400 |
| `POST /billing/subscribe` | hardcoded provider GSTIN |
| `POST /commerce/channels/publish` | request/response contract mismatch → 422 |
| `POST /commerce/channels/connect` | sandbox fixture token |
| `GET /analytics/admin` | no role gate; miscomputed MRR |
| `DELETE /catalogue/templates/{id}` | memory-only templates 404 |
| `POST /datasets/upload` | 202 but job stuck "queued" (worker down) |

*End of API inventory.*