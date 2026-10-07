import uuid
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient

from app.db.base import Base
from app.db.session import engine, SessionLocal
from app.main import app
from app.models.analysis import Analysis, AnalysisStatus, AnalysisTrigger
from app.models.commit import Commit
from app.models.commit_analysis import CommitAnalysisStatus
from app.models.finding import Finding, FindingCategory, FindingSeverity, FindingSource, FindingStatus
from app.models.pull_request import PullRequest, PullRequestStatus
from app.models.repository import Repository
from app.models.review import Review, ReviewStatus
from app.models.user import User

client = TestClient(app)


def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Vigil backend is running", "version": "1.0.0"}


def test_health_check():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["database"] == "connected"


def test_auth_me():
    response = client.get("/api/v1/me")
    assert response.status_code == 200
    assert response.json()["service"] == "auth"


def test_list_repositories():
    res = client.get("/api/v1/repositories")
    assert res.status_code == 200
    assert "items" in res.json()


def test_get_repository_not_found():
    fake_id = str(uuid.uuid4())
    res = client.get(f"/api/v1/repositories/{fake_id}")
    assert res.status_code == 404


def test_get_pull_request_not_found():
    fake_id = str(uuid.uuid4())
    res = client.get(f"/api/v1/pull-requests/{fake_id}")
    assert res.status_code == 404


def test_get_analysis_not_found():
    fake_id = str(uuid.uuid4())
    res = client.get(f"/api/v1/analyses/{fake_id}")
    assert res.status_code == 404


def test_get_commit_not_found():
    res = client.get("/api/v1/commits/nonexistent_sha_999")
    assert res.status_code == 404


def test_get_findings_not_found():
    fake_id = str(uuid.uuid4())
    res = client.get(f"/api/v1/pull-requests/{fake_id}/findings")
    assert res.status_code == 404


def test_get_review_not_found():
    fake_id = str(uuid.uuid4())
    res = client.get(f"/api/v1/pull-requests/{fake_id}/review")
    assert res.status_code == 404


def test_publish_review_not_found():
    fake_id = str(uuid.uuid4())
    res = client.post(f"/api/v1/reviews/{fake_id}/publish", headers={"X-Reviewer-Login": "test-reviewer"})
    assert res.status_code == 404



def test_get_review_queue_not_found():
    fake_id = str(uuid.uuid4())
    res = client.get(f"/api/v1/review-queue/{fake_id}")
    assert res.status_code == 404
