import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.dialects.mssql import UNIQUEIDENTIFIER
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

@compiles(UNIQUEIDENTIFIER, "sqlite")
def compile_uniqueidentifier_sqlite(type_, compiler, **kw):
    return "VARCHAR(36)"


from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.commit import Commit
from app.models.pull_request import PullRequest, PullRequestStatus
from app.models.repository import Repository
from app.models.user import User
from app.services.commit_service import commit_service
from app.services.pull_request_service import pull_request_service
from app.services.repository_service import repository_service

client = TestClient(app)


# Setup SQLite in-memory engine for unit test DB isolation
@pytest.fixture
def db_session():
    """Create an isolated in-memory SQLite database session for unit tests."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)

    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()

    try:
        yield db
    finally:
        db.close()


# ============================================================================
# 1. REPOSITORY SYNCHRONIZATION & IDEMPOTENCY TESTS
# ============================================================================

def test_repository_sync_create_and_update(db_session):
    repo_payload_1 = {
        "id": 1234567,
        "name": "vigil-app",
        "full_name": "vigil-org/vigil-app",
        "owner": {"login": "vigil-org", "id": 99},
        "default_branch": "main",
        "private": True,
        "html_url": "https://github.com/vigil-org/vigil-app",
    }

    # First Sync -> Create
    repo1 = repository_service.sync_repository_payload(db_session, repo_payload_1)
    assert repo1 is not None
    assert repo1.github_repo_id == 1234567
    assert repo1.name == "vigil-app"
    assert repo1.owner_login == "vigil-org"
    assert repo1.private is True

    # Check database count
    all_repos = list(db_session.scalars(select(Repository)).all())
    assert len(all_repos) == 1

    # Second Sync (Updated title/default branch) -> Update existing (Idempotent)
    repo_payload_2 = dict(repo_payload_1)
    repo_payload_2["default_branch"] = "develop"

    repo2 = repository_service.sync_repository_payload(db_session, repo_payload_2)
    assert repo2.id == repo1.id
    assert repo2.default_branch == "develop"

    # Verify no duplicate repository was created
    all_repos_after = list(db_session.scalars(select(Repository)).all())
    assert len(all_repos_after) == 1


# ============================================================================
# 2. PULL REQUEST SYNCHRONIZATION & IDEMPOTENCY TESTS
# ============================================================================

def test_pull_request_sync_create_and_update(db_session):
    # Setup repository first
    repo = repository_service.sync_repository_payload(
        db_session,
        {"id": 1001, "name": "repo1", "full_name": "owner/repo1", "owner": {"login": "owner"}},
    )

    pr_payload_1 = {
        "id": 55555,
        "number": 12,
        "title": "Initial PR",
        "body": "PR description",
        "user": {"login": "contributor"},
        "head": {"ref": "feature-1", "sha": "sha_head_111"},
        "base": {"ref": "main", "sha": "sha_base_000"},
        "state": "open",
        "merged": False,
    }

    # First Sync -> Create
    pr1 = pull_request_service.sync_pull_request_payload(db_session, repo, pr_payload_1)
    assert pr1 is not None
    assert pr1.github_pr_id == 55555
    assert pr1.pr_number == 12
    assert pr1.status == PullRequestStatus.OPEN.value
    assert pr1.head_sha == "sha_head_111"

    # Second Sync (Merged/Closed) -> Update existing
    pr_payload_2 = dict(pr_payload_1)
    pr_payload_2["state"] = "closed"
    pr_payload_2["merged"] = True
    pr_payload_2["head"] = {"ref": "feature-1", "sha": "sha_head_222"}

    pr2 = pull_request_service.sync_pull_request_payload(db_session, repo, pr_payload_2)
    assert pr2.id == pr1.id
    assert pr2.status == PullRequestStatus.MERGED.value
    assert pr2.head_sha == "sha_head_222"

    # Verify count
    all_prs = list(db_session.scalars(select(PullRequest)).all())
    assert len(all_prs) == 1


# ============================================================================
# 3. COMMIT SYNCHRONIZATION & PR ASSOCIATION TESTS
# ============================================================================

def test_commit_sync_and_pr_association(db_session):
    repo = repository_service.sync_repository_payload(
        db_session,
        {"id": 1002, "name": "repo2", "full_name": "owner/repo2", "owner": {"login": "owner"}},
    )
    pr = pull_request_service.sync_pull_request_payload(
        db_session,
        repo,
        {"id": 666, "number": 1, "title": "PR 1", "head": {"ref": "b", "sha": "s1"}, "base": {"ref": "m", "sha": "s0"}},
    )

    commit_payload = {
        "sha": "abc1234567890def1234567890def1234567890d",
        "commit": {
            "message": "fix: resolve bug",
            "author": {"name": "Alice", "email": "alice@example.com", "date": "2026-09-26T14:00:00Z"},
        },
        "author": {"login": "alice_dev"},
        "parents": [{"sha": "parent_sha_000"}],
    }

    # Sync commit and associate with PR
    c1 = commit_service.sync_commit_payload(db_session, repo, commit_payload, pull_request=pr)
    assert c1 is not None
    assert c1.sha == "abc1234567890def1234567890def1234567890d"
    assert c1.author_login == "alice_dev"
    assert c1.parent_sha == "parent_sha_000"

    # Verify PR relationship
    assert len(pr.commits) == 1
    assert pr.commits[0].id == c1.id

    # Sync again (Idempotent check)
    c2 = commit_service.sync_commit_payload(db_session, repo, commit_payload, pull_request=pr)
    assert c2.id == c1.id
    assert len(pr.commits) == 1


# ============================================================================
# 4. WEBHOOK TO DATABASE SYNCHRONIZATION TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_webhook_push_syncs_to_db(db_session):
    from app.integrations.github.webhooks.handlers import PushEventHandler
    from app.integrations.github.webhooks.schemas import normalize_webhook_payload

    payload = {
        "installation": {"id": 1234},
        "ref": "refs/heads/main",
        "before": "before_sha",
        "after": "after_sha",
        "repository": {
            "id": 99999,
            "name": "webhook-repo",
            "full_name": "org/webhook-repo",
            "owner": {"login": "org"},
            "private": False,
            "html_url": "https://github.com/org/webhook-repo",
        },
        "commits": [
            {
                "id": "commit_sha_1",
                "message": "feat: commit 1 from webhook",
                "timestamp": "2026-09-26T15:00:00Z",
                "author": {"name": "Dev", "email": "dev@org.com"},
            }
        ],
        "sender": {"id": 1, "login": "dev_user"},
    }

    event = normalize_webhook_payload("push", "delivery-w1", payload)
    handler = PushEventHandler()

    result = await handler.handle(event, db=db_session)
    assert result["status"] == "processed"

    # Verify DB records created
    repo_in_db = db_session.scalar(select(Repository).where(Repository.github_repo_id == 99999))
    assert repo_in_db is not None
    assert repo_in_db.full_name == "org/webhook-repo"

    commit_in_db = db_session.scalar(select(Commit).where(Commit.sha == "commit_sha_1"))
    assert commit_in_db is not None
    assert commit_in_db.message == "feat: commit 1 from webhook"


@pytest.mark.asyncio
async def test_webhook_pr_syncs_to_db(db_session):
    from app.integrations.github.webhooks.handlers import PullRequestEventHandler
    from app.integrations.github.webhooks.schemas import normalize_webhook_payload

    payload = {
        "action": "synchronize",
        "number": 42,
        "installation": {"id": 1234},
        "repository": {
            "id": 88888,
            "name": "pr-repo",
            "full_name": "org/pr-repo",
            "owner": {"login": "org"},
            "private": True,
            "html_url": "https://github.com/org/pr-repo",
        },
        "pull_request": {
            "id": 7777,
            "number": 42,
            "title": "Sync PR title",
            "body": "Updated code",
            "state": "open",
            "merged": False,
            "head": {"sha": "new_head_sha", "ref": "patch-1"},
            "base": {"sha": "main_sha", "ref": "main"},
            "user": {"login": "pr_author"},
        },
        "sender": {"id": 2, "login": "pr_author"},
    }

    event = normalize_webhook_payload("pull_request", "delivery-pr-sync", payload)
    handler = PullRequestEventHandler()

    result = await handler.handle(event, db=db_session)
    assert result["status"] == "processed"

    # Verify DB records created
    pr_in_db = db_session.scalar(select(PullRequest).where(PullRequest.github_pr_id == 7777))
    assert pr_in_db is not None
    assert pr_in_db.pr_number == 42
    assert pr_in_db.head_sha == "new_head_sha"
    assert pr_in_db.status == PullRequestStatus.OPEN.value
    assert pr_in_db.author_login == "pr_author"

    repo_in_db = db_session.scalar(select(Repository).where(Repository.github_repo_id == 88888))
    assert repo_in_db is not None
    assert repo_in_db.owner_login == "org"
    assert repo_in_db.full_name == "org/pr-repo"


# ============================================================================
# 5. REGRESSION TESTS: GITHUB PAYLOAD OWNER RESOLUTION & CLIENT CALLS
# ============================================================================

def test_regression_repository_owner_extraction_nested_and_flat(db_session):
    """
    Test that a GitHub repository payload such as:
    {"id": 12345, "name": "Bizzare", "full_name": "IlIGODIlI/Bizzare", "owner": {"login": "IlIGODIlI"}}
    and its serialized flat form {"id": 12345, "name": "Bizzare", "full_name": "IlIGODIlI/Bizzare", "owner_login": "IlIGODIlI"}
    both result in owner_login='IlIGODIlI', name='Bizzare', full_name='IlIGODIlI/Bizzare'.
    """
    nested_payload = {
        "id": 12345,
        "name": "Bizzare",
        "full_name": "IlIGODIlI/Bizzare",
        "owner": {
            "login": "IlIGODIlI",
            "id": 54321,
        },
    }

    repo = repository_service.sync_repository_payload(db_session, nested_payload)
    assert repo.owner_login == "IlIGODIlI"
    assert repo.name == "Bizzare"
    assert repo.full_name == "IlIGODIlI/Bizzare"

    # Flat payload from model_dump()
    flat_payload = {
        "id": 12345,
        "name": "Bizzare",
        "full_name": "IlIGODIlI/Bizzare",
        "owner_login": "IlIGODIlI",
    }

    repo_flat = repository_service.sync_repository_payload(db_session, flat_payload)
    assert repo_flat.owner_login == "IlIGODIlI"
    assert repo_flat.name == "Bizzare"
    assert repo_flat.full_name == "IlIGODIlI/Bizzare"


def test_regression_repository_self_healing_from_unknown_owner(db_session):
    """
    If a repository record already exists with owner_login='unknown',
    the normal sync path must correct it from the authoritative GitHub webhook payload.
    """
    # 1. Simulate existing corrupted record with owner_login='unknown'
    corrupt_payload = {
        "id": 987654,
        "name": "Bizzare",
        "full_name": "unknown/Bizzare",
        "owner_login": "unknown",
    }
    repo_corrupt = repository_service.sync_repository_payload(db_session, corrupt_payload)
    assert repo_corrupt.owner_login == "unknown"

    # 2. Authoritative GitHub webhook payload arrives
    authoritative_payload = {
        "id": 987654,
        "name": "Bizzare",
        "full_name": "IlIGODIlI/Bizzare",
        "owner": {
            "login": "IlIGODIlI",
            "id": 112233,
        },
    }
    healed_repo = repository_service.sync_repository_payload(db_session, authoritative_payload)
    assert healed_repo.id == repo_corrupt.id
    assert healed_repo.owner_login == "IlIGODIlI"
    assert healed_repo.name == "Bizzare"
    assert healed_repo.full_name == "IlIGODIlI/Bizzare"
    assert healed_repo.html_url == "https://github.com/IlIGODIlI/Bizzare"


@pytest.mark.asyncio
async def test_regression_webhook_pr_sync_calls_github_client_with_correct_owner(db_session):
    """
    Ensure that when a pull_request webhook for IlIGODIlI/Bizzare is processed,
    the GitHub API client receives owner='IlIGODIlI' and repo='Bizzare', NOT owner='unknown'.
    """
    from app.integrations.github.webhooks.handlers import PullRequestEventHandler
    from app.integrations.github.webhooks.schemas import normalize_webhook_payload
    from app.services.github_sync_service import github_sync_service

    webhook_payload = {
        "action": "opened",
        "number": 2,
        "installation": {"id": 168568119},
        "repository": {
            "id": 998877,
            "name": "Bizzare",
            "full_name": "IlIGODIlI/Bizzare",
            "owner": {"login": "IlIGODIlI"},
            "private": False,
            "html_url": "https://github.com/IlIGODIlI/Bizzare",
        },
        "pull_request": {
            "id": 554433,
            "number": 2,
            "title": "Fix security vulnerability",
            "body": "PR description",
            "state": "open",
            "merged": False,
            "head": {"sha": "head_sha_999", "ref": "fix-branch"},
            "base": {"sha": "base_sha_000", "ref": "main"},
            "user": {"login": "IlIGODIlI"},
        },
        "sender": {"id": 1234, "login": "IlIGODIlI"},
    }

    event = normalize_webhook_payload("pull_request", "delivery-reg-1", webhook_payload)
    handler = PullRequestEventHandler()

    captured_calls = []

    async def mock_get_pull_request_commits(installation_id, owner, repo, pr_number, page=1, per_page=100):
        captured_calls.append({
            "installation_id": installation_id,
            "owner": owner,
            "repo": repo,
            "pr_number": pr_number,
        })
        return []

    with patch.object(github_sync_service._client, "get_pull_request_commits", side_effect=mock_get_pull_request_commits):
        result = await handler.handle(event, db=db_session)
        assert result["status"] == "processed"
        assert result["repository"] == "IlIGODIlI/Bizzare"

    # Verify that the GitHub client was called with the exact owner and repo
    assert len(captured_calls) == 1
    call = captured_calls[0]
    assert call["installation_id"] == 168568119
    assert call["owner"] == "IlIGODIlI"
    assert call["repo"] == "Bizzare"
    assert call["pr_number"] == 2
    assert call["owner"] != "unknown"

