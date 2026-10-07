import uuid
import pytest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.session import engine as registered_sqlite_engine  # registers SQLite UUID compilation
from app.models import Analysis, PullRequest, Repository, User
from app.core.auth import ReviewerContext
from app.core.exceptions import ForbiddenException
from app.schemas.security_assumption import AssumptionChangeRead, AssumptionDecisionRequest
from app.models.security_assumption import (
    SecurityAssumption,
    SecurityAssumptionVersion,
    SecurityAssumptionEvidence,
    SecurityAssumptionChange,
    SecurityAssumptionRun,
)
from app.services.security_assumption_service import assumption_identity_key, security_assumption_service
from app.services.ai.security_assumptions.schemas import (
    AssumptionCategory,
    AssumptionIdentityHints,
    EvidenceType,
    SecurityAssumptionCandidate,
    SecurityAssumptionEvidence as CandidateEvidence,
    SecurityAssumptionResult,
)


def _db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return engine


def test_composite_identity_ignores_statement_paraphrase_but_includes_property_and_scope():
    key = assumption_identity_key("authentication", "user.id", "authenticated principal", "orders.create")
    assert key == assumption_identity_key("AUTHENTICATION", "User ID", "authenticated-principal", "orders create")
    assert key != assumption_identity_key("authentication", "user.id", "caller supplied", "orders.create")
    assert key != assumption_identity_key("authentication", "user.id", "authenticated principal", "orders.read")


