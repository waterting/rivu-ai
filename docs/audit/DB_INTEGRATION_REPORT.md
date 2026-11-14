# Database Integration Test Report

Status: **PASS** (verified against a real PostgreSQL server)
Date: 2026-11-14
Scope: Priority 2 of the production-readiness sprint.

## Environment reality

The build machine has **no Docker, no local PostgreSQL, and no package manager**
(`conda`/`scoop`/`choco` all absent). The common embedded-Postgres Python wheels
(`pgserver`, `postgresql-wheel`) have no distribution for the installed
**Python 3.13**, so they cannot be used.

Unblock used: the official **EnterpriseDB PostgreSQL 17.2 Windows x64 portable
binaries** (`postgresql-17.2-1-windows-x64-binaries.zip`, ~311 MB) were
downloaded and extracted to a temp directory (no admin rights required). The
server was initialized with `initdb` and started with `postgres.exe` on
**port 5433** (`pg_isready.exe` is blocked by an Application Control policy, but
`psql.exe` and the server itself run fine).

Two databases were created:

| Purpose  | Database         |
|----------|------------------|
| Main app | `rivu`           |
| Catalogue| `rivu_catalogue` |

## What was verified (real, not mocked)

1. **Full Alembic migration chain applies cleanly from an empty database.**
   `python -m alembic upgrade head` against PostgreSQL 17.2 ran every revision
   (`f5cbb61b8929` → `0001` → `0002` → `0003` → `0004` → `0005` → `0006` →
   `0007_ecommerce_platform`) with no errors, including the renamed
   `0007_ecommerce_platform` revision and the idempotent
   `alembic_version.version_num VARCHAR(255)` widening `DO $$` block.

2. **The app opens a genuine asyncpg connection** to the migrated schema
   (`SELECT 1` succeeds).

3. **User / Organization / Membership round-trip** persists and reads back real
   rows.

4. **Tenant isolation at the DB layer**: `get_user_membership` resolves a real
   membership for the active workspace, and rejects a real user who is not a
   member of the selected organization (`403`). An unaccepted invitation
   (`accepted_at IS NULL`) also does not grant access.

5. **Role gates**: `require_org_role` allows `owner` and rejects `viewer` for an
   `{"owner","admin"}` gate, against real rows.

## Test coverage added

`backend/tests/test_db_integration.py` — 4 tests that connect to a real
PostgreSQL database and assert the behaviours above. The suite **skips
automatically** when no PostgreSQL URL is reachable (via
`INTEGRATION_DATABASE_URL` or `DATABASE_URL`), so the default hermetic suite is
unaffected on machines without a database.

## Results

| Run | Result |
|-----|--------|
| Full backend suite (no DB) | **142 passed** |
| Full backend suite + real PG integration | **146 passed** |
| Integration tests without a DB | **4 skipped** (expected) |

## Remaining limitation (documented, not fixed)

The catalogue portal (`backend/app/catalogue/*`) uses its own `CATALOGUE_DATABASE_URL`
and schema setup script. This report verifies the **main** database migrations
and tenant model end to end. The catalogue database boundary is exercised by the
mock-based `test_catalogue*.py` suite; a dedicated real-DB catalogue migration
run is a follow-up if that portal is taken to production.

## How to reproduce

```powershell
# 1. Start the embedded Postgres (port 5433) and create rivu / rivu_catalogue.
# 2. Apply migrations:
$env:DATABASE_URL='postgresql+asyncpg://postgres@127.0.0.1:5433/rivu'
python -m alembic upgrade head
# 3. Run the suite with the integration DB:
$env:INTEGRATION_DATABASE_URL='postgresql+asyncpg://postgres@127.0.0.1:5433/rivu'
python -m pytest tests/ -q
```