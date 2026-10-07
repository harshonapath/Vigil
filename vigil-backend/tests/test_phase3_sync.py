import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.commit import Commit
from app.models.pull_request import PullRequest
from app.models.repository import Repository
from app.services.github_sync_service import github_sync_service
from app.services.repository_service import repository_service

client = TestClient(app)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.base import Base

@pytest.fixture
def db_session():
    """Create an isolated in-memory SQLite database session for unit tests."""
    from sqlalchemy.pool import StaticPool
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)



@pytest.fixture
def db_session_override(db_session):
    """Override the get_db dependency for TestClient with an in-memory DB session."""
    from app.db.session import get_db

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield db_session
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_sync_installation_repositories_service(db_session):
    mock_repos_data = [
        {"id": 101, "name": "repo1", "full_name": "owner/repo1", "owner": {"login": "owner"}},
        {"id": 102, "name": "repo2", "full_name": "owner/repo2", "owner": {"login": "owner"}},
    ]
    with patch("app.integrations.github.client.github_client.get_all_installation_repositories", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_repos_data
        
        synced = await github_sync_service.sync_installation_repositories(123, db=db_session)
        
        assert len(synced) == 2
        assert mock_get.call_count == 1
        assert mock_get.call_args[0][0] == 123


@pytest.mark.asyncio
async def test_sync_repository_pull_requests_service(db_session):
    repo = repository_service.sync_repository_payload(
        db_session, {"id": 201, "name": "repo", "full_name": "owner/repo", "owner": {"login": "owner"}}
    )
    
    mock_prs_data = [
        {"id": 301, "number": 1, "title": "PR 1", "state": "open", "head": {"sha": "sha1"}, "base": {"sha": "sha0"}, "user": {"login": "user1"}},
    ]
    with patch("app.integrations.github.client.github_client.get_repository_pull_requests", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_prs_data
        
        synced = await github_sync_service.sync_repository_pull_requests(
            installation_id=123, repository_id=repo.id, db=db_session
        )
        
        assert len(synced) == 1
        assert synced[0].pr_number == 1
        assert mock_get.call_count == 1


@pytest.mark.asyncio
async def test_sync_pull_request_commits_service(db_session):
    repo = repository_service.sync_repository_payload(
        db_session, {"id": 201, "name": "repo", "full_name": "owner/repo", "owner": {"login": "owner"}}
    )
    from app.services.pull_request_service import pull_request_service
    pr = pull_request_service.sync_pull_request_payload(
        db_session, repo, {"id": 301, "number": 1, "title": "PR 1", "head": {"sha": "sha1"}, "base": {"sha": "sha0"}, "user": {"login": "user1"}}
    )
    
    mock_commits_data = [
        {"sha": "commit_sha_1", "commit": {"message": "msg"}, "author": {"login": "user1"}}
    ]
    with patch("app.integrations.github.client.github_client.get_pull_request_commits", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_commits_data
        
        synced = await github_sync_service.sync_pull_request_commits(
            installation_id=123, pull_request_id=pr.id, db=db_session
        )
        
        assert len(synced) == 1
        assert synced[0].sha == "commit_sha_1"


def test_sync_endpoints_auth_and_structure(db_session_override):
    repo_id = uuid.uuid4()

    # Unauthenticated request returns 401
    res_unauth = client.post(f"/api/v1/sync/installations/123/repositories")
    assert res_unauth.status_code == 401

    headers = {"X-Reviewer-Login": "test-reviewer"}
    with patch("app.integrations.github.client.github_client.get_all_installation_repositories", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = []
        res = client.post(f"/api/v1/sync/installations/123/repositories", headers=headers)
        assert res.status_code == 200

    res = client.post(f"/api/v1/sync/repositories/{repo_id}/pull-requests", headers=headers)
    assert res.status_code == 422

    with patch("app.integrations.github.client.github_client.get_repository_pull_requests", new_callable=AsyncMock) as mock_get_prs:
        mock_get_prs.return_value = []
        res = client.post(f"/api/v1/sync/repositories/{repo_id}/pull-requests?installation_id=123", headers=headers)
        assert res.status_code == 404 # Repo not found in db

