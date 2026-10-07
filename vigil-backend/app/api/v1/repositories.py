import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.integrations.github.client import github_client
from app.schemas.repository import RepositoryListResponse, RepositoryRead
from app.services.repository_service import repository_service

router = APIRouter(tags=["Repositories"])


@router.get(
    "/me/repositories",
    response_model=RepositoryListResponse,
    summary="List authenticated user/installation repositories",
    description="Fetch live repositories accessible to GitHub App installation, sync to DB, and return list.",
)
async def list_me_repositories(
    installation_id: Optional[int] = Query(None, description="GitHub App Installation ID"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
) -> RepositoryListResponse:
    # Auto-use configured installation ID if none provided
    effective_installation_id = installation_id
    if effective_installation_id is None and settings.GITHUB_INSTALLATION_ID:
        effective_installation_id = settings.GITHUB_INSTALLATION_ID

    if effective_installation_id is not None and effective_installation_id > 0:
        try:
            repos_data = await github_client.get_all_installation_repositories(effective_installation_id)
            repository_service.sync_installation_repositories(db=db, repos_data=repos_data)
        except Exception:
            # Fall back to existing database cache if GitHub API is unreachable
            pass

    return repository_service.get_repositories(db=db, page=page, page_size=page_size)


@router.get(
    "/repositories",
    response_model=RepositoryListResponse,
    summary="List repositories",
    description="Return repositories stored in the Vigil database.",
)
def list_repositories(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
) -> RepositoryListResponse:
    return repository_service.get_repositories(db=db, page=page, page_size=page_size)


@router.get(
    "/repositories/{repository_id}",
    response_model=RepositoryRead,
    summary="Get repository",
    description="Return details of one repository by its internal UUID.",
)
def get_repository(
    repository_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> RepositoryRead:
    return repository_service.get_repository_by_id(db=db, repository_id=repository_id)
