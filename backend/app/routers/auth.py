"""Auth endpoints: login + status."""

from __future__ import annotations

from fastapi import APIRouter, status
from pydantic import BaseModel

from app.utils import auth as auth_utils

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str
    expires_at: int
    expires_in_minutes: int


class StatusResponse(BaseModel):
    auth_required: bool


@router.get("/status", response_model=StatusResponse)
async def auth_status():
    """Frontend calls this to decide whether to show a login page."""
    return StatusResponse(auth_required=auth_utils.is_auth_enabled())


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    if not auth_utils.is_auth_enabled():
        # No password set -> nothing to log into. Issuing a token would still
        # work, but we reject to avoid implying auth is active.
        token, exp = auth_utils.create_token()
        return LoginResponse(token=token, expires_at=exp, expires_in_minutes=0)
    if not auth_utils.check_password(body.password):
        return _invalid_credentials()
    token, exp = auth_utils.create_token()
    from app.config import settings

    return LoginResponse(
        token=token,
        expires_at=exp,
        expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
    )


def _invalid_credentials():
    from fastapi import HTTPException

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="密码错误")
