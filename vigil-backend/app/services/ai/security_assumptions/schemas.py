from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.config import settings
from app.services.ai.review.schemas import FindingConfidence, FindingSeverity


class AssumptionScope(str, Enum):
    """Scope/domain where a security or behavioral assumption applies."""

    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    INPUT = "input"
    VALIDATION = "validation"
    ENDPOINT = "endpoint"
    STATE = "state"
    DATABASE = "database"
    EXTERNAL_SERVICE = "external_service"
    TRUST_BOUNDARY = "trust_boundary"


class AssumptionChangeType(str, Enum):
    """Type of transition observed for a security assumption in a pull request."""

    INTRODUCED = "INTRODUCED"
    STRENGTHENED = "STRENGTHENED"
    WEAKENED = "WEAKENED"
    REMOVED = "REMOVED"
    CHANGED = "CHANGED"
    CONTRADICTED = "CONTRADICTED"


class SecurityAssumption(BaseModel):
    """Structured internal representation of a discovered security or behavioral assumption."""

    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., description="Unique or descriptive identifier for the assumption")
    scope: AssumptionScope = Field(..., description="Domain/scope of the assumption")
    target: str = Field(..., description="Function name, route path, model field, or entity being governed")
    expected_value: Any = Field(..., description="Assumed requirement, type, constraint, or condition")
    source_file: str = Field(..., description="File path where assumption was extracted")
    source_line: Optional[int] = Field(default=None, description="Line number of assumption definition")
    confidence: FindingConfidence = Field(default=FindingConfidence.HIGH, description="Confidence rating")
    evidence: str = Field(..., description="Exact code or syntax demonstrating the assumption")
    description: Optional[str] = Field(default=None, description="Human-readable summary of the assumption")


class SecurityAssumptionDetectionResult(BaseModel):
    """Result of comparing before/after security assumptions."""

    model_config = ConfigDict(extra="ignore")

    detected: bool = False
    severity: FindingSeverity = FindingSeverity.MEDIUM
    confidence: FindingConfidence = FindingConfidence.HIGH
    title: str = ""
    file_path: str = ""
    line_number: Optional[int] = None
    assumption_name: str = ""
    scope: str = ""
    previous_assumption: str = ""
    new_assumption: str = ""
    change_type: AssumptionChangeType = AssumptionChangeType.CHANGED
    potential_repercussions: str = ""
    problem: str = ""
    why: str = ""
    evidence: Optional[str] = None
    suggestion: str = ""
class AssumptionCategory(str, Enum):
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    INPUT_TRUST = "input_trust"
    DATA_INTEGRITY = "data_integrity"
    DEPENDENCY_CALL_CHAIN = "dependency_call_chain"
    SECURITY_BOUNDARY = "security_boundary"
    SECRETS_SENSITIVE_DATA = "secrets_sensitive_data"
    ENVIRONMENT_DEPLOYMENT = "environment_deployment"


class EvidenceType(str, Enum):
    CODE = "CODE"
    DIFF = "DIFF"
    TEST = "TEST"
    CONFIGURATION = "CONFIGURATION"
    DOCUMENTATION = "DOCUMENTATION"


class ChangeAssessment(str, Enum):
    CHANGED = "CHANGED"
    POTENTIALLY_INVALIDATED = "POTENTIALLY_INVALIDATED"


class SecurityAssumptionEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file_path: str = Field(min_length=1, max_length=1024)
    symbol: Optional[str] = Field(default=None, max_length=512)
    start_line: int = Field(ge=1)
    end_line: int = Field(ge=1)
    excerpt: str = Field(min_length=1, max_length=12_000)
    evidence_type: EvidenceType
    commit_sha: str = Field(min_length=7, max_length=64)


