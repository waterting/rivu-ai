"""Security regression tests for Razorpay signature verification.

These tests assert that payment signatures are verified with real HMAC-SHA256 and
that the test-signature bypass is only honoured in a controlled test environment
with an explicit opt-in flag. Production and unknown environments must fail closed.
"""

import hashlib
import hmac

import pytest

from app.core import razorpay as rz
from app.core.config import settings


def _sig(secret: str, order_id: str, payment_id: str) -> str:
    return hmac.new(secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


def _svc(monkeypatch, *, env, secret, allow_test):
    monkeypatch.setattr(settings, "APP_ENV", env, raising=False)
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "rzp_live_abc123", raising=False)
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", secret, raising=False)
    monkeypatch.setattr(settings, "RAZORPAY_ALLOW_TEST_SIGNATURES", allow_test, raising=False)
    return rz.RazorpayService()


def test_valid_real_signature_accepted(monkeypatch):
    svc = _svc(monkeypatch, env="production", secret="real_secret", allow_test=False)
    good = _sig("real_secret", "order_1", "pay_1")
    assert svc.verify_payment_signature("pay_1", "order_1", good) is True


def test_production_rejects_test_signature_bypass(monkeypatch):
    svc = _svc(monkeypatch, env="production", secret="real_secret", allow_test=False)
    # Even the historically accepted sentinel must be rejected in production.
    assert svc.verify_payment_signature("pay_x", "order_x", "valid_test_signature") is False
    assert svc.verify_payment_signature("pay_x", "order_x", "sig_test_anything") is False


def test_production_rejects_test_signature_even_if_flag_forced_on(monkeypatch):
    # A misconfigured production deploy that somehow has the flag on must still
    # reject test signatures because the environment is not a test environment.
    svc = _svc(monkeypatch, env="production", secret="real_secret", allow_test=True)
    assert svc.verify_payment_signature("pay_x", "order_x", "valid_test_signature") is False


def test_missing_env_fails_closed(monkeypatch):
    svc = _svc(monkeypatch, env="", secret="real_secret", allow_test=True)
    assert svc.verify_payment_signature("pay_x", "order_x", "valid_test_signature") is False


def test_unknown_env_fails_closed(monkeypatch):
    svc = _svc(monkeypatch, env="staging", secret="real_secret", allow_test=True)
    assert svc.verify_payment_signature("pay_x", "order_x", "valid_test_signature") is False


def test_missing_secret_rejects_even_in_test_env(monkeypatch):
    svc = _svc(monkeypatch, env="test", secret="", allow_test=True)
    # Without a real secret configured, only the explicit bypass is allowed.
    assert svc.verify_payment_signature("pay_x", "order_x", "valid_test_signature") is True
    # But a garbage signature must still be rejected.
    assert svc.verify_payment_signature("pay_x", "order_x", "garbage") is False


def test_test_env_bypass_requires_flag(monkeypatch):
    svc = _svc(monkeypatch, env="test", secret="real_secret", allow_test=False)
    assert svc.verify_payment_signature("pay_x", "order_x", "valid_test_signature") is False


def test_test_env_bypass_when_enabled(monkeypatch):
    svc = _svc(monkeypatch, env="test", secret="real_secret", allow_test=True)
    assert svc.verify_payment_signature("pay_x", "order_x", "valid_test_signature") is True
    assert svc.verify_payment_signature("pay_x", "order_x", "sig_test_xyz") is True


def test_empty_inputs_rejected(monkeypatch):
    svc = _svc(monkeypatch, env="production", secret="real_secret", allow_test=False)
    good = _sig("real_secret", "order_1", "pay_1")
    assert svc.verify_payment_signature("", "order_1", good) is False
    assert svc.verify_payment_signature("pay_1", "", good) is False
    assert svc.verify_payment_signature("pay_1", "order_1", "") is False


def test_webhook_requires_configured_secret(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "production", raising=False)
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", "", raising=False)
    svc = rz.RazorpayService()
    body = b'{"event":"payment.captured"}'
    assert svc.verify_webhook_signature(body, "anything") is False


def test_webhook_valid_and_invalid(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "production", raising=False)
    monkeypatch.setattr(settings, "RAZORPAY_WEBHOOK_SECRET", "whsec_real", raising=False)
    svc = rz.RazorpayService()
    body = b'{"event":"payment.captured"}'
    good = hmac.new(b"whsec_real", body, hashlib.sha256).hexdigest()
    assert svc.verify_webhook_signature(body, good) is True
    assert svc.verify_webhook_signature(body, "deadbeef") is False
    assert svc.verify_webhook_signature(body, "") is False