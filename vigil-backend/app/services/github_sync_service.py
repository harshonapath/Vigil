"""
Phase 3 — GitHub Synchronization Orchestration Service.

Provides high-level methods that combine the GitHub API client with
the existing repository, pull-request and commit sync services to
perform full end-to-end synchronization workflows.
"""

import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ResourceNotFoundException
from app.core.logging_config import logger
from app.integrations.github.client import GitHubClient, github_client
from app.models.commit import Commit
from app.models.pull_request import PullRequest
from app.models.repository import Repository
from app.services.commit_service import commit_service
from app.services.pull_request_service import pull_request_service
from app.services.repository_service import repository_service


class GitHubSyncService:
    """
    Orchestrates multi-step GitHub synchronization workflows.

    This service is the single point of entry for any operation that
    requires fetching data from GitHub's API and persisting it to the
    Vigil database in one cohesive transaction.
    """

    def __init__(self, client: Optional[GitHubClient] = None):
        self._client = client or github_client

    # ------------------------------------------------------------------
    # 1. Repository synchronization
    # ------------------------------------------------------------------

    async def sync_installation_repositories(
        self,
        installation_id: int,
        db: Session,
    ) -> List[Repository]:
        """
        Fetch ALL repositories accessible to a GitHub App installation
        and upsert them into the database.

        Returns the list of synced Repository ORM objects.
        """
        logger.info(
            "Starting installation repository sync [installation_id=%d]",
            installation_id,
        )

        repos_data = await self._client.get_all_installation_repositories(
            installation_id
        )

        synced = repository_service.sync_installation_repositories(
            db=db, repos_data=repos_data
        )
        for repository in synced:
            repository.installation_id = installation_id
        db.commit()

        logger.info(
            "Installation repository sync complete [installation_id=%d, synced=%d]",
            installation_id,
            len(synced),
        )
        return synced

    # ------------------------------------------------------------------
    # 2. Pull request synchronization for a repository
    # ------------------------------------------------------------------

    async def sync_repository_pull_requests(
        self,
        installation_id: int,
        repository_id: uuid.UUID,
        db: Session,
        state: str = "all",
    ) -> List[PullRequest]:
        """
        Fetch pull requests for a repository from GitHub and upsert them.

        Args:
            installation_id: GitHub App installation ID.
            repository_id: Internal Vigil repository UUID.
            db: SQLAlchemy session.
            state: GitHub PR state filter ("open", "closed", "all").

        Returns the list of synced PullRequest ORM objects.
        """
        repo = db.scalar(
            select(Repository).where(Repository.id == repository_id)
        )
        if not repo:
            raise ResourceNotFoundException(
                f"Repository with ID '{repository_id}' not found"
            )

        repo.installation_id = installation_id
        db.commit()

        logger.info(
            "Starting PR sync [installation_id=%d, repo=%s, state=%s]",
            installation_id,
            repo.full_name,
            state,
        )

        prs_data = await self._client.get_repository_pull_requests(
            installation_id=installation_id,
            owner=repo.owner_login,
            repo=repo.name,
            state=state,
        )

        synced = pull_request_service.sync_repository_pull_requests(
            db=db, repository=repo, prs_data=prs_data
        )

        logger.info(
            "PR sync complete [repo=%s, synced=%d]",
            repo.full_name,
            len(synced),
        )
        return synced

    # ------------------------------------------------------------------
    # 3. Commit synchronization for a pull request
    # ------------------------------------------------------------------

    async def sync_pull_request_commits(
        self,
        installation_id: int,
        pull_request_id: uuid.UUID,
        db: Session,
    ) -> List[Commit]:
        """
        Fetch commits for a pull request from GitHub and upsert them,
        including the N:M association between PR and commits.

        Args:
            installation_id: GitHub App installation ID.
            pull_request_id: Internal Vigil pull request UUID.
            db: SQLAlchemy session.

        Returns the list of synced Commit ORM objects.
        """
        pr = db.scalar(
            select(PullRequest).where(PullRequest.id == pull_request_id)
        )
        if not pr:
            raise ResourceNotFoundException(
                f"Pull request with ID '{pull_request_id}' not found"
            )

        repo = db.scalar(
            select(Repository).where(Repository.id == pr.repository_id)
        )
        if not repo:
            raise ResourceNotFoundException(
                f"Repository with ID '{pr.repository_id}' not found"
            )

        logger.info(
            "Starting commit sync [installation_id=%d, repo=%s, pr_number=%d]",
            installation_id,
            repo.full_name,
            pr.pr_number,
        )

        commits_data = await self._client.get_pull_request_commits(
            installation_id=installation_id,
            owner=repo.owner_login,
            repo=repo.name,
            pr_number=pr.pr_number,
        )

        synced = commit_service.sync_pull_request_commits(
            db=db,
            repository=repo,
            pull_request=pr,
            commits_data=commits_data,
        )

        logger.info(
            "Commit sync complete [repo=%s, pr_number=%d, synced=%d]",
            repo.full_name,
            pr.pr_number,
            len(synced),
        )
        return synced

    # ------------------------------------------------------------------
    # 4. Full synchronization: repo → PRs → commits for each PR
    # ------------------------------------------------------------------

    async def sync_repository_full(
        self,
        installation_id: int,
        repository_id: uuid.UUID,
        db: Session,
        pr_state: str = "all",
    ) -> Dict[str, Any]:
        """
        Perform a full synchronization of a repository:

        1. Re-sync the repository metadata from GitHub.
        2. Fetch and upsert all pull requests.
        3. For every synced PR, fetch and upsert its commits.

        Returns a summary dict with counts.
        """
        repo = db.scalar(
            select(Repository).where(Repository.id == repository_id)
        )
        if not repo:
            raise ResourceNotFoundException(
                f"Repository with ID '{repository_id}' not found"
            )

        logger.info(
            "Starting full repository sync [installation_id=%d, repo=%s]",
            installation_id,
            repo.full_name,
        )

        # 1. Sync PRs
        synced_prs = await self.sync_repository_pull_requests(
            installation_id=installation_id,
            repository_id=repository_id,
            db=db,
            state=pr_state,
        )

        # 2. Sync commits for each synced PR
        total_commits = 0
        for pr in synced_prs:
            try:
                synced_commits = await self.sync_pull_request_commits(
                    installation_id=installation_id,
                    pull_request_id=pr.id,
                    db=db,
                )
                total_commits += len(synced_commits)
            except Exception as exc:
                logger.warning(
                    "Failed to sync commits for PR #%d: %s",
                    pr.pr_number,
                    str(exc),
                )

        logger.info(
            "Full repository sync complete [repo=%s, prs=%d, commits=%d]",
            repo.full_name,
            len(synced_prs),
            total_commits,
        )

        return {
            "repository": repo.full_name,
            "repository_id": str(repo.id),
            "pull_requests_synced": len(synced_prs),
            "commits_synced": total_commits,
        }

    # ------------------------------------------------------------------
    # 5. Webhook-triggered PR + commit sync (used by enhanced handlers)
    # ------------------------------------------------------------------

    async def sync_pr_with_commits_from_webhook(
        self,
        installation_id: int,
        repository: Repository,
        pull_request: PullRequest,
        db: Session,
    ) -> List[Commit]:
        """
        After a PR webhook event, fetch and sync the PR's commits.

        This is called by the enhanced PullRequestEventHandler after
        upserting the PR itself.
        """
        if not installation_id:
            logger.debug(
                "No installation_id available; skipping commit sync for PR #%d",
                pull_request.pr_number,
            )
            return []

        logger.info(
            "Webhook-triggered commit sync [repo=%s, pr_number=%d]",
            repository.full_name,
            pull_request.pr_number,
        )

        try:
            commits_data = await self._client.get_pull_request_commits(
                installation_id=installation_id,
                owner=repository.owner_login,
                repo=repository.name,
                pr_number=pull_request.pr_number,
            )

            synced = commit_service.sync_pull_request_commits(
                db=db,
                repository=repository,
                pull_request=pull_request,
                commits_data=commits_data,
            )

            logger.info(
                "Webhook commit sync complete [pr_number=%d, synced=%d]",
                pull_request.pr_number,
                len(synced),
            )
            return synced

        except Exception as exc:
            logger.warning(
                "Webhook commit sync failed for PR #%d: %s",
                pull_request.pr_number,
                str(exc),
            )
            return []


# Default singleton instance
github_sync_service = GitHubSyncService()
