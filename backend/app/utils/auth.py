"""Optional password auth: stdlib HMAC token (no external deps).

Token format: ``base64url(payload_json).base64url(hmac_sha256(sig))``
where payload includes an expiry timestamp. Valid for
``ACCESS_TOKEN_EXPIRE_MINUTES``. Auth is only active when ``ADMIN_PASSWORD``
is set; otherwise all requests pass through anonymously.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time

from app.config import settings

logger = logging.getLogger(__name__)

# Allowed skew when checking expiry.
_CLOCK_SKEW_SECONDS = 30


def is_auth_enabled() -> bool:
    """True when ADMIN_PASSWORD is set, meaning endpoints require a token."""
    return bool(settings.ADMIN_PASSWORD)


def _sign(payload_b64: str) -> str:
    key = settings.SECRET_KEY.encode()
    return base64.urlsafe_b64encode(
        hmac.new(key, payload_b64.encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")


def _payload_b64(payload: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")


def create_token() -> tuple[str, int]:
    """Issue a token. Returns (token, expires_at_unix)."""
    exp = int(time.time()) + settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    payload = {"exp": exp}
    p_b64 = _payload_b64(payload)
    sig = _sign(p_b64)
    return f"{p_b64}.{sig}", exp


def verify_token(token: str | None) -> bool:
    """Verify a token's signature and expiry. Constant-time HMAC compare."""
    if not token:
        return False
    parts = token.split(".")
    if len(parts) != 2:
        return False
    p_b64, sig = parts
    expected = _sign(p_b64)
    if not hmac.compare_digest(expected, sig):
        return False
    try:
        # Re-pad base64 before decoding.
        padded = p_b64 + "=" * (-len(p_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
    except Exception:
        return False
    exp = payload.get("exp")
    if not isinstance(exp, int):
        return False
    return exp + _CLOCK_SKEW_SECONDS >= int(time.time())


def check_password(password: str) -> bool:
    """Constant-time compare against ADMIN_PASSWORD."""
    if not settings.ADMIN_PASSWORD:
        return False
    return hmac.compare_digest(password, settings.ADMIN_PASSWORD)
