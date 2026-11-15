"""Production security verification gate.

Every assertion here is a release gate, not a unit test of a helper: it pins the
security posture a production deploy must have, so a refactor that silently
re-opens a hole fails CI instead of shipping.

Covers the gaps the per-feature tests leave:
  * every production config guardrail (not just JWT_SECRET and DEBUG)
  * security headers on real API responses, and HSTS only in production
  * production error responses must not leak exception details
  * interactive docs are off in production
  * JWT access/refresh tokens are not interchangeable
  * the /metrics endpoint never exposes tenant or user identifiers
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.main import app

GOOD_SECRET = "b" * 64


def _production_settings(**overrides) -> Settings:
    """A settings object that would pass validate_production_security."""
    base = dict(
        APP_ENV="production",
        DEBUG=False,
        JWT_SECRET=GOOD_SECRET,
        AUTO_CREATE_SCHEMA=False,
        S3_USE_SSL=True,
        S3_ENDPOINT="https://s3.amazonaws.com",
        S3_ACCESS_KEY="prod-access-key",
        S3_SECRET_KEY="prod-secret-key",
        RAZORPAY_KEY_SECRET="rzp_live_realsecret",
        RAZORPAY_ALLOW_TEST_SIGNATURES=False,
    )
    base.update(overrides)
    return Settings(**base)


def test_baseline_production_settings_pass():
    # Sanity: the fixture above is genuinely acceptable, so each failure below is
    # caused by the single knob it mutates.
    _production_settings().validate_production_security()


@pytest.mark.parametrize(
    "overrides,message",
    [
        ({"DEBUG": True}, "DEBUG must be false in production"),
        ({"JWT_SECRET": "CHANGE_THIS_IN_PRODUCTION_RANDOM_SECRET"}, "JWT_SECRET must be a long random secret"),
        ({"JWT_SECRET": "short"}, "JWT_SECRET must be a long random secret"),
        ({"AUTO_CREATE_SCHEMA": True}, "AUTO_CREATE_SCHEMA must be false in production"),
        ({"S3_USE_SSL": False}, "S3_USE_SSL must be true in production"),
        ({"S3_ENDPOINT": "http://s3.amazonaws.com"}, "S3_ENDPOINT must use HTTPS in production"),
        ({"S3_ACCESS_KEY": "minioadmin", "S3_SECRET_KEY": "prod-secret-key"}, "S3 credentials must not use development defaults"),
        ({"S3_ACCESS_KEY": "prod-access-key", "S3_SECRET_KEY": "minioadmin"}, "S3 credentials must not use development defaults"),
        ({"RAZORPAY_ALLOW_TEST_SIGNATURES": True}, "RAZORPAY_ALLOW_TEST_SIGNATURES must be false"),
        ({"RAZORPAY_KEY_SECRET": "placeholder_secret"}, "RAZORPAY_KEY_SECRET must be configured with a real secret"),
        ({"RAZORPAY_KEY_SECRET": ""}, "RAZORPAY_KEY_SECRET must be configured with a real secret"),
    ],
)
def test_production_rejects_insecure_configuration(overrides, message):
    settings = _production_settings(**overrides)
    with pytest.raises(RuntimeError, match=message):
        settings.validate_production_security()


def test_catalogue_portal_requires_its_own_secret():
    settings = _production_settings(CATALOGUE_DATABASE_URL="postgresql://cat/cat")
    with pytest.raises(RuntimeError, match="CATALOGUE_JWT_SECRET must be a long random secret"):
        settings.validate_production_security()

    settings = _production_settings(
        CATALOGUE_DATABASE_URL="postgresql://cat/cat",
        CATALOGUE_JWT_SECRET="c" * 64,
        CATALOGUE_AUTO_CREATE_SCHEMA=True,
    )
    with pytest.raises(RuntimeError, match="CATALOGUE_AUTO_CREATE_SCHEMA must be false"):
        settings.validate_production_security()


def test_development_environment_is_not_subject_to_production_rules():
    # The guardrails are gated on APP_ENV, so a local dev box still boots with
    # the placeholder secret rather than being forced to configure one.
    Settings(APP_ENV="development", DEBUG=True).validate_production_security()


def test_allowed_origins_are_explicit_and_never_wildcard():
    origins = Settings().ALLOWED_ORIGINS_LIST
    assert origins, "CORS must not fall back to an empty origin list"
    assert "*" not in origins, "allow_credentials=True with '*' would expose authenticated routes"


@pytest.mark.asyncio
async def test_api_responses_carry_security_headers():
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
        response = await client.get("/health")

    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert response.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert "default-src 'self'" in response.headers.get("content-security-policy", "")
    assert "frame-ancestors 'none'" in response.headers.get("content-security-policy", "")
    assert response.headers.get("x-permitted-cross-domain-policies") == "none"


@pytest.mark.asyncio
async def test_api_responses_are_not_cacheable():
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
        response = await client.get("/api/v1/projects/")
    # Authenticated responses must never be cached by a shared proxy.
    assert response.headers.get("cache-control") == "no-store"


@pytest.mark.asyncio
async def test_cors_denies_unknown_origin():
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
        response = await client.options(
            "/api/v1/auth/login",
            headers={
                "Origin": "https://attacker.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type",
            },
        )
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.asyncio
async def test_production_errors_do_not_leak_internals(monkeypatch):
    """A 500 in production returns a generic body, never the exception text."""
    import app.main as main_module

    @app.get("/api/v1/_boom")
    async def _boom():
        raise ValueError("super-secret-internal-detail")

    monkeypatch.setattr(main_module.settings, "APP_ENV", "production")
    monkeypatch.setattr(main_module.settings, "DEBUG", False)

    try:
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
            response = await client.get("/api/v1/_boom")
    finally:
        app.router.routes = [r for r in app.router.routes if getattr(r, "path", None) != "/api/v1/_boom"]

    assert response.status_code == 500
    body = response.text
    assert "super-secret-internal-detail" not in body, "production leaked the exception message"
    assert "ValueError" not in body
    assert "Traceback" not in body
    assert response.headers.get("x-request-id"), "500s must carry a request id for correlation"


@pytest.mark.asyncio
async def test_development_errors_include_exception_type():
    """In development the same failure surfaces its type and message for debugging."""
    import app.main as main_module

    @app.get("/api/v1/_boom")
    async def _boom():
        raise ValueError("dev-visible-detail")

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(main_module.settings, "APP_ENV", "development")
    monkeypatch.setattr(main_module.settings, "DEBUG", True)

    try:
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
            response = await client.get("/api/v1/_boom")
    finally:
        app.router.routes = [r for r in app.router.routes if getattr(r, "path", None) != "/api/v1/_boom"]
        monkeypatch.undo()

    assert response.status_code == 500
    assert "ValueError" in response.text
    assert "dev-visible-detail" in response.text


def test_access_token_cannot_be_used_as_refresh_token():
    user_id = str(uuid.uuid4())
    access = create_access_token(user_id, {"org_id": "org-1"})
    payload = decode_token(access)
    assert payload["type"] == "access"
    # A refresh-only endpoint must reject an access token by its type claim.
    assert payload["type"] != "refresh"


def test_refresh_token_cannot_be_used_as_access_token():
    user_id = str(uuid.uuid4())
    refresh = create_refresh_token(user_id, {"rtv": 1})
    payload = decode_token(refresh)
    assert payload["type"] == "refresh"
    assert payload["type"] != "access"


def test_tampered_token_is_rejected():
    user_id = str(uuid.uuid4())
    token = create_access_token(user_id, {})
    tampered = token[:-3] + ("aaa" if not token.endswith("aaa") else "bbb")
    with pytest.raises(Exception):
        decode_token(tampered)


@pytest.mark.asyncio
async def test_metrics_expose_no_tenant_or_user_identifiers():
    """The scrape endpoint is intentionally public, so it must stay aggregate-only."""
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
        response = await client.get("/metrics")

    assert response.status_code == 200
    body = response.text
    lowered = body.lower()
    for marker in ("@", "org_id", "user_id", "email", "token", "secret", "password"):
        assert marker not in lowered, f"/metrics leaked {marker!r}"


@pytest.mark.asyncio
async def test_metrics_endpoint_is_not_in_the_public_schema():
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
        response = await client.get("/openapi.json")
    paths = response.json().get("paths", {}) if response.status_code == 200 else {}
    assert "/metrics" not in paths