import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth import ReviewerContext, get_verified_reviewer
from app.db.session import get_db
from app.schemas.security_assumption import (
    AssumptionChangeList,
    AssumptionChangeRead,
    AssumptionDecisionRead,
    AssumptionDecisionRequest,
    SecurityAssumptionList,
    SecurityAssumptionRead,
)
from app.services.security_assumption_service import security_assumption_service

router = APIRouter(tags=["Security Assumptions"])


@router.get("/repositories/{repository_id}/security-assumptions", response_model=SecurityAssumptionList)
def list_repository_security_assumptions(
    repository_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    reviewer: ReviewerContext = Depends(get_verified_reviewer),
):
    items, total = security_assumption_service.list_repository_assumptions(db, repository_id, reviewer, page, page_size)
    return SecurityAssumptionList(items=items, page=page, page_size=page_size, total=total)


@router.get("/security-assumptions/{assumption_id}", response_model=SecurityAssumptionRead)
def get_security_assumption(
    assumption_id: uuid.UUID,
    db: Session = Depends(get_db),
    reviewer: ReviewerContext = Depends(get_verified_reviewer),
):
    return security_assumption_service.get_assumption(db, assumption_id, reviewer)


@router.get("/analyses/{analysis_id}/security-assumption-changes", response_model=AssumptionChangeList)
def list_security_assumption_changes(
    analysis_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    reviewer: ReviewerContext = Depends(get_verified_reviewer),
):
    items, total, run = security_assumption_service.list_changes(db, analysis_id, reviewer, page, page_size)
    return AssumptionChangeList(
        items=items, page=page, page_size=page_size, total=total,
        extraction_status=run.status if run else None,
        context_file_count=run.context_file_count if run else 0,
        validated_evidence_count=run.validated_evidence_count if run else 0,
        provider=run.provider if run else None,
        model=run.model if run else None,
        fallback_used=run.fallback_used if run else False,
        latency_ms=run.latency_ms if run else 0,
        retry_count=run.retry_count if run else 0,
        token_usage=run.token_usage if run else None,
        failure_code=run.failure_code if run else None,
    )


@router.get("/security-assumption-changes/{change_id}", response_model=AssumptionChangeRead)
def get_security_assumption_change(
    change_id: uuid.UUID,
    db: Session = Depends(get_db),
    reviewer: ReviewerContext = Depends(get_verified_reviewer),
):
    return security_assumption_service.get_change(db, change_id, reviewer)


@router.post(
    "/security-assumption-changes/{change_id}/decision",
    response_model=AssumptionDecisionRead,
    description=(
        "Actions record a human review of the assumption change and never rewrite its classification. "
        "ACCEPT_RISK records an explicit risk acceptance; MARK_RESOLVED records a human resolution. "
        "APPROVE does not approve the pull request itself."
    ),
)
def decide_security_assumption_change(
    change_id: uuid.UUID,
    payload: AssumptionDecisionRequest,
    db: Session = Depends(get_db),
    reviewer: ReviewerContext = Depends(get_verified_reviewer),
):
    try:
        return security_assumption_service.decide(db, change_id, payload, reviewer)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
