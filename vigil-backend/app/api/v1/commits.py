import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.integrations.github.client import github_client
from app.models.pull_request import PullRequest
from app.schemas.commit import CommitListResponse, CommitRead
from app.schemas.commit_analysis import CommitAnalysisRead
from app.services.commit_service import commit_service
from app.services.repository_service import repository_service

router = APIRouter(tags=["Commits"])


@router.get(
    "/pull-requests/{pull_request_id}/commits",
    response_model=CommitListResponse,
    summary="List commits for a pull request",
    description="Return commits belonging to a pull request, syncing from GitHub if installation_id is provided.",
)
async def list_commits_for_pull_request(
    pull_request_id: uuid.UUID,
    installation_id: Optional[int] = Query(None, description="GitHub App Installation ID"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
) -> CommitListResponse:
    if installation_id is not None:
        pr = db.scalar(select(PullRequest).where(PullRequest.id == pull_request_id))
        if pr and pr.repository:
            try:
                commits_data = await github_client.get_pull_request_commits(
                    installation_id=installation_id,
                    owner=pr.repository.owner_login,
                    repo=pr.repository.name,
                    pr_number=pr.pr_number,
                )
                commit_service.sync_pull_request_commits(
                    db=db, repository=pr.repository, pull_request=pr, commits_data=commits_data
                )
            except Exception:
                pass

    return commit_service.get_commits_for_pull_request(
        db=db, pull_request_id=pull_request_id, page=page, page_size=page_size
    )


@router.get(
    "/commits/{sha}",
    response_model=CommitRead,
    summary="Get commit details",
    description="Return commit details by commit SHA, syncing from GitHub if installation_id, owner, and repo are provided.",
)
async def get_commit(
    sha: str,
    installation_id: Optional[int] = Query(None, description="GitHub App Installation ID"),
    owner: Optional[str] = Query(None, description="GitHub Owner Login"),
    repo: Optional[str] = Query(None, description="GitHub Repository Name"),
    db: Session = Depends(get_db),
) -> CommitRead:
    if installation_id is not None and owner and repo:
        try:
            commit_data = await github_client.get_commit(
                installation_id=installation_id,
                owner=owner,
                repo=repo,
                sha=sha,
            )
            # Fetch or sync repository record first
            repo_obj = repository_service.sync_repository_payload(
                db=db, repo_data={"name": repo, "owner": {"login": owner}, "id": commit_data.get("repository", {}).get("id", 0)}
            )
            commit_service.sync_commit_payload(db=db, repository=repo_obj, commit_data=commit_data)
        except Exception:
            pass

    return commit_service.get_commit_by_sha(db=db, sha=sha)


@router.post(
    "/commits/{sha}/analyze",
    response_model=CommitAnalysisRead,
    summary="Trigger commit completeness analysis",
    description="Queue commit completeness analysis for a commit SHA.",
)
def trigger_commit_analysis(
    sha: str,
    db: Session = Depends(get_db),
) -> CommitAnalysisRead:
    return commit_service.trigger_commit_analysis(db=db, sha=sha)


@router.get(
    "/commits/{sha}/analysis",
    response_model=Optional[CommitAnalysisRead],
    summary="Get commit completeness analysis",
    description="Return latest commit completeness analysis for a commit SHA if available.",
)
def get_commit_analysis(
    sha: str,
    db: Session = Depends(get_db),
) -> Optional[CommitAnalysisRead]:
    from app.models.commit import Commit
    from app.models.commit_analysis import CommitAnalysis

    commit = db.scalars(select(Commit).where(Commit.sha == sha)).first()
    if not commit:
        return None

    latest = db.scalars(
        select(CommitAnalysis)
        .where(CommitAnalysis.commit_id == commit.id)
        .order_by(CommitAnalysis.created_at.desc())
    ).first()

    if not latest:
        return None

    return CommitAnalysisRead.model_validate(latest)
