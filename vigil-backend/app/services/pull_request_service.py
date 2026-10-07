import uuid
from datetime import datetime, timezone
from typing import List
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.exceptions import ResourceNotFoundException
from app.models.analysis import Analysis, AnalysisStatus, AnalysisTrigger
from app.models.pull_request import PullRequest, PullRequestStatus
from app.models.repository import Repository
from app.schemas.analysis import AnalysisRead
from app.schemas.pull_request import PullRequestListResponse, PullRequestRead


class PullRequestService:
    @staticmethod
    def get_pull_requests_for_repository(
        db: Session, repository_id: uuid.UUID, page: int = 1, page_size: int = 20
    ) -> PullRequestListResponse:
        repo = db.scalar(select(Repository).where(Repository.id == repository_id))
        if not repo:
            raise ResourceNotFoundException(f"Repository with ID '{repository_id}' not found")

        page = max(1, page)
        page_size = min(max(1, page_size), 100)
        offset = (page - 1) * page_size

        total = db.scalar(
            select(func.count(PullRequest.id)).where(PullRequest.repository_id == repository_id)
        ) or 0
        stmt = (
            select(PullRequest)
            .where(PullRequest.repository_id == repository_id)
            .order_by(PullRequest.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        items = list(db.scalars(stmt).all())

        total_pages = (total + page_size - 1) // page_size if total > 0 else 0

        return PullRequestListResponse(
            items=[PullRequestRead.model_validate(item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    @staticmethod
    def get_pull_request_by_id(db: Session, pull_request_id: uuid.UUID) -> PullRequestRead:
        pr = db.scalar(select(PullRequest).where(PullRequest.id == pull_request_id))
        if not pr:
            raise ResourceNotFoundException(f"Pull request with ID '{pull_request_id}' not found")
        return PullRequestRead.model_validate(pr)

    @staticmethod
    def trigger_analysis(db: Session, pull_request_id: uuid.UUID) -> AnalysisRead:
        pr = db.scalar(select(PullRequest).where(PullRequest.id == pull_request_id))
        if not pr:
            raise ResourceNotFoundException(f"Pull request with ID '{pull_request_id}' not found")

        existing = db.scalar(select(Analysis).where(
            Analysis.pull_request_id == pr.id,
            Analysis.head_sha == pr.head_sha,
            Analysis.status.in_([AnalysisStatus.QUEUED.value, AnalysisStatus.RUNNING.value, AnalysisStatus.COMPLETED.value]),
        ).order_by(Analysis.created_at.desc()))
        if existing:
            return AnalysisRead.model_validate(existing)

        analysis = Analysis(
            pull_request_id=pr.id,
            head_sha=pr.head_sha,
            status=AnalysisStatus.QUEUED.value,
            trigger_type=AnalysisTrigger.MANUAL.value,
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)

        return AnalysisRead.model_validate(analysis)

    @classmethod
    def sync_pull_request_payload(
        cls, db: Session, repository: Repository, pr_data: dict
    ) -> PullRequest:
        """Upsert a pull request record idempotently from a GitHub API payload or webhook."""
        github_pr_id = pr_data.get("id")
        pr_number = pr_data.get("number")
        if not github_pr_id or not pr_number:
            raise ValueError("Missing GitHub PR ID or number in payload")

        title = pr_data.get("title", "")
        description = pr_data.get("body")

        user_raw = pr_data.get("user")
        author_login = None
        if isinstance(user_raw, dict):
            author_login = user_raw.get("login")
        elif isinstance(user_raw, str) and user_raw.strip():
            author_login = user_raw.strip()

        if not author_login:
            author_login = pr_data.get("author_login")

        author_login = author_login or "unknown"

        head_raw = pr_data.get("head")
        source_branch = (
            (head_raw.get("ref") if isinstance(head_raw, dict) else None)
            or pr_data.get("head_branch")
            or pr_data.get("source_branch")
            or "unknown"
        )
        head_sha = (
            (head_raw.get("sha") if isinstance(head_raw, dict) else None)
            or pr_data.get("head_sha")
            or ""
        )

        base_raw = pr_data.get("base")
        target_branch = (
            (base_raw.get("ref") if isinstance(base_raw, dict) else None)
            or pr_data.get("base_branch")
            or pr_data.get("target_branch")
            or "unknown"
        )
        base_sha = (
            (base_raw.get("sha") if isinstance(base_raw, dict) else None)
            or pr_data.get("base_sha")
            or ""
        )

        state_str = str(pr_data.get("state", "open")).lower()
        is_merged = bool(pr_data.get("merged", False))

        if is_merged:
            status_val = PullRequestStatus.MERGED.value
        elif state_str == "closed":
            status_val = PullRequestStatus.CLOSED.value
        else:
            status_val = PullRequestStatus.OPEN.value

        now = datetime.now(timezone.utc)

        # Unique lookup by repository_id and github_pr_id (or pr_number)
        pr = db.scalar(
            select(PullRequest).where(
                PullRequest.repository_id == repository.id,
                (PullRequest.github_pr_id == github_pr_id) | (PullRequest.pr_number == pr_number),
            )
        )

        if pr:
            pr.github_pr_id = github_pr_id
            pr.pr_number = pr_number
            pr.title = title
            if description is not None:
                pr.description = description
            pr.author_login = author_login
            pr.source_branch = source_branch
            pr.target_branch = target_branch
            pr.head_sha = head_sha
            pr.base_sha = base_sha
            pr.status = status_val
            pr.updated_at = now
            if status_val in (PullRequestStatus.CLOSED.value, PullRequestStatus.MERGED.value):
                pr.closed_at = now
            if is_merged:
                pr.merged_at = now
        else:
            pr = PullRequest(
                id=uuid.uuid4(),
                repository_id=repository.id,
                github_pr_id=github_pr_id,
                pr_number=pr_number,
                title=title,
                description=description,
                author_login=author_login,
                source_branch=source_branch,
                target_branch=target_branch,
                head_sha=head_sha,
                base_sha=base_sha,
                status=status_val,
                created_at=now,
                updated_at=now,
                closed_at=now if status_val in (PullRequestStatus.CLOSED.value, PullRequestStatus.MERGED.value) else None,
                merged_at=now if is_merged else None,
            )
            db.add(pr)

        db.commit()
        db.refresh(pr)
        return pr

    @classmethod
    def sync_repository_pull_requests(
        cls, db: Session, repository: Repository, prs_data: List[dict]
    ) -> List[PullRequest]:
        """Upsert a list of GitHub pull request payloads for a repository."""
        synced_prs: List[PullRequest] = []
        for pr_data in prs_data:
            if isinstance(pr_data, dict):
                pr = cls.sync_pull_request_payload(db, repository, pr_data)
                synced_prs.append(pr)
        return synced_prs


pull_request_service = PullRequestService()
