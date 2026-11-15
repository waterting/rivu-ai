from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.security import get_user_membership, require_org_context, require_org_role


@pytest.mark.asyncio
async def test_membership_query_is_bound_to_active_workspace():
    user_id = uuid4()
    active_org_id = uuid4()
    user = SimpleNamespace(id=user_id, active_org_id=active_org_id)
    membership = SimpleNamespace(
        user_id=user_id,
        organization_id=active_org_id,
        role="editor",
        accepted_at=object(),
    )
    db = AsyncMock()
    db.execute.return_value = SimpleNamespace(scalar_one_or_none=lambda: membership)

    result = await get_user_membership(user, db)

    assert result is membership
    statement = db.execute.await_args.args[0]
    params = statement.compile().params
    assert user_id in params.values()
    assert active_org_id in params.values()
    assert "accepted_at IS NOT NULL" in str(statement)


@pytest.mark.asyncio
async def test_membership_lookup_fails_closed_without_active_workspace():
    user = SimpleNamespace(id=uuid4())
    db = AsyncMock()

    with pytest.raises(HTTPException) as exc:
        await get_user_membership(user, db)

    assert exc.value.status_code == 403
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_viewer_cannot_use_editor_or_admin_role_gate():
    user_id = uuid4()
    active_org_id = uuid4()
    user = SimpleNamespace(id=user_id, active_org_id=active_org_id)
    membership = SimpleNamespace(
        user_id=user_id,
        organization_id=active_org_id,
        role="viewer",
        accepted_at=object(),
    )
    db = AsyncMock()
    db.execute.return_value = SimpleNamespace(scalar_one_or_none=lambda: membership)

    with pytest.raises(HTTPException) as exc:
        await require_org_role(user, db, {"owner", "admin", "editor"})

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_require_org_context_returns_the_selected_organization():
    user_id = uuid4()
    active_org_id = uuid4()
    user = SimpleNamespace(id=user_id, active_org_id=active_org_id)
    membership = SimpleNamespace(
        user_id=user_id,
        organization_id=active_org_id,
        role="owner",
        accepted_at=object(),
    )
    db = AsyncMock()
    db.execute.return_value = SimpleNamespace(scalar_one_or_none=lambda: membership)

    assert await require_org_context(user, db) == active_org_id


@pytest.mark.asyncio
async def test_require_org_context_rejects_unaccepted_invitation():
    """A pending invitation must not select another workspace's data.

    Endpoints used to run their own membership query without the accepted_at
    filter, so an invited-but-not-joined user could read that org's datasets
    (audit finding 4). Routing every endpoint through require_org_context
    closes it.
    """
    user = SimpleNamespace(id=uuid4(), active_org_id=uuid4())
    db = AsyncMock()
    db.execute.return_value = SimpleNamespace(scalar_one_or_none=lambda: None)

    with pytest.raises(HTTPException) as exc:
        await require_org_context(user, db)

    assert exc.value.status_code == 403
    statement = db.execute.await_args.args[0]
    assert "accepted_at IS NOT NULL" in str(statement)
