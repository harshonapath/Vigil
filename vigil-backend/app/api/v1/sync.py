"""
Phase 3 — Dedicated synchronization API endpoints.

These routes allow callers to trigger GitHub-to-DB synchronization
for repositories, pull requests and commits on demand.
"""

import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.auth import ReviewerContext, get_current_reviewer
from app.db.session import get_db
from app.schemas.commit import CommitListResponse, CommitRead
from app.schemas.pull_request import PullRequestListResponse, PullRequestRead
from app.schemas.repository import RepositoryListResponse, RepositoryRead
from app.services.github_sync_service import github_sync_service

router = APIRouter(tags=["Sync"])


# ---- Response schemas specific to sync endpoints ----

class SyncSummaryResponse(BaseModel):
    """Summary returned after a full repository sync."""
    model_config = ConfigDict(from_attributes=True)

    repository: str
    repository_id: str
    pull_requests_synced: int
    commits_synced: int


class RepositorySyncResponse(BaseModel):
    """Response from syncing installation repositories."""
    model_config = ConfigDict(from_attributes=True)

    synced_count: int
    repositories: List[RepositoryRead]


class PullRequestSyncResponse(BaseModel):
    """Response from syncing a repository's pull requests."""
    model_config = ConfigDict(from_attributes=True)

    synced_count: int
    pull_requests: List[PullRequestRead]


class CommitSyncResponse(BaseModel):
    """Response from syncing a pull request's commits."""
    model_config = ConfigDict(from_attributes=True)

    synced_count: int
    commits: List[CommitRead]


# ---- Endpoints ----


@router.post(
    "/sync/installations/{installation_id}/repositories",
    response_model=RepositorySyncResponse,
    status_code=status.HTTP_200_OK,
    summary="Sync installation repositories",
    description=(
        "Fetch all repositories accessible to a GitHub App installation "
        "and upsert them into the Vigil database."
    ),
)
async def sync_installation_repositories(
    installation_id: int,
    db: Session = Depends(get_db),
    reviewer: ReviewerContext = Depends(get_current_reviewer),
) -> RepositorySyncResponse:
    synced = await github_sync_service.sync_installation_repositories(
        installation_id=installation_id, db=db
    )
    return RepositorySyncResponse(
        synced_count=len(synced),
        repositories=[RepositoryRead.model_validate(r) for r in synced],
    )


@router.post(
    "/sync/repositories/{repository_id}/pull-requests",
    response_model=PullRequestSyncResponse,
    status_code=status.HTTP_200_OK,
    summary="Sync repository pull requests",
    description=(
        "Fetch pull requests for a repository from GitHub and upsert "
        "them into the Vigil database."
    ),
)
async def sync_repository_pull_requests(
    repository_id: uuid.UUID,
    installation_id: int = Query(..., description="GitHub App Installation ID"),
    state: str = Query("all", description="PR state filter: open, closed, all"),
    db: Session = Depends(get_db),
    reviewer: ReviewerContext = Depends(get_current_reviewer),
) -> PullRequestSyncResponse:
    synced = await github_sync_service.sync_repository_pull_requests(
        installation_id=installation_id,
        repository_id=repository_id,
        db=db,
        state=state,
    )
    return PullRequestSyncResponse(
        synced_count=len(synced),
        pull_requests=[PullRequestRead.model_validate(pr) for pr in synced],
    )


@router.post(
    "/sync/pull-requests/{pull_request_id}/commits",
    response_model=CommitSyncResponse,
    status_code=status.HTTP_200_OK,
    summary="Sync pull request commits",
    description=(
        "Fetch commits for a pull request from GitHub and upsert "
        "them into the Vigil database, including N:M associations."
    ),
)
async def sync_pull_request_commits(
    pull_request_id: uuid.UUID,
    installation_id: int = Query(..., description="GitHub App Installation ID"),
    db: Session = Depends(get_db),
    reviewer: ReviewerContext = Depends(get_current_reviewer),
) -> CommitSyncResponse:
    synced = await github_sync_service.sync_pull_request_commits(
        installation_id=installation_id,
        pull_request_id=pull_request_id,
        db=db,
    )
    return CommitSyncResponse(
        synced_count=len(synced),
        commits=[CommitRead.model_validate(c) for c in synced],
    )


@router.post(
    "/sync/repositories/{repository_id}/full",
    response_model=SyncSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Full repository sync",
    description=(
        "Perform a complete synchronization of a repository: "
        "pull requests and their commits."
    ),
)
async def sync_repository_full(
    repository_id: uuid.UUID,
    installation_id: int = Query(..., description="GitHub App Installation ID"),
    pr_state: str = Query("all", description="PR state filter: open, closed, all"),
    db: Session = Depends(get_db),
    reviewer: ReviewerContext = Depends(get_current_reviewer),
) -> SyncSummaryResponse:
    result = await github_sync_service.sync_repository_full(
        installation_id=installation_id,
        repository_id=repository_id,
        db=db,
        pr_state=pr_state,
    )
    return SyncSummaryResponse(**result)

