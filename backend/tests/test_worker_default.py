"""Production must not process heavy work in-process (audit critical finding 2).

A FastAPI BackgroundTask dies with the request worker and has no retry,
idempotency or backpressure, so production uploads have to run on the durable
`app.workers.runner` worker. The in-process path stays available outside
production for local dev and CI.
"""

import importlib
import os

import pytest


def _settings(**overrides):
    from app.core.config import Settings

    return Settings(JWT_SECRET="x" * 32, **overrides)


def test_inline_processing_is_off_in_production():
    assert _settings(APP_ENV="production").inline_processing_enabled is False


def test_inline_processing_is_on_outside_production():
    assert _settings(APP_ENV="development").inline_processing_enabled is True
    assert _settings(APP_ENV="test").inline_processing_enabled is True
    assert _settings(APP_ENV="staging").inline_processing_enabled is True


def test_explicit_override_wins_over_the_env_default():
    assert _settings(APP_ENV="production", INLINE_PROCESSING=True).inline_processing_enabled is True
    assert _settings(APP_ENV="development", INLINE_PROCESSING=False).inline_processing_enabled is False


def test_env_name_is_matched_case_insensitively():
    assert _settings(APP_ENV="Production").inline_processing_enabled is False


def test_worker_module_provides_a_durable_entrypoint():
    """The queue must exist for the production default to be safe."""
    from app.workers import runner

    assert hasattr(runner, "run_worker")
    source = runner.__doc__ or ""
    assert "background worker" in source.lower()


@pytest.mark.parametrize(
    "monkeypatch_value,expected",
    [("production", False), ("development", True)],
)
def test_settings_reads_the_live_environment(monkeypatch, monkeypatch_value, expected):
    """A deploy that sets APP_ENV in the process env must be honoured."""
    from app.core.config import Settings

    monkeypatch.setenv("APP_ENV", monkeypatch_value)
    monkeypatch.delenv("INLINE_PROCESSING", raising=False)
    # Build from env only (no explicit kwargs) to prove the env var drives it.
    instance = Settings(JWT_SECRET="x" * 32, _env_file=None)
    assert instance.inline_processing_enabled is expected