"""
Phase 7 — GitHub Pull Request Review Publishing tests.
"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.analysis import Analysis, AnalysisStatus, AnalysisTrigger
from app.models.finding import Finding, FindingSeverity, FindingSource, FindingStatus
from app.models.pull_request import PullRequest, PullRequestStatus
from app.models.repository import Repository
from app.models.review import Review, ReviewStatus
from app.models.user import User

client = TestClient(app)

@pytest.fixture
def db_session():
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
def db_override(db_session):
    def override():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = override
    yield db_session
    app.dependency_overrides.clear()

def setup_test_data(db):
    user = User(github_user_id=1, github_login="testuser")
    db.add(user)
    db.flush()

    repo = Repository(
        user_id=user.id,
        github_repo_id=1,
        owner_login="testowner",
        name="testrepo",
        full_name="testowner/testrepo",
        default_branch="main",
        private=False,
        html_url="https://github.com/testowner/testrepo",
    )
    db.add(repo)
    db.flush()

    pr = PullRequest(
        repository_id=repo.id,
        github_pr_id=1,
        pr_number=1,
        title="Test PR",
        author_login="testauthor",
        source_branch="feat",
        target_branch="main",
        head_sha="testsha",
        base_sha="basesha",
        status=PullRequestStatus.OPEN.value,
    )
    db.add(pr)
    db.flush()

    analysis = Analysis(
        pull_request_id=pr.id,
        head_sha="testsha",
        status=AnalysisStatus.COMPLETED.value,
        trigger_type=AnalysisTrigger.WEBHOOK.value,
    )
    db.add(analysis)
    db.flush()

    review = Review(
        analysis_id=analysis.id,
        status=ReviewStatus.READY.value,
    )
    db.add(review)
    db.flush()

    finding = Finding(
        analysis_id=analysis.id,
        source=FindingSource.AI_REVIEW.value,
        category="SECURITY",
        severity=FindingSeverity.HIGH.value,
        fingerprint="testfp",
        file_path="testfile.py",
        start_line=1,
        end_line=1,
        message="Test message",
        status=FindingStatus.VERIFIED.value,
    )
    db.add(finding)
    db.flush()

    db.commit()
    return review

AUTH_HEADERS = {"X-Reviewer-Login": "test-reviewer"}


def test_publish_review_unauthenticated(db_override):
    review = setup_test_data(db_override)
    response = client.post(f"/api/v1/reviews/{review.id}/publish")
    assert response.status_code == 401


@patch("app.integrations.github.client.GitHubClient.create_pull_request_review")
def test_publish_review_success(mock_create_review, db_override):
    mock_create_review.return_value = {"id": 12345, "html_url": "https://github.com/testowner/testrepo/pull/1#review-12345"}
    review = setup_test_data(db_override)

    response = client.post(f"/api/v1/reviews/{review.id}/publish", headers=AUTH_HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == ReviewStatus.PUBLISHED.value
    assert data["github_review_id"] == 12345
    assert data["github_review_url"] == "https://github.com/testowner/testrepo/pull/1#review-12345"

@patch("app.integrations.github.client.GitHubClient.create_pull_request_review")
def test_publish_review_no_verified_findings(mock_create_review, db_override):
    review = setup_test_data(db_override)
    finding = db_override.query(Finding).first()
    finding.status = FindingStatus.PENDING_REVIEW.value
    db_override.commit()

    response = client.post(f"/api/v1/reviews/{review.id}/publish", headers=AUTH_HEADERS)
    assert response.status_code == 404 # ResourceNotFoundException
    assert "No verified findings available to publish" in response.json()["detail"]

def test_publish_review_not_found(db_override):
    response = client.post(f"/api/v1/reviews/{uuid.uuid4()}/publish", headers=AUTH_HEADERS)
    assert response.status_code == 404

@patch("app.integrations.github.client.GitHubClient.create_pull_request_review")
def test_publish_review_idempotent(mock_create_review, db_override):
    mock_create_review.return_value = {"id": 12345, "html_url": "https://github.com/url"}
    review = setup_test_data(db_override)
    
    # First publish
    res1 = client.post(f"/api/v1/reviews/{review.id}/publish", headers=AUTH_HEADERS)
    assert res1.status_code == 200

    # Second publish
    res2 = client.post(f"/api/v1/reviews/{review.id}/publish", headers=AUTH_HEADERS)
    assert res2.status_code == 200
    assert mock_create_review.call_count == 1

