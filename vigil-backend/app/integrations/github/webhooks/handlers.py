from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session

from app.core.logging_config import logger
from app.db.session import SessionLocal
from app.integrations.github.webhooks.schemas import (
    GitHubNormalizedEvent,
    GitHubPullRequestEvent,
    GitHubPushEvent,
)
from app.services.commit_service import commit_service
from app.services.pull_request_service import pull_request_service
from app.services.repository_service import repository_service
from app.integrations.repolens.service import repository_context_service


class BaseWebhookHandler(ABC):
    """Abstract base class for all GitHub webhook event handlers."""

    @abstractmethod
    async def handle(self, event: Any, db: Optional[Session] = None) -> Dict[str, Any]:
        """Process a normalized GitHub webhook event."""
        pass


class PushEventHandler(BaseWebhookHandler):
    """Handler for GitHub 'push' webhook events."""

    async def handle(self, event: GitHubPushEvent, db: Optional[Session] = None) -> Dict[str, Any]:
        logger.info(
            "Processing GitHub push event [delivery_id=%s, repo=%s, ref=%s, commit_count=%d]",
            event.delivery_id,
            event.repository.full_name,
            event.ref,
            len(event.commits),
        )

        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            repo_dict = event.repository.model_dump()
            repo_dict["installation_id"] = event.installation_id
            repo = repository_service.sync_repository_payload(db=db, repo_data=repo_dict)

            synced_commits = []
            for c in event.commits:
                commit_dict = c.model_dump()
                synced = commit_service.sync_commit_payload(db=db, repository=repo, commit_data=commit_dict)
                synced_commits.append(synced)

            latest_commit = event.commits[-1] if event.commits else None
            
            # Phase 4: Trigger incremental RepoLens update
            if latest_commit and event.installation_id:
                try:
                    import asyncio
                    asyncio.create_task(
                        repository_context_service.update_context_for_commit(
                            installation_id=event.installation_id,
                            owner=repo.owner_login,
                            repo=repo.name,
                            sha=latest_commit.id
                        )
                    )
                except Exception as e:
                    logger.warning(f"Failed to trigger RepoLens update for push: {e}")

            return {
                "status": "processed",
                "event_type": "push",
                "repository": repo.full_name,
                "ref": event.ref,
                "commits_count": len(synced_commits),
                "installation_id": event.installation_id,
            }
        finally:
            if close_db and db:
                db.close()


class PullRequestEventHandler(BaseWebhookHandler):
    """Handler for GitHub 'pull_request' webhook events (opened, synchronize, reopened, closed).

    Phase 3 enhancement: automatically fetches and syncs PR commits
    when an installation_id is available and the action is one of
    opened, synchronize, or reopened.
    """

    # Actions that should trigger an automatic commit sync
    COMMIT_SYNC_ACTIONS = {"opened", "synchronize", "reopened"}

    async def handle(self, event: GitHubPullRequestEvent, db: Optional[Session] = None) -> Dict[str, Any]:
        logger.info(
            "Processing GitHub pull_request event [delivery_id=%s, action=%s, repo=%s, pr_number=%d]",
            event.delivery_id,
            event.action,
            event.repository.full_name,
            event.pull_request.number,
        )

        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            repo_dict = event.repository.model_dump()
            repo_dict["installation_id"] = event.installation_id
            repo = repository_service.sync_repository_payload(db=db, repo_data=repo_dict)

            pr_dict = event.pull_request.model_dump()
            pr_dict["action"] = event.action
            pr = pull_request_service.sync_pull_request_payload(db=db, repository=repo, pr_data=pr_dict)

            # Phase 3: Auto-sync commits for applicable actions
            commits_synced = 0
            if (
                event.action in self.COMMIT_SYNC_ACTIONS
                and event.installation_id is not None
            ):
                try:
                    from app.services.github_sync_service import github_sync_service

                    synced_commits = await github_sync_service.sync_pr_with_commits_from_webhook(
                        installation_id=event.installation_id,
                        repository=repo,
                        pull_request=pr,
                        db=db,
                    )
                    commits_synced = len(synced_commits)
                except Exception as exc:
                    logger.warning(
                        "Auto commit sync failed for PR #%d: %s",
                        pr.pr_number,
                        str(exc),
                    )

            # Phase 4: Trigger incremental RepoLens update
            if event.installation_id:
                try:
                    import asyncio
                    asyncio.create_task(
                        repository_context_service.update_context_for_commit(
                            installation_id=event.installation_id,
                            owner=repo.owner_login,
                            repo=repo.name,
                            sha=pr.head_sha
                        )
                    )
                except Exception as e:
                    logger.warning(f"Failed to trigger RepoLens update for PR: {e}")

            return {
                "status": "processed",
                "event_type": "pull_request",
                "action": event.action,
                "pr_number": pr.pr_number,
                "repository": repo.full_name,
                "installation_id": event.installation_id,
                "head_sha": pr.head_sha,
                "commits_synced": commits_synced,
            }
        finally:
            if close_db and db:
                db.close()
