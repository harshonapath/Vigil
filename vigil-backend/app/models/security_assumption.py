import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, JSON
from sqlalchemy.dialects.mssql import UNIQUEIDENTIFIER
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _now():
    return datetime.now(timezone.utc)


class SecurityAssumption(Base):
    """Stable repository-scoped identity for a security invariant."""

    __tablename__ = "security_assumptions"
    __table_args__ = (
        UniqueConstraint("repository_id", "identity_key", name="uq_security_assumptions_identity"),
        Index("ix_security_assumptions_repository_category", "repository_id", "category"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(UNIQUEIDENTIFIER, ForeignKey("repositories.id"), nullable=False)
    identity_key: Mapped[str] = mapped_column(String(64), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    subject: Mapped[str] = mapped_column(String(512), nullable=False)
    security_property: Mapped[str] = mapped_column(String(512), nullable=False)
    scope: Mapped[str] = mapped_column(String(512), nullable=False)
    current_status: Mapped[str] = mapped_column(String(32), nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now, onupdate=_now)
    versions: Mapped[list["SecurityAssumptionVersion"]] = relationship(
        "SecurityAssumptionVersion", back_populates="assumption", order_by="SecurityAssumptionVersion.created_at.desc()"
    )


class SecurityAssumptionVersion(Base):
    """Immutable, evidence-backed observation at one analysis SHA."""

    __tablename__ = "security_assumption_versions"
    __table_args__ = (
        UniqueConstraint("assumption_id", "analysis_id", name="uq_assumption_versions_analysis"),
        Index("ix_assumption_versions_analysis", "analysis_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    assumption_id: Mapped[uuid.UUID] = mapped_column(UNIQUEIDENTIFIER, ForeignKey("security_assumptions.id"), nullable=False)
    analysis_id: Mapped[uuid.UUID] = mapped_column(UNIQUEIDENTIFIER, ForeignKey("analyses.id"), nullable=False)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    scope: Mapped[str] = mapped_column(String(512), nullable=False)
    confidence: Mapped[float] = mapped_column(nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    potential_impact: Mapped[str] = mapped_column(Text, nullable=False)
    # E1 is direct, validated code evidence; E2 requires evidence across files.
    # The extraction-only path cannot claim E3/E4 without executed checks.
    evidence_strength: Mapped[str] = mapped_column(String(2), nullable=False, default="E1")
    head_sha: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now)
    evidence: Mapped[list["SecurityAssumptionEvidence"]] = relationship("SecurityAssumptionEvidence", cascade="all, delete-orphan")
    assumption: Mapped[SecurityAssumption] = relationship("SecurityAssumption", back_populates="versions")


class SecurityAssumptionEvidence(Base):
    """Immutable source excerpt verified at the cited SHA and line range."""

    __tablename__ = "security_assumption_evidence"
    __table_args__ = (Index("ix_assumption_evidence_version", "version_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    version_id: Mapped[uuid.UUID] = mapped_column(UNIQUEIDENTIFIER, ForeignKey("security_assumption_versions.id"), nullable=False)
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    symbol: Mapped[str | None] = mapped_column(String(512), nullable=True)
    start_line: Mapped[int] = mapped_column(Integer, nullable=False)
    end_line: Mapped[int] = mapped_column(Integer, nullable=False)
    excerpt: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_type: Mapped[str] = mapped_column(String(32), nullable=False)
    commit_sha: Mapped[str] = mapped_column(String(40), nullable=False)
    validation_status: Mapped[str] = mapped_column(String(32), nullable=False, default="VERIFIED")


class SecurityAssumptionChange(Base):
    """Immutable comparison result; NOT_OBSERVED never implies safe or resolved."""

    __tablename__ = "security_assumption_changes"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_assumption_changes_idempotency"),
        Index("ix_assumption_changes_analysis", "analysis_id"),
        Index("ix_assumption_changes_repository_classification", "repository_id", "classification"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    repository_id: Mapped[uuid.UUID] = mapped_column(UNIQUEIDENTIFIER, ForeignKey("repositories.id"), nullable=False)
    analysis_id: Mapped[uuid.UUID] = mapped_column(UNIQUEIDENTIFIER, ForeignKey("analyses.id"), nullable=False)
    assumption_id: Mapped[uuid.UUID | None] = mapped_column(UNIQUEIDENTIFIER, ForeignKey("security_assumptions.id"), nullable=True)
    prior_version_id: Mapped[uuid.UUID | None] = mapped_column(UNIQUEIDENTIFIER, ForeignKey("security_assumption_versions.id"), nullable=True)
    new_version_id: Mapped[uuid.UUID | None] = mapped_column(UNIQUEIDENTIFIER, ForeignKey("security_assumption_versions.id"), nullable=True)
    classification: Mapped[str] = mapped_column(String(40), nullable=False)
    impact_summary: Mapped[str] = mapped_column(Text, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(24), nullable=False, default="UNASSESSED")
    blast_radius_status: Mapped[str] = mapped_column(String(32), nullable=False, default="INSUFFICIENT_EVIDENCE")
    blast_radius_items: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    confidence: Mapped[float] = mapped_column(nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now)
    prior_version: Mapped[SecurityAssumptionVersion | None] = relationship(
        "SecurityAssumptionVersion", foreign_keys=[prior_version_id]
    )
    new_version: Mapped[SecurityAssumptionVersion | None] = relationship(
        "SecurityAssumptionVersion", foreign_keys=[new_version_id]
    )
    decisions: Mapped[list["SecurityAssumptionDecision"]] = relationship(
        "SecurityAssumptionDecision", order_by="SecurityAssumptionDecision.expected_version", lazy="selectin"
    )

    @property
    def decision_version(self) -> int:
        return len(self.decisions)

    @property
    def review_status(self) -> str:
        return self.decisions[-1].decision if self.decisions else "PENDING"


class SecurityAssumptionDecision(Base):
    """Append-only reviewer decision audit trail."""

    __tablename__ = "security_assumption_decisions"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_assumption_decisions_idempotency"),
        UniqueConstraint("change_id", "expected_version", name="uq_assumption_decisions_change_version"),
        Index("ix_assumption_decisions_change", "change_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    change_id: Mapped[uuid.UUID] = mapped_column(UNIQUEIDENTIFIER, ForeignKey("security_assumption_changes.id"), nullable=False)
    reviewer_login: Mapped[str] = mapped_column(String(255), nullable=False)
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    expected_version: Mapped[int] = mapped_column(Integer, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now)


class SecurityAssumptionRun(Base):
    """Extraction outcome and bounded context coverage, including zero-result/failure runs."""

    __tablename__ = "security_assumption_runs"
    __table_args__ = (UniqueConstraint("analysis_id", name="uq_assumption_runs_analysis"),)

    id: Mapped[uuid.UUID] = mapped_column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    analysis_id: Mapped[uuid.UUID] = mapped_column(UNIQUEIDENTIFIER, ForeignKey("analyses.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    context_file_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    context_char_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    candidate_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    validated_candidate_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rejected_candidate_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    validated_evidence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fallback_used: Mapped[bool] = mapped_column(nullable=False, default=False)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    token_usage: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    failure_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now)
