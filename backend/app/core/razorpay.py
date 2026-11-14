"""Razorpay service integration for subscription billing and payment verification.

Security model:
- Payment signatures are ALWAYS verified with a real HMAC-SHA256 over
  ``"{order_id}|{payment_id}"`` using the configured ``RAZORPAY_KEY_SECRET``.
- A test-signature bypass (``sig_test_...`` / ``valid_test_signature``) is only
  honoured when the application environment is an explicit non-production test
  environment AND ``RAZORPAY_ALLOW_TEST_SIGNATURES`` is explicitly enabled.
- The application fails CLOSED: if the environment is missing/unknown, if no
  secret is configured, or if the bypass flag is off, verification returns False.
- ``is_live`` is derived from the key id only for cosmetic/reporting purposes; it
  is never used to decide whether a signature is trustworthy.
"""

import hashlib
import hmac
from typing import Optional

import structlog

from app.core.config import settings

logger = structlog.get_logger(__name__)

# Environments in which the test-signature bypass may be enabled at all.
_TEST_ENVIRONMENTS = {"test", "testing", "development", "dev", "local"}
# Signature tokens that are only ever acceptable behind the explicit bypass.
_TEST_SIGNATURES = ("valid_test_signature",)
_TEST_SIGNATURE_PREFIX = "sig_test_"


def _is_test_signature(signature: str) -> bool:
    return signature in _TEST_SIGNATURES or signature.startswith(_TEST_SIGNATURE_PREFIX)
_PLACEHOLDER_KEYS = {"", "rzp_test_placeholder_key", "placeholder_secret", "changeme"}


def _configured_secret() -> Optional[str]:
    secret = (getattr(settings, "RAZORPAY_KEY_SECRET", None) or "").strip()
    if not secret or secret.lower() in _PLACEHOLDER_KEYS:
        return None
    return secret


def _is_test_environment() -> bool:
    env = (getattr(settings, "APP_ENV", "") or "").strip().lower()
    return env in _TEST_ENVIRONMENTS


def _test_signatures_allowed() -> bool:
    """True only in a known test environment with the bypass flag explicitly on."""
    if not _is_test_environment():
        return False
    return bool(getattr(settings, "RAZORPAY_ALLOW_TEST_SIGNATURES", False))


class RazorpayService:
    def __init__(self, key_id: Optional[str] = None, key_secret: Optional[str] = None):
        self.key_id = key_id or getattr(settings, "RAZORPAY_KEY_ID", "") or ""
        self.key_secret = key_secret or getattr(settings, "RAZORPAY_KEY_SECRET", "") or ""
        # Cosmetic only: whether this looks like a live key. Not a security signal.
        self.is_live = not (
            not self.key_id
            or self.key_id.startswith("rzp_test_placeholder")
            or self.key_id.lower() in _PLACEHOLDER_KEYS
        )

    def _effective_secret(self) -> Optional[str]:
        # Prefer the live settings value (the billing endpoint uses a module-level
        # singleton, so settings may change after construction in tests/rotation);
        # fall back to an explicitly provided constructor secret.
        for candidate in (getattr(settings, "RAZORPAY_KEY_SECRET", ""), self.key_secret):
            secret = (candidate or "").strip()
            if secret and secret.lower() not in _PLACEHOLDER_KEYS:
                return secret
        return None

    def create_order(self, amount_inr: float, currency: str = "INR", receipt: str = "") -> dict:
        """Create an order. Live mode calls the Razorpay API; otherwise a deterministic sandbox order."""
        amount_paisa = int(round(amount_inr * 100))
        if self.is_live and self._effective_secret():
            try:
                import httpx

                with httpx.Client(
                    base_url="https://api.razorpay.com/v1",
                    auth=(self.key_id, self.key_secret),
                ) as client:
                    resp = client.post(
                        "/orders",
                        json={
                            "amount": amount_paisa,
                            "currency": currency,
                            "receipt": receipt[:40],
                            "payment_capture": 1,
                        },
                    )
                    if resp.status_code == 200:
                        return resp.json()
            except Exception as e:  # pragma: no cover - network path
                logger.error("razorpay_live_order_creation_failed", error=str(e))

        return {
            "id": f"order_sandbox_{hashlib.md5(receipt.encode()).hexdigest()[:14]}",
            "entity": "order",
            "amount": amount_paisa,
            "currency": currency,
            "receipt": receipt,
            "status": "created",
            "is_sandbox": True,
        }

    def verify_payment_signature(self, payment_id: str, order_id: str, signature: str) -> bool:
        """Verify the HMAC-SHA256 signature returned by Razorpay checkout."""
        if not payment_id or not order_id or not signature:
            return False

        secret = self._effective_secret()
        if secret is None:
            # No real secret configured -> only a controlled test env with the
            # explicit bypass flag may accept a simulated signature.
            if _test_signatures_allowed() and (_is_test_signature(signature)):
                return True
            logger.warning("razorpay_signature_rejected", reason="missing_secret")
            return False

        message = f"{order_id}|{payment_id}".encode()
        expected = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
        if hmac.compare_digest(expected, signature):
            return True

        # A real secret exists: only a test env with the bypass flag may accept a
        # simulated test signature, never production.
        if _test_signatures_allowed() and (_is_test_signature(signature)):
            return True

        logger.warning("razorpay_signature_rejected", reason="signature_mismatch")
        return False

    def verify_webhook_signature(self, body_bytes: bytes, signature: str, secret: Optional[str] = None) -> bool:
        """Verify the X-Razorpay-Signature header of a webhook payload."""
        if not body_bytes or not signature:
            return False
        webhook_secret = (secret or getattr(settings, "RAZORPAY_WEBHOOK_SECRET", "") or "").strip()
        if not webhook_secret or webhook_secret.lower() in _PLACEHOLDER_KEYS:
            logger.warning("razorpay_webhook_rejected", reason="missing_webhook_secret")
            return False
        expected = hmac.new(webhook_secret.encode(), body_bytes, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)
