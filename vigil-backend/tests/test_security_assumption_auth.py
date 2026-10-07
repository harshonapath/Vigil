import hashlib
import hmac
import time

import pytest

from app.core import auth
from app.core.config import settings
from app.core.exceptions import UnauthorizedException


@pytest.mark.asyncio
async def test_verified_reviewer_requires_valid_gateway_signature(monkeypatch):
    secret = "gateway-test-secret-" + "x" * 32
    monkeypatch.setattr(settings, "REVIEWER_IDENTITY_HMAC_SECRET", secret)
    login = "RepositoryOwner"
    timestamp = str(int(time.time()))
    signed_content = f"{login.casefold()}:{timestamp}".encode()
    signature = hmac.new(secret.encode(), signed_content, hashlib.sha256).hexdigest()

    reviewer = await auth.get_verified_reviewer(login, signature, timestamp)
    assert reviewer.login == login

    with pytest.raises(UnauthorizedException):
        await auth.get_verified_reviewer(login, "0" * 64, timestamp)


@pytest.mark.asyncio
async def test_verified_reviewer_fails_closed_when_gateway_secret_is_missing(monkeypatch):
    monkeypatch.setattr(settings, "REVIEWER_IDENTITY_HMAC_SECRET", "")
    with pytest.raises(UnauthorizedException):
        await auth.get_verified_reviewer("owner", "a" * 64, str(int(time.time())))