class AssumptionIdentityHints(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: str = Field(min_length=1, max_length=512)
    security_property: str = Field(min_length=1, max_length=512)
    protected_relationship: Optional[str] = Field(default=None, max_length=512)
    operation_boundary: Optional[str] = Field(default=None, max_length=512)


class SecurityAssumptionCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    statement: str = Field(min_length=8, max_length=2000)
    category: AssumptionCategory
    scope: str = Field(min_length=1, max_length=512)
    affected_symbol: Optional[str] = Field(default=None, max_length=512)
    file_path: str = Field(min_length=1, max_length=1024)
    evidence: List[SecurityAssumptionEvidence] = Field(default_factory=list, max_length=8)
    rationale: str = Field(min_length=1, max_length=4000)
    confidence: float = Field(ge=0.0, le=1.0)
    potential_impact: str = Field(min_length=1, max_length=4000)
    identity_hints: AssumptionIdentityHints
    # Model assessment is retained only as a cautious signal; the service
    # requires a baseline plus independently validated evidence to apply it.
    change_assessment: ChangeAssessment = ChangeAssessment.CHANGED

    @field_validator("file_path")
    @classmethod
    def require_relative_path(cls, value: str) -> str:
        path = value.replace("\\", "/").strip()
        if path.startswith("/") or any(part in ("", ".", "..") for part in path.split("/")):
            raise ValueError("file_path must be a normalized relative repository path")
        return path


class SecurityAssumptionExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assumptions: List[SecurityAssumptionCandidate] = Field(
        default_factory=list,
        max_length=settings.SECURITY_ASSUMPTIONS_MAX_ITEMS,
    )


class SourceFileAtCommit(BaseModel):
    """Trusted backend-fetched source used to check model-proposed evidence."""

    model_config = ConfigDict(extra="forbid")

    file_path: str = Field(min_length=1, max_length=1024)
    commit_sha: str = Field(min_length=7, max_length=64)
    content: str = Field(max_length=settings.SECURITY_ASSUMPTIONS_MAX_CONTEXT_CHARS)


class SecurityAssumptionContext(BaseModel):
    """Bounded extraction context; file contents must be fetched by the backend."""

    model_config = ConfigDict(extra="forbid")

    repository: str = Field(min_length=1, max_length=512)
    base_sha: str = Field(min_length=7, max_length=64)
    head_sha: str = Field(min_length=7, max_length=64)
    pull_request_number: Optional[int] = Field(default=None, ge=1)
    changed_paths: List[str] = Field(default_factory=list, max_length=500)
    relevant_context: str = Field(default="", max_length=settings.SECURITY_ASSUMPTIONS_MAX_CONTEXT_CHARS)
    prior_assumptions: List[str] = Field(default_factory=list, max_length=200)
    source_files: List[SourceFileAtCommit] = Field(default_factory=list, max_length=500)

    @model_validator(mode="after")
    def enforce_context_budget(self):
        total = (
            sum(len(f.content) for f in self.source_files)
            + len(self.relevant_context)
            + sum(len(item) for item in self.prior_assumptions)
            + sum(len(item) for item in self.changed_paths)
        )
        if total > settings.SECURITY_ASSUMPTIONS_MAX_CONTEXT_CHARS:
            raise ValueError("security assumption context exceeds configured character budget")
        return self


class CandidateValidationIssue(BaseModel):
    index: int
    reason: str
    state: str = "INSUFFICIENT_EVIDENCE"


class SecurityAssumptionResult(BaseModel):
    """Backend-validated extraction result; identifiers come only from context."""

    repository: str
    base_sha: str
    head_sha: str
    status: str
    candidates: List[SecurityAssumptionCandidate] = Field(default_factory=list)
    rejected: List[CandidateValidationIssue] = Field(default_factory=list)
    duplicate_indexes: List[List[int]] = Field(default_factory=list)
    conflicting_indexes: List[List[int]] = Field(default_factory=list)
    model: Optional[str] = None
    provider: Optional[str] = None
    fallback_used: bool = False
    token_usage: Optional[dict] = None
    latency_ms: int = 0
    retry_count: int = 0
    error: Optional[str] = None
