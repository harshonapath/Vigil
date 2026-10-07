from datetime import datetime
from typing import Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field


class AssumptionEvidenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    path: str
    symbol: Optional[str] = None
    start_line: int
    end_line: int
    excerpt: str
    evidence_type: str
    commit_sha: str
    validation_status: str


class AssumptionVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    analysis_id: uuid.UUID
    statement: str
    category: str
    scope: str
    confidence: float
    rationale: str
    potential_impact: str
    evidence_strength: str
    head_sha: str
    created_at: datetime
    evidence: list[AssumptionEvidenceRead] = Field(default_factory=list)


class AssumptionChangeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    repository_id: uuid.UUID
    analysis_id: uuid.UUID
    assumption_id: Optional[uuid.UUID] = None
    prior_version_id: Optional[uuid.UUID] = None
    new_version_id: Optional[uuid.UUID] = None
    classification: str
    impact_summary: str
    risk_level: str
    blast_radius_status: str
    blast_radius_items: list[str] = Field(default_factory=list)
    confidence: float
    review_status: str
    decision_version: int
    created_at: datetime
    prior_version: Optional[AssumptionVersionRead] = None
    new_version: Optional[AssumptionVersionRead] = None
    decisions: list["AssumptionDecisionRead"] = Field(default_factory=list)


class AssumptionChangeList(BaseModel):
    items: list[AssumptionChangeRead]
    page: int
    page_size: int
    total: int
    extraction_status: Optional[str] = None
    context_file_count: int = 0
    validated_evidence_count: int = 0
    provider: Optional[str] = None
    model: Optional[str] = None
    fallback_used: bool = False
    latency_ms: int = 0
    retry_count: int = 0
    token_usage: Optional[dict] = None
    failure_code: Optional[str] = None


class AssumptionDecisionRequest(BaseModel):
    decision: str = Field(pattern="^(APPROVE|REQUEST_CHANGES|ACCEPT_RISK|DISMISS|MARK_RESOLVED)$")
    expected_version: int = Field(ge=0)
    idempotency_key: str = Field(min_length=8, max_length=128)
    comment: Optional[str] = Field(default=None, max_length=4000)


class AssumptionDecisionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    change_id: uuid.UUID
    reviewer_login: str
    decision: str
    expected_version: int
    idempotency_key: str
    comment: Optional[str] = None
    created_at: datetime


class SecurityAssumptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    repository_id: uuid.UUID
    category: str
    subject: str
    security_property: str
    scope: str
    current_status: str
    created_at: datetime
    updated_at: datetime
    versions: list[AssumptionVersionRead] = Field(default_factory=list)


class SecurityAssumptionList(BaseModel):
    items: list[SecurityAssumptionRead]
    page: int
    page_size: int
    total: int
