import pytest
from app.db.base import Base
from app.models import (
    User,
    Repository,
    PullRequest,
    Commit,
    Analysis,
    Finding,
    Review,
    CommitAnalysis,
    pull_request_commits,
)


def test_models_metadata():
    expected_tables = {
        "users",
        "repositories",
        "repository_installations",
        "pull_requests",
        "commits",
        "pull_request_commits",
        "analyses",
        "findings",
        "reviews",
        "commit_analyses",
        # Phase 6: verification audit table
        "finding_verifications",
        "security_assumptions",
        "security_assumption_versions",
        "security_assumption_evidence",
        "security_assumption_changes",
        "security_assumption_decisions",
        "security_assumption_runs",
    }
    
    assert set(Base.metadata.tables.keys()) == expected_tables, (
        f"Expected tables {expected_tables}, got {set(Base.metadata.tables.keys())}"
    )
    assert len(Base.metadata.tables) == 17


def test_pull_request_commits_composite_pk():
    pr_commits_table = Base.metadata.tables["pull_request_commits"]
    pk_cols = [c.name for c in pr_commits_table.primary_key.columns]
    assert set(pk_cols) == {"pull_request_id", "commit_id"}
    assert len(pk_cols) == 2


def test_foreign_keys():
    repo_table = Base.metadata.tables["repositories"]
    repo_fks = [(fk.parent.name, fk.target_fullname) for fk in repo_table.foreign_keys]
    assert ("user_id", "users.id") in repo_fks

    pr_table = Base.metadata.tables["pull_requests"]
    pr_fks = [(fk.parent.name, fk.target_fullname) for fk in pr_table.foreign_keys]
    assert ("repository_id", "repositories.id") in pr_fks

    commit_table = Base.metadata.tables["commits"]
    commit_fks = [(fk.parent.name, fk.target_fullname) for fk in commit_table.foreign_keys]
    assert ("repository_id", "repositories.id") in commit_fks

    analysis_table = Base.metadata.tables["analyses"]
    analysis_fks = [(fk.parent.name, fk.target_fullname) for fk in analysis_table.foreign_keys]
    assert ("pull_request_id", "pull_requests.id") in analysis_fks

    finding_table = Base.metadata.tables["findings"]
    finding_fks = [(fk.parent.name, fk.target_fullname) for fk in finding_table.foreign_keys]
    assert ("analysis_id", "analyses.id") in finding_fks

    review_table = Base.metadata.tables["reviews"]
    review_fks = [(fk.parent.name, fk.target_fullname) for fk in review_table.foreign_keys]
    assert ("analysis_id", "analyses.id") in review_fks

    ca_table = Base.metadata.tables["commit_analyses"]
    ca_fks = [(fk.parent.name, fk.target_fullname) for fk in ca_table.foreign_keys]
    assert ("commit_id", "commits.id") in ca_fks


def test_unique_constraints():
    users_table = Base.metadata.tables["users"]
    user_uq_names = {uq.name for uq in users_table.constraints if hasattr(uq, 'columns')}
    assert "uq_users_github_user_id" in user_uq_names
    assert "uq_users_github_login" in user_uq_names

    review_table = Base.metadata.tables["reviews"]
    review_uq_names = {uq.name for uq in review_table.constraints if hasattr(uq, 'columns')}
    assert "uq_reviews_analysis_id" in review_uq_names


def test_relationships():
    user = User()
    assert hasattr(user, "repositories")
    
    repo = Repository()
    assert hasattr(repo, "user")
    assert hasattr(repo, "pull_requests")
    assert hasattr(repo, "commits")
    
    pr = PullRequest()
    assert hasattr(pr, "repository")
    assert hasattr(pr, "analyses")
    assert hasattr(pr, "commits")
    
    commit = Commit()
    assert hasattr(commit, "repository")
    assert hasattr(commit, "pull_requests")
    assert hasattr(commit, "commit_analyses")
    
    analysis = Analysis()
    assert hasattr(analysis, "pull_request")
    assert hasattr(analysis, "findings")
    assert hasattr(analysis, "review")
    
    finding = Finding()
    assert hasattr(finding, "analysis")
    
    review = Review()
    assert hasattr(review, "analysis")
    
    commit_analysis = CommitAnalysis()
    assert hasattr(commit_analysis, "commit")
