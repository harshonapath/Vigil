"""
GitHub App connection status endpoint.

Allows the frontend to discover the configured GitHub App installation
without hardcoding IDs into the client code.
"""

from typing import Any, Dict

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(tags=["GitHub"])


@router.get(
    "/github/status",
    summary="GitHub App connection status",
    description="Return the configured GitHub App installation ID and connection state.",
)
async def github_status() -> Dict[str, Any]:
    installation_id = settings.GITHUB_INSTALLATION_ID
    app_id = settings.GITHUB_APP_ID

    connected = bool(installation_id and int(installation_id) > 0 and app_id)

    return {
        "connected": connected,
        "installation_id": installation_id if connected else None,
        "app_id": app_id if connected else None,
    }
