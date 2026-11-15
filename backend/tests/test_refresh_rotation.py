"""Refresh-token rotation families and reuse detection (audit finding 7).

Rotation is version-based: every refresh bumps ``refresh_token_version``, so the
family is invalidated by incrementing one counter. The remaining question is what
happens when an already-rotated token is replayed — that must revoke the family,
not merely fail once, or the attacker and the legitimate holder can race.
"""

import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import auth as auth_module
from app.core.security import create_refresh_token, decode_token


class _Result:
    def __init__(self, value=None):
        self._value = value

    def scalar_one_or_none(self):
        return self._value

    def first(self):
        return self._value


class _Db:
    """Records commits so the test can assert the family was revoked."""

    def __init__(self, user, membership_row=None):
        self._user = user
        self._membership_row = membership_row
        self.commits = 0

    async def execute(self, statement):
        text = str(statement)
        if "FROM users" in text:
            return _Result(self._user)
        return _Result(self._membership_row)

    async def commit(self):
        self.commits += 1


def _user(version=2):
    return SimpleNamespace(
        id=uuid.uuid4(),
        status="active",
        refresh_token_version=version,
        token_version=0,
    )


def _membership_row():
    org = SimpleNamespace(id=uuid.uuid4())
    return SimpleNamespace(Organization=org)


@pytest.mark.asyncio
async def test_rotated_token_reuse_revokes_the_family():
    """Presenting an older rtv must bump the version, killing every copy."""
    user = _user(version=2)
    stale_token = create_refresh_token(user.id, {"rtv": 1})
    assert decode_token(stale_token)["rtv"] == 1

    db = _Db(user)
    with pytest.raises(HTTPException) as exc:
        await auth_module.refresh_token({"refresh_token": stale_token}, db=db)

    assert exc.value.status_code == 401
    assert user.refresh_token_version == 3
    assert db.commits == 1


@pytest.mark.asyncio
async def test_current_token_still_refreshes():
    user = _user(version=2)
    token = create_refresh_token(user.id, {"rtv": 2})
    db = _Db(user, membership_row=_membership_row())

    result = await auth_module.refresh_token({"refresh_token": token}, db=db)

    assert user.refresh_token_version == 3
    assert "tokens" in result
    assert decode_token(result["tokens"]["refresh_token"])["rtv"] == 3


@pytest.mark.asyncio
async def test_future_rtv_is_rejected_without_revoking():
    """A token from the future is not a replay; do not punish the account."""
    user = _user(version=2)
    token = create_refresh_token(user.id, {"rtv": 9})
    db = _Db(user)

    with pytest.raises(HTTPException) as exc:
        await auth_module.refresh_token({"refresh_token": token}, db=db)

    assert exc.value.status_code == 401
    assert user.refresh_token_version == 2
    assert db.commits == 0


@pytest.mark.asyncio
async def test_missing_token_is_a_validation_error():
    db = _Db(_user())
    with pytest.raises(HTTPException) as exc:
        await auth_module.refresh_token({}, db=db)
    assert exc.value.status_code == 400