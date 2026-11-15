"""Application configuration using pydantic-settings."""

from functools import lru_cache
from typing import Optional

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    APP_NAME: str = "Rivu"
    APP_VERSION: str = "0.2.0"
    APP_ENV: str = "development"
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"
    ALLOWED_ORIGINS: str = (
        "http://localhost:3000,"
        "https://rivu-ai-woad.vercel.app,"
        "https://rivu-ai-murex.vercel.app,"
        "https://rivu.ai"
    )

    DATABASE_URL: str = "postgresql+asyncpg://rivu:rivu_dev_password@localhost:5432/rivu"
    DATABASE_URL_SYNC: str = "postgresql://rivu:rivu_dev_password@localhost:5432/rivu"
    # The Catalogue Portal is a separate application data boundary with its own database and JWT key.
    CATALOGUE_DATABASE_URL: Optional[str] = None
    CATALOGUE_JWT_SECRET: Optional[str] = None
    CATALOGUE_AUTO_CREATE_SCHEMA: bool = False
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30

    JWT_SECRET: str = "CHANGE_THIS_IN_PRODUCTION_RANDOM_SECRET"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    GOOGLE_CLIENT_ID: Optional[str] = "545630055112-k1k5c5dvhhegts3ffpqmb15oi3f17hlr.apps.googleusercontent.com"
    REQUIRE_EMAIL_VERIFICATION: bool = False
    FRONTEND_URL: str = "http://localhost:3000"
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: Optional[str] = None
    SMTP_USE_TLS: bool = True

    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    OPENAI_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    DEFAULT_AI_PROVIDER: str = Field(default="groq", validate_default=True)

    # Hard ceiling on a single AI request inside a synchronous report path. A
    # slow or hung provider must degrade to the measured fallback, not block the
    # worker (audit finding 11).
    AI_REQUEST_TIMEOUT_SECONDS: float = 20.0

    S3_ENDPOINT: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_BUCKET: str = "rivu-datasets"
    S3_REGION: str = "us-east-1"
    S3_USE_SSL: bool = False
    S3_FORCE_PATH_STYLE: bool = True
    AUTO_CREATE_SCHEMA: bool = True

    # Payments (Razorpay). Keys are server-side only; never expose to the frontend.
    RAZORPAY_KEY_ID: Optional[str] = None
    RAZORPAY_KEY_SECRET: Optional[str] = None
    RAZORPAY_WEBHOOK_SECRET: Optional[str] = None
    # Test-mode signature bypass. MUST stay False everywhere except a controlled
    # test environment. Production validation rejects this being enabled.
    RAZORPAY_ALLOW_TEST_SIGNATURES: bool = False

    # Verified business billing identity used on GST invoices. Never invent a GSTIN:
    # leave these empty until the real, verified company details are configured for
    # the deployment. Invoices will carry an empty provider GSTIN until set.
    BUSINESS_LEGAL_NAME: str = ""
    BUSINESS_GSTIN: str = ""

    # Optional raster logo (PNG/JPG) embedded in generated PDF reports. When
    # empty or unreadable the PDF falls back to the built-in vector wordmark, so
    # a report always carries the brand mark (audit finding 10).
    BRAND_LOGO_PATH: str = ""

    MAX_UPLOAD_SIZE_MB: int = 500
    MAX_PROFILE_SAMPLE_ROWS: int = 100_000
    MAX_AI_SAMPLE_ROWS: int = 1_000
    JOB_WORKER_CONCURRENCY: int = 4

    # Bound peak memory during ingestion (audit finding: peak memory must be
    # measured and bounded). Parsing holds the encoded bytes plus at least one
    # decoded copy, so an in-memory decoded budget caps the worst case instead
    # of letting a pathological file exhaust the process.
    MAX_DECODED_SIZE_MB: int = 1024

    # Record the peak allocation of each parse on the job result. tracemalloc
    # adds measurable overhead to the parse window; turn it off on
    # latency-critical deployments that already cap memory another way.
    MEASURE_PARSE_MEMORY: bool = True

    # Lifetime of a presigned download URL. A URL is a bearer token, so this is
    # the window in which a leaked link stays usable (audit: lifecycle
    # validation for presigned downloads).
    DOWNLOAD_URL_TTL_SECONDS: int = 900

    # Process uploaded datasets in the API process (FastAPI BackgroundTasks) when
    # no separate database-backed worker is running.
    #
    # Unset means: enabled outside production (so local dev and CI still produce
    # a profile/quality report without deploying a worker) and disabled in
    # production, where heavy processing must run on the durable
    # `app.workers.runner` worker instead of an in-process task that dies with
    # the request worker (audit critical finding 2). Set explicitly to override.
    INLINE_PROCESSING: bool | None = None

    @model_validator(mode="after")
    def default_inline_processing_by_env(self):
        if self.INLINE_PROCESSING is None:
            object.__setattr__(self, "INLINE_PROCESSING", self.APP_ENV.lower() != "production")
        return self

    @property
    def inline_processing_enabled(self) -> bool:
        return bool(self.INLINE_PROCESSING)

    @field_validator("DEFAULT_AI_PROVIDER", mode="before")
    @classmethod
    def require_supported_ai_provider(cls, value):
        if not isinstance(value, str):
            raise ValueError("DEFAULT_AI_PROVIDER must be a string")
        provider = value.strip().lower()
        if provider != "groq":
            if provider in {"openai", "gemini"}:
                raise ValueError(
                    f"AI provider '{provider}' is not supported; only 'groq' is supported. "
                    "Rivu currently supports only 'groq'; OpenAI and Gemini adapters are not implemented."
                )
            raise ValueError(
                f"Unsupported AI provider '{provider}'; only 'groq' is supported. "
                "Rivu currently supports only 'groq'; OpenAI and Gemini adapters are not implemented."
            )
        return provider

    @field_validator("GROQ_MODEL", mode="before")
    @classmethod
    def normalize_groq_model(cls, value):
        # Groq deprecated llama-3.3-70b-versatile for free/developer usage in Aug 2026.
        # Keep older Render env values from breaking AI refinement after deployment.
        if value == "llama-3.3-70b-versatile":
            return "openai/gpt-oss-120b"
        return value

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def normalize_origins(cls, value):
        if isinstance(value, str):
            return value
        return ",".join(value)

    @property
    def ALLOWED_ORIGINS_LIST(self) -> list[str]:
        origins = [item.strip() for item in self.ALLOWED_ORIGINS.split(",") if item.strip()]
        # Keep the current first-party Vercel origin reachable when a Render
        # environment still has the previous deployment origin configured.
        current_frontend = "https://rivu-ai-woad.vercel.app"
        if current_frontend not in origins:
            origins.append(current_frontend)
        return origins

    @property
    def MAX_UPLOAD_SIZE_BYTES(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    def validate_production_security(self) -> None:
        if self.APP_ENV.lower() == "production":
            if self.DEBUG:
                raise RuntimeError("DEBUG must be false in production")
            if self.JWT_SECRET.startswith("CHANGE_THIS") or len(self.JWT_SECRET) < 32:
                raise RuntimeError("JWT_SECRET must be a long random secret in production")
            if self.AUTO_CREATE_SCHEMA:
                raise RuntimeError("AUTO_CREATE_SCHEMA must be false in production; use Alembic migrations")
            if not self.S3_USE_SSL:
                raise RuntimeError("S3_USE_SSL must be true in production")
            if not self.S3_ENDPOINT.lower().startswith("https://"):
                raise RuntimeError("S3_ENDPOINT must use HTTPS in production")
            if self.S3_ACCESS_KEY in {"", "minioadmin"} or self.S3_SECRET_KEY in {"", "minioadmin"}:
                raise RuntimeError("Production S3 credentials must not use development defaults")
            if self.CATALOGUE_DATABASE_URL:
                if not self.CATALOGUE_JWT_SECRET or len(self.CATALOGUE_JWT_SECRET) < 32:
                    raise RuntimeError("CATALOGUE_JWT_SECRET must be a long random secret when the Catalogue Portal is enabled")
                if self.CATALOGUE_AUTO_CREATE_SCHEMA:
                    raise RuntimeError("CATALOGUE_AUTO_CREATE_SCHEMA must be false in production; run its schema setup script")
            if self.RAZORPAY_ALLOW_TEST_SIGNATURES:
                raise RuntimeError(
                    "RAZORPAY_ALLOW_TEST_SIGNATURES must be false in production; "
                    "test payment signatures must never be accepted in a live environment"
                )
            if not (self.RAZORPAY_KEY_SECRET or "").strip() or (self.RAZORPAY_KEY_SECRET or "").strip().lower() in {
                "placeholder_secret", "changeme", "rzp_test_placeholder_key",
            }:
                raise RuntimeError("RAZORPAY_KEY_SECRET must be configured with a real secret in production")


@lru_cache()
def get_settings() -> Settings:
    settings = Settings()
    settings.validate_production_security()
    return settings


settings = get_settings()
