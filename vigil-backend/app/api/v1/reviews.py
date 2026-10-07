from typing import Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import ReviewerContext, get_current_reviewer
from app.db.session import get_db
from app.schemas.ai_review import AIReviewRequest, AIReviewResponse
from app.schemas.review import ReviewRead
from app.services.review_service import review_service

router = APIRouter(tags=["Reviews"])


@router.get(
    "/pull-requests/{pull_request_id}/review",
    response_model=ReviewRead,
    summary="Get review for a pull request",
    description="Return the latest generated review for a pull request.",
)
def get_pull_request_review(
    pull_request_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> ReviewRead:
    return review_service.get_review_for_pull_request(db=db, pull_request_id=pull_request_id)


@router.post(
    "/pull-requests/{pull_request_id}/ai-review",
    response_model=AIReviewResponse,
    summary="Trigger AI code review for a pull request",
    description="Executes a structured, evidence-grounded AI review on the specified pull request.",
)
async def create_pull_request_ai_review(
    pull_request_id: uuid.UUID,
    payload: Optional[AIReviewRequest] = None,
    db: Session = Depends(get_db),
    reviewer: ReviewerContext = Depends(get_current_reviewer),
) -> AIReviewResponse:
    req = payload or AIReviewRequest()
    return await review_service.execute_ai_review(
        db=db,
        pull_request_id=pull_request_id,
        custom_instructions=req.custom_instructions,
        persist=req.persist,
        analysis_id=req.analysis_id,
        changed_files=req.changed_files,
        scanner_findings=req.scanner_findings,
        repository_structure=req.repository_structure,
        review_depth=req.review_depth,
    )


@router.post(
    "/reviews/{review_id}/publish",
    response_model=ReviewRead,
    summary="Publish review to GitHub",
    description="Publish verified findings as a GitHub pull request review.",
)
async def publish_review(
    review_id: uuid.UUID,
    db: Session = Depends(get_db),
    reviewer: ReviewerContext = Depends(get_current_reviewer),
) -> ReviewRead:
    return await review_service.publish_review(db=db, review_id=review_id)

