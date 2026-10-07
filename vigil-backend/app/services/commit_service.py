import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.exceptions import ResourceNotFoundException
from app.models.commit import Commit
from app.models.commit_analysis import CommitAnalysis, CommitAnalysisOverallStatus, CommitAnalysisStatus
from app.models.pull_request import PullRequest
from app.models.repository import Repository
from app.schemas.commit import CommitListResponse, CommitRead
from app.schemas.commit_analysis import CommitAnalysisRead


class CommitService:
    @staticmethod
    def get_commits_for_pull_request(
        db: Session, pull_request_id: uuid.UUID, page: int = 1, page_size: int = 20
    ) -> CommitListResponse:
        pr = db.scalar(select(PullRequest).where(PullRequest.id == pull_request_id))
        if not pr:
            raise ResourceNotFoundException(f"Pull request with ID '{pull_request_id}' not found")

        page = max(1, page)
        page_size = min(max(1, page_size), 100)
        offset = (page - 1) * page_size

        total = len(pr.commits)
        commits = pr.commits[offset : offset + page_size]
        total_pages = (total + page_size - 1) // page_size if total > 0 else 0

        return CommitListResponse(
            items=[CommitRead.model_validate(c) for c in commits],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    @staticmethod
    def get_commit_by_sha(db: Session, sha: str) -> CommitRead:
        commits = list(db.scalars(select(Commit).where(Commit.sha == sha)).all())
        if not commits:
            raise ResourceNotFoundException(f"Commit with SHA '{sha}' not found")
        # Return the most recent commit by created_at if multiple exist across repositories
        selected_commit = sorted(commits, key=lambda c: c.created_at, reverse=True)[0]
        return CommitRead.model_validate(selected_commit)

    @staticmethod
    def trigger_commit_analysis(db: Session, sha: str) -> CommitAnalysisRead:
        from app.services.commit_analysis.service import commit_analysis_engine_service
        return commit_analysis_engine_service.trigger_commit_analysis_sync(db=db, sha=sha)


    @classmethod
    def sync_commit_payload(
        cls,
        db: Session,
        repository: Repository,
        commit_data: dict,
        pull_request: Optional[PullRequest] = None,
    ) -> Commit:
        """Upsert a commit record idempotently from a GitHub API payload or webhook."""
        sha = commit_data.get("sha") or commit_data.get("id")
        if not sha:
            raise ValueError("Missing commit SHA in payload")

        commit_inner = commit_data.get("commit") if isinstance(commit_data.get("commit"), dict) else commit_data
        message = (commit_inner.get("message") if isinstance(commit_inner, dict) else None) or commit_data.get("message", "")

        author_inner = commit_inner.get("author") if isinstance(commit_inner, dict) and isinstance(commit_inner.get("author"), dict) else {}
        author_name = (author_inner.get("name") if isinstance(author_inner, dict) else None) or commit_data.get("author_name")
        author_email = (author_inner.get("email") if isinstance(author_inner, dict) else None) or commit_data.get("author_email")

        author_user = commit_data.get("author")
        author_login = None
        if isinstance(author_user, dict):
            author_login = author_user.get("login")
        elif isinstance(author_user, str):
            author_login = author_user
        if not author_login:
            author_login = commit_data.get("author_login")

        committed_at_raw = (author_inner.get("date") if isinstance(author_inner, dict) else None) or commit_data.get("timestamp") or commit_data.get("committed_at")
        committed_at = None
        if committed_at_raw:
            try:
                committed_at = datetime.fromisoformat(str(committed_at_raw).replace("Z", "+00:00"))
            except ValueError:
                committed_at = None

        parents_raw = commit_data.get("parents", [])
        parent_sha = None
        if isinstance(parents_raw, list) and len(parents_raw) > 0 and isinstance(parents_raw[0], dict):
            parent_sha = parents_raw[0].get("sha")

        commit = db.scalar(
            select(Commit).where(
                Commit.repository_id == repository.id,
                Commit.sha == sha,
            )
        )
        now = datetime.now(timezone.utc)

        if commit:
            commit.message = message
            if author_login:
                commit.author_login = author_login
            if author_name:
                commit.author_name = author_name
            if author_email:
                commit.author_email = author_email
            if committed_at:
                commit.committed_at = committed_at
            if parent_sha:
                commit.parent_sha = parent_sha
        else:
            commit = Commit(
                id=uuid.uuid4(),
                repository_id=repository.id,
                sha=sha,
                message=message,
                author_login=author_login,
                author_name=author_name,
                author_email=author_email,
                committed_at=committed_at,
                parent_sha=parent_sha,
                created_at=now,
            )
            db.add(commit)

        # Associate with PullRequest if provided
        if pull_request:
            if commit not in pull_request.commits:
                pull_request.commits.append(commit)

        db.commit()
        db.refresh(commit)
        return commit

    @classmethod
    def sync_pull_request_commits(
        cls,
        db: Session,
        repository: Repository,
        pull_request: PullRequest,
        commits_data: List[dict],
    ) -> List[Commit]:
        """Upsert a list of GitHub commit payloads for a pull request."""
        synced_commits: List[Commit] = []
        for commit_data in commits_data:
            if isinstance(commit_data, dict):
                commit = cls.sync_commit_payload(
                    db=db,
                    repository=repository,
                    commit_data=commit_data,
                    pull_request=pull_request,
                )
                synced_commits.append(commit)
        return synced_commits


commit_service = CommitService()
