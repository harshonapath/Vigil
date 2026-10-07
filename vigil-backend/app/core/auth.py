"""
Phase 6 — Reviewer authentication dependency.

The existing auth system is a placeholder (GET /api/v1/me returns a stub).
This module provides a practical FastAPI dependency that:

1. Requires a reviewer identity via the X-Reviewer-Login header.
2. Returns a ReviewerContext that encapsulates identity information.
3. Raises UnauthorizedException when no identity is provided.

When a proper OAuth / Microsoft Entra ID layer is implemented in a future
phase this module is the ONLY file that needs to change — all routes and
services that depend on `get_current_reviewer` will automatically receive
the real identity.

Security notes:
- In production this header MUST be set by the API gateway after verifying
  the upstream JWT, not by the client directly.
- For the development / test environment the header is accepted as-is.
- The header name is X-Reviewer-Login (GitHub login style identifiers).
"""
from fastapi import Header, Request
from typing import Optional
import hashlib
import hmac
import time

from app.core.exceptions import UnauthorizedException
from app.core.config import settings


class ReviewerContext:
    """
    Represents the authenticated reviewer making a verification decision.

    Attributes:
        login: The reviewer's login identifier (e.g. GitHub login).
        user_id: Optional internal Vigil user UUID string.
    """

    def __init__(self, login: str, user_id: Optional[str] = None):
        self.login = login
        self.user_id = user_id

    def __repr__(self) -> str:  # pragma: no cover
        return f"ReviewerContext(login={self.login!r}, user_id={self.user_id!r})"


async def get_current_reviewer(
    x_reviewer_login: Optional[str] = Header(None, alias="X-Reviewer-Login"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
) -> ReviewerContext:
    """
    FastAPI dependency — resolves the authenticated reviewer or user.

    Reads X-Reviewer-Login header or Authorization (Bearer token) header.

    Raises:
        UnauthorizedException: if no identity is present.
    """
    if x_reviewer_login and x_reviewer_login.strip():
        return ReviewerContext(login=x_reviewer_login.strip())

    if authorization and authorization.strip():
        token_val = authorization.strip()
        login = "entra-user" if token_val.startswith("Bearer ") else token_val
        return ReviewerContext(login=login)

    raise UnauthorizedException(
        "Authentication required. Provide the X-Reviewer-Login header or Authorization token."
    )


async def get_verified_reviewer(
    x_reviewer_login: Optional[str] = Header(None, alias="X-Reviewer-Login"),
    x_reviewer_signature: Optional[str] = Header(None, alias="X-Reviewer-Signature"),
    x_reviewer_timestamp: Optional[str] = Header(None, alias="X-Reviewer-Timestamp"),
) -> ReviewerContext:
    """Accept only reviewer identities signed by the trusted API gateway."""
    secret = settings.REVIEWER_IDENTITY_HMAC_SECRET
    login = (x_reviewer_login or "").strip()
    signature = (x_reviewer_signature or "").strip().lower()
    timestamp = (x_reviewer_timestamp or "").strip()
    if len(secret.encode("utf-8")) < 32 or not login or not signature or not timestamp:
        raise UnauthorizedException("A gateway-verified reviewer identity is required")
    if not timestamp.isdecimal() or abs(int(time.time()) - int(timestamp)) > 300:
        raise UnauthorizedException("Reviewer identity signature has expired")
    canonical_login = login.casefold()
    signed_content = f"{canonical_login}:{timestamp}".encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise UnauthorizedException("Reviewer identity signature is invalid")
    return ReviewerContext(login=login)

