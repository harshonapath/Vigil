import uuid
from datetime import datetime, timezone
from typing import List, Optional, Tuple
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.exceptions import ResourceNotFoundException
from app.models.repository import Repository
from app.models.user import User
from app.schemas.repository import RepositoryListResponse, RepositoryRead


class RepositoryService:
    @staticmethod
    def get_repositories(db: Session, page: int = 1, page_size: int = 20) -> RepositoryListResponse:
        page = max(1, page)
        page_size = min(max(1, page_size), 100)
        offset = (page - 1) * page_size

        total = db.scalar(select(func.count(Repository.id))) or 0
        stmt = select(Repository).order_by(Repository.created_at.desc()).offset(offset).limit(page_size)
        items = list(db.scalars(stmt).all())

        total_pages = (total + page_size - 1) // page_size if total > 0 else 0

        return RepositoryListResponse(
            items=[RepositoryRead.model_validate(item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    @staticmethod
    def get_repository_by_id(db: Session, repository_id: uuid.UUID) -> RepositoryRead:
        repo = db.scalar(select(Repository).where(Repository.id == repository_id))
        if not repo:
            raise ResourceNotFoundException(f"Repository with ID '{repository_id}' not found")
        return RepositoryRead.model_validate(repo)

    @staticmethod
    def _get_or_create_user(
        db: Session, owner_login: str, owner_id: Optional[int] = None
    ) -> User:
        stmt = select(User).where(User.github_login == owner_login)
        user = db.scalar(stmt)
        if not user and owner_id:
            user = db.scalar(select(User).where(User.github_user_id == owner_id))

        if not user:
            import zlib
            assigned_user_id = owner_id
            if not assigned_user_id:
                assigned_user_id = zlib.crc32(owner_login.encode("utf-8"))
                while db.scalar(select(User).where(User.github_user_id == assigned_user_id)):
                    assigned_user_id += 1

            user = User(
                id=uuid.uuid4(),
                github_user_id=assigned_user_id,
                github_login=owner_login,
                display_name=owner_login,
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        return user

    @classmethod
    def sync_repository_payload(cls, db: Session, repo_data: dict) -> Repository:
        """Upsert a repository record idempotently from a GitHub API payload or webhook."""
        github_repo_id = repo_data.get("id")
        if not github_repo_id:
            raise ValueError("Missing repository ID in GitHub payload")

        owner_raw = repo_data.get("owner")
        owner_login = None
        owner_id = None

        if isinstance(owner_raw, dict):
            owner_login = owner_raw.get("login")
            owner_id = owner_raw.get("id")
        elif isinstance(owner_raw, str) and owner_raw.strip():
            owner_login = owner_raw.strip()

        if not owner_login:
            owner_login = repo_data.get("owner_login")

        full_name_input = repo_data.get("full_name") or ""
        name = repo_data.get("name", "")

        # Fallback to full_name if owner_login is missing or "unknown"
        if (not owner_login or owner_login.lower() == "unknown") and "/" in full_name_input:
            parts = full_name_input.split("/", 1)
            if parts[0].strip() and parts[0].strip().lower() != "unknown":
                owner_login = parts[0].strip()
            if not name and parts[1].strip():
                name = parts[1].strip()

        owner_login = owner_login or "unknown"

        # Determine full_name and html_url
        if full_name_input and not full_name_input.startswith("unknown/") and "/" in full_name_input:
            full_name = full_name_input
        else:
            full_name = f"{owner_login}/{name}" if name else full_name_input

        default_branch = repo_data.get("default_branch") or "main"
        private = bool(repo_data.get("private", False))
        html_url = repo_data.get("html_url")
        if not html_url or ("unknown/" in html_url and owner_login != "unknown"):
            html_url = f"https://github.com/{full_name}"

        repo = db.scalar(select(Repository).where(Repository.github_repo_id == github_repo_id))
        now = datetime.now(timezone.utc)

        if repo:
            # Self-heal or update owner_login if new authoritative value is known
            if owner_login and owner_login.lower() != "unknown":
                repo.owner_login = owner_login
            elif repo.owner_login and repo.owner_login.lower() != "unknown":
                owner_login = repo.owner_login

            # Ensure user record is updated/associated
            if owner_login and owner_login.lower() != "unknown":
                if not repo.user or repo.user.github_login == "unknown":
                    user = cls._get_or_create_user(db, owner_login=owner_login, owner_id=owner_id)
                    repo.user_id = user.id

            repo.name = name
            repo.full_name = full_name
            repo.default_branch = default_branch
            repo.private = private
            repo.html_url = html_url
            repo.is_active = True
            if repo_data.get("installation_id") is not None:
                repo.installation_id = int(repo_data["installation_id"])
            repo.updated_at = now
        else:
            user = cls._get_or_create_user(db, owner_login=owner_login, owner_id=owner_id)
            repo = Repository(
                id=uuid.uuid4(),
                user_id=user.id,
                github_repo_id=github_repo_id,
                installation_id=(int(repo_data["installation_id"]) if repo_data.get("installation_id") is not None else None),
                owner_login=owner_login,
                name=name,
                full_name=full_name,
                default_branch=default_branch,
                private=private,
                html_url=html_url,
                is_active=True,
                created_at=now,
                updated_at=now,
            )
            db.add(repo)

        db.commit()
        db.refresh(repo)
        return repo

    @classmethod
    def sync_installation_repositories(
        cls, db: Session, repos_data: List[dict]
    ) -> List[Repository]:
        """Upsert a list of GitHub repository payloads."""
        synced_repos: List[Repository] = []
        for repo_data in repos_data:
            if isinstance(repo_data, dict):
                repo = cls.sync_repository_payload(db, repo_data)
                synced_repos.append(repo)
        return synced_repos


repository_service = RepositoryService()
