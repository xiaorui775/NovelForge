"""Optional auth middleware.

When ADMIN_PASSWORD is set, every request to ``/api/*`` (except the health
and auth endpoints) must carry a valid ``Authorization: Bearer <token>`` or
``X-Auth-Token`` header. When ADMIN_PASSWORD is unset, this is a no-op so
unauthenticated local deployments keep working.

Implemented as middleware (not router dependencies) so it covers SSE streaming
endpoints uniformly.
"""

from __future__ import annotations

import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.utils import auth as auth_utils

logger = logging.getLogger(__name__)

# Paths exempt from auth (matched as startswith).
PUBLIC_PATH_PREFIXES = ("/api/health", "/api/auth/")


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not auth_utils.is_auth_enabled():
            return await call_next(request)

        path = request.url.path
        if any(path.startswith(prefix) for prefix in PUBLIC_PATH_PREFIXES):
            return await call_next(request)

        token = _extract_token(request)
        if not auth_utils.verify_token(token):
            return JSONResponse(status_code=401, content={"detail": "未认证或登录已过期"})

        return await call_next(request)


def _extract_token(request: Request) -> str | None:
    header = request.headers.get("authorization") or request.headers.get("Authorization")
    if header and header.lower().startswith("bearer "):
        return header[7:].strip()
    # Allow an explicit header for clients that cannot set Authorization easily.
    explicit = request.headers.get("x-auth-token")
    if explicit:
        return explicit.strip()
    return None
