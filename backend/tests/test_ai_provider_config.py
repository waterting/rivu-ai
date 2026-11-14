"""Provider configuration must fail clearly for adapters not implemented yet."""
import pytest
from pydantic import ValidationError

from app.core.config import Settings


@pytest.mark.parametrize("provider", ["openai", "gemini", "unknown", ""])
def test_unsupported_provider_is_rejected_at_settings_initialization(provider):
    with pytest.raises(ValidationError, match="Rivu currently supports only 'groq'"):
        Settings(DEFAULT_AI_PROVIDER=provider)


def test_groq_is_the_supported_provider():
    assert Settings(DEFAULT_AI_PROVIDER="Groq").DEFAULT_AI_PROVIDER == "groq"


def test_current_frontend_origin_is_allowed_even_when_render_has_stale_origins():
    settings = Settings(ALLOWED_ORIGINS="https://rivu-ai-murex.vercel.app")
    assert "https://rivu-ai-woad.vercel.app" in settings.ALLOWED_ORIGINS_LIST


def _prod_settings(**overrides):
    base = dict(
        APP_ENV="production",
        DEBUG=False,
        JWT_SECRET="x" * 48,
        AUTO_CREATE_SCHEMA=False,
        S3_USE_SSL=True,
        S3_ENDPOINT="https://s3.example.com",
        S3_ACCESS_KEY="real-access",
        S3_SECRET_KEY="real-secret",
        # Explicitly disable the catalogue portal so this test is independent of
        # any CATALOGUE_DATABASE_URL present in the ambient environment.
        CATALOGUE_DATABASE_URL=None,
    )
    base.update(overrides)
    return Settings(**base)


def test_production_rejects_test_signature_bypass_flag():
    settings = _prod_settings(
        RAZORPAY_ALLOW_TEST_SIGNATURES=True,
        RAZORPAY_KEY_SECRET="real_secret",
    )
    with pytest.raises(RuntimeError, match="RAZORPAY_ALLOW_TEST_SIGNATURES"):
        settings.validate_production_security()


def test_production_requires_real_razorpay_secret():
    settings = _prod_settings(RAZORPAY_ALLOW_TEST_SIGNATURES=False, RAZORPAY_KEY_SECRET="placeholder_secret")
    with pytest.raises(RuntimeError, match="RAZORPAY_KEY_SECRET"):
        settings.validate_production_security()


def test_production_accepts_valid_razorpay_config():
    settings = _prod_settings(
        RAZORPAY_ALLOW_TEST_SIGNATURES=False,
        RAZORPAY_KEY_SECRET="a-real-razorpay-secret",
    )
    settings.validate_production_security()
