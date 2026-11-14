"""Real PostgreSQL integration tests.

These tests connect to an actual PostgreSQL database (configured via
``INTEGRATION_DATABASE_URL`` or ``DATABASE_URL``) and exercise genuine SQL
against the migrated schema. They are skipped automatically when no PostgreSQL
database is reachable, so the default mock-based suite stays hermetic.

Verified against PostgreSQL 17.2 with the full Alembic migration chain applied.

What is genuinely proven here (not mocks):
- The app can open a real asyncpg connection to the migrated schema.
- A user / organization / membership can be persisted and read back.
- ``get_user_membership`` binds to the active workspace and rejects a user who
  is not a member of the selected organization (tenant isolation at the DB layer).
- ``require_org_role`` enforces role gates against real rows.
- Each test cleans up the rows it creates so the database is left unchanged.
"""

import os
import uuid
from types import SimpleNamespace

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.security import get_user_membership, require_org_role
from app.models.organization import Membership, Organization
from app.models.user import User

pytestmark = pytest.mark.asyncio


def _integration_url() -> str | None:
    url = os.getenv("INTEGRATION_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url:
        return None
    if not url.startswith("postgresql+asyncpg://"):
        return None
    return url


async def _db_available(url: str) -> bool:
    engine = create_async_engine(url, pool_pre_ping=True)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def pg_session():
    url = _integration_url()
    if not url or not await _db_available(url):
        pytest.skip("No PostgreSQL database reachable (set INTEGRATION_DATABASE_URL/DATABASE_URL)")

    engine = create_async_engine(url, pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    session = factory()
    try:
        yield session
    finally:
        await session.rollback()
        await session.close()
        await engine.dispose()


async def _make_user(session, *, email, username):
    user = User(email=email, username=username, password_hash="x", status="active")
    session.add(user)
    await session.flush()
    return user


async def _make_org(session, *, owner_id, name, slug):
    org = Organization(name=name, slug=slug, owner_id=owner_id)
    session.add(org)
    await session.flush()
    return org


async def _make_membership(session, *, user_id, org_id, role, accepted=True):
    from datetime import datetime, timezone

    m = Membership(
        user_id=user_id,
        organization_id=org_id,
        role=role,
        accepted_at=datetime.now(timezone.utc) if accepted else None,
    )
    session.add(m)
    await session.flush()
    return m


async def test_real_connection_and_membership_roundtrip(pg_session):
    suffix = uuid.uuid4().hex[:8]
    user = await _make_user(
        pg_session, email=f"member_{suffix}@example.com", username=f"member_{suffix}"
    )
    org = await _make_org(
        pg_session, owner_id=user.id, name=f"Org {suffix}", slug=f"org-{suffix}"
    )
    await _make_membership(pg_session, user_id=user.id, org_id=org.id, role="editor")

    # get_user_membership must resolve the membership for the active workspace.
    active_user = SimpleNamespace(id=user.id, active_org_id=org.id)
    membership = await get_user_membership(active_user, pg_session)
    assert membership.role == "editor"
    assert membership.organization_id == org.id

    await pg_session.rollback()


async def test_tenant_isolation_rejects_non_member(pg_session):
    from fastapi import HTTPException

    suffix = uuid.uuid4().hex[:8]
    owner = await _make_user(
        pg_session, email=f"owner_{suffix}@example.com", username=f"owner_{suffix}"
    )
    outsider = await _make_user(
        pg_session, email=f"outsider_{suffix}@example.com", username=f"outsider_{suffix}"
    )
    org = await _make_org(
        pg_session, owner_id=owner.id, name=f"Org {suffix}", slug=f"org-{suffix}"
    )
    await _make_membership(pg_session, user_id=owner.id, org_id=org.id, role="owner")

    # The outsider is a real user but has no membership in this org.
    outsider_active = SimpleNamespace(id=outsider.id, active_org_id=org.id)
    with pytest.raises(HTTPException) as exc:
        await get_user_membership(outsider_active, pg_session)
    assert exc.value.status_code == 403

    await pg_session.rollback()


async def test_require_org_role_enforces_role_gate(pg_session):
    from fastapi import HTTPException

    suffix = uuid.uuid4().hex[:8]
    owner = await _make_user(
        pg_session, email=f"owner_{suffix}@example.com", username=f"owner_{suffix}"
    )
    viewer = await _make_user(
        pg_session, email=f"viewer_{suffix}@example.com", username=f"viewer_{suffix}"
    )
    org = await _make_org(
        pg_session, owner_id=owner.id, name=f"Org {suffix}", slug=f"org-{suffix}"
    )
    await _make_membership(pg_session, user_id=owner.id, org_id=org.id, role="owner")
    await _make_membership(pg_session, user_id=viewer.id, org_id=org.id, role="viewer")

    owner_active = SimpleNamespace(id=owner.id, active_org_id=org.id)
    membership = await require_org_role(owner_active, pg_session, {"owner", "admin"})
    assert membership.role == "owner"

    viewer_active = SimpleNamespace(id=viewer.id, active_org_id=org.id)
    with pytest.raises(HTTPException) as exc:
        await require_org_role(viewer_active, pg_session, {"owner", "admin"})
    assert exc.value.status_code == 403

    await pg_session.rollback()


async def test_pending_invitation_does_not_grant_access(pg_session):
    from fastapi import HTTPException

    suffix = uuid.uuid4().hex[:8]
    owner = await _make_user(
        pg_session, email=f"owner_{suffix}@example.com", username=f"owner_{suffix}"
    )
    invitee = await _make_user(
        pg_session, email=f"invitee_{suffix}@example.com", username=f"invitee_{suffix}"
    )
    org = await _make_org(
        pg_session, owner_id=owner.id, name=f"Org {suffix}", slug=f"org-{suffix}"
    )
    await _make_membership(pg_session, user_id=owner.id, org_id=org.id, role="owner")
    # Unaccepted invitation (accepted_at is NULL).
    await _make_membership(
        pg_session, user_id=invitee.id, org_id=org.id, role="viewer", accepted=False
    )

    invitee_active = SimpleNamespace(id=invitee.id, active_org_id=org.id)
    with pytest.raises(HTTPException) as exc:
        await get_user_membership(invitee_active, pg_session)
    assert exc.value.status_code == 403

    await pg_session.rollback()