@pytest.mark.asyncio
async def test_persist_extraction_is_idempotent_and_records_verified_evidence(monkeypatch):
    engine = _db()
    with Session(engine) as db:
        user = User(github_user_id=44, github_login="owner", is_active=True)
        db.add(user)
        db.flush()
        repository = Repository(
            user_id=user.id, github_repo_id=55, owner_login="owner", name="repo",
            full_name="owner/repo", default_branch="main", private=True,
            html_url="https://github.com/owner/repo", is_active=True,
        )
        db.add(repository)
        db.flush()
        pr = PullRequest(
            repository_id=repository.id, github_pr_id=66, pr_number=7, title="test", author_login="author",
            source_branch="feature", target_branch="main", head_sha="b" * 40, base_sha="a" * 40,
            status="OPEN",
        )
        db.add(pr)
        db.flush()
        analysis = Analysis(
            pull_request_id=pr.id, head_sha=pr.head_sha, status="RUNNING", trigger_type="MANUAL",
        )
        db.add(analysis)
        db.flush()
        candidate = SecurityAssumptionCandidate(
            statement="User identity comes from the authenticated principal.",
            category=AssumptionCategory.AUTHENTICATION,
            scope="orders.create",
            file_path="app/orders.py",
            evidence=[CandidateEvidence(
                file_path="app/orders.py", start_line=1, end_line=1,
                excerpt="user_id = request.user.id", evidence_type=EvidenceType.CODE,
                commit_sha=pr.head_sha,
            )],
            rationale="The route derives the user id from the authenticated request context.",
            confidence=0.9,
            potential_impact="A caller-controlled identity source could weaken ownership checks.",
            identity_hints=AssumptionIdentityHints(
                subject="user.id", security_property="authenticated principal", operation_boundary="orders.create",
            ),
        )
        result = SecurityAssumptionResult(
            repository=repository.full_name, base_sha=pr.base_sha, head_sha=pr.head_sha,
            status="COMPLETED", candidates=[candidate], provider="groq", model="openai/gpt-oss-120b",
        )
        first = security_assumption_service.persist_extraction(db, analysis, result, context_file_count=1, context_char_count=100)
        second = security_assumption_service.persist_extraction(db, analysis, result, context_file_count=1, context_char_count=100)

        assert len(first) == len(second) == 1
        assert db.scalar(select(SecurityAssumptionRun).where(SecurityAssumptionRun.analysis_id == analysis.id)).status == "COMPLETED"
        assert len(db.scalars(select(SecurityAssumption)).all()) == 1
        assert len(db.scalars(select(SecurityAssumptionVersion)).all()) == 1
        stored_evidence = db.scalars(select(SecurityAssumptionEvidence)).one()
        assert stored_evidence.validation_status == "VERIFIED"
        assert stored_evidence.commit_sha == pr.head_sha
        version = db.scalars(select(SecurityAssumptionVersion)).one()
        assert version.evidence_strength == "E1"
        assert db.scalars(select(SecurityAssumptionChange)).one().classification == "NEW"

        reviewer = ReviewerContext("owner")
        changes, total, run = security_assumption_service.list_changes(db, analysis.id, reviewer, 1, 20)
        assert total == 1 and run.status == "COMPLETED"
        detail = security_assumption_service.get_change(db, changes[0].id, reviewer)
        assert detail.new_version.evidence[0].commit_sha == pr.head_sha
        assumptions, assumption_total = security_assumption_service.list_repository_assumptions(
            db, repository.id, reviewer, 1, 20
        )
        assert assumption_total == 1 and assumptions[0].versions[0].evidence_strength == "E1"
        assert security_assumption_service.get_assumption(db, assumptions[0].id, reviewer).id == assumptions[0].id

        payload = AssumptionDecisionRequest(
            decision="APPROVE", expected_version=0, idempotency_key="decision-key-0001",
        )
        decision = security_assumption_service.decide(db, changes[0].id, payload, reviewer)
        assert decision.decision == "APPROVE"
        assert security_assumption_service.decide(db, changes[0].id, payload, reviewer).id == decision.id
        refreshed = security_assumption_service.get_change(db, changes[0].id, reviewer)
        assert refreshed.review_status == "APPROVE" and refreshed.decision_version == 1
        assert refreshed.classification == "NEW"  # reviewer actions preserve analysis history
        api_change = AssumptionChangeRead.model_validate(refreshed)
        assert [decision.decision for decision in api_change.decisions] == ["APPROVE"]
        try:
            security_assumption_service.decide(
                db, changes[0].id,
                AssumptionDecisionRequest(decision="REQUEST_CHANGES", expected_version=0, idempotency_key="decision-key-0002"),
                reviewer,
            )
            assert False, "stale optimistic concurrency version should be rejected"
        except ValueError:
            pass
        try:
            security_assumption_service.get_change(db, changes[0].id, ReviewerContext("other-user"))
            assert False, "cross-repository reviewer should be rejected"
        except ForbiddenException:
            pass

        # A previously analyzed commit can be selected only when GitHub proves
        # it is on the PR base's ancestry; timestamps are not consulted.
        async def compare(*args):
            return {"status": "ahead", "ahead_by": 3}
        monkeypatch.setattr("app.services.security_assumption_service.github_client.compare_commits", compare)
        ancestry = await security_assumption_service.resolve_ancestral_baseline_versions(
            db, repository.id, "d" * 40, 1001, "owner", "repo"
        )
        assert ancestry[version.assumption_id] == version.id

        # A second analysis on a descendant state matches the repository-scoped
        # invariant identity to its exact-base observation and retains both versions.
        pr.base_sha = pr.head_sha
        pr.head_sha = "c" * 40
        next_analysis = Analysis(
            pull_request_id=pr.id, head_sha=pr.head_sha, status="RUNNING", trigger_type="MANUAL",
        )
        db.add(next_analysis)
        db.flush()
        changed_candidate = candidate.model_copy(update={
            "statement": "The user identity is derived from the authenticated caller context.",
            "change_assessment": "POTENTIALLY_INVALIDATED",
            "evidence": [candidate.evidence[0].model_copy(update={
                "commit_sha": pr.head_sha, "excerpt": "user_id = request.body.user_id",
            })],
        })
        next_result = SecurityAssumptionResult(
            repository=repository.full_name, base_sha=pr.base_sha, head_sha=pr.head_sha,
            status="COMPLETED", candidates=[changed_candidate],
        )
        next_changes = security_assumption_service.persist_extraction(db, next_analysis, next_result)
        assert next_changes[0].classification == "POTENTIALLY_INVALIDATED"
        assert next_changes[0].prior_version_id == first[0].new_version_id
        assert len(db.scalars(select(SecurityAssumptionVersion)).all()) == 2
    engine.dispose()
