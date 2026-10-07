import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db
from app.schemas.analysis import AnalysisRead
from app.services.analysis_service import analysis_service

router = APIRouter(prefix="/analyses", tags=["Analyses"])


@router.get(
    "/{analysis_id}",
    response_model=AnalysisRead,
    summary="Get analysis status/details",
    description="Return analysis execution details stored in the database.",
)
def get_analysis(
    analysis_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> AnalysisRead:
    return analysis_service.get_analysis_by_id(db=db, analysis_id=analysis_id)

@router.post(
    "/commits/{sha}",
    response_model=AnalysisRead,
    summary="Trigger analysis for a commit",
)
async def trigger_commit_analysis(
    sha: str,
    pull_request_id: uuid.UUID,
    installation_id: int,
    db: Session = Depends(get_db),
) -> AnalysisRead:
    from app.models.pull_request import PullRequest
    from app.models.analysis import Analysis, AnalysisStatus, AnalysisTrigger
    from app.services.ai.service import ai_analysis_service
    from fastapi import HTTPException
    import asyncio

    pr = db.scalar(select(PullRequest).where(PullRequest.id == pull_request_id))
    if not pr:
        raise HTTPException(status_code=404, detail="Pull request not found")

    # Check if analysis already exists
    existing = db.scalar(
        select(Analysis)
        .where(Analysis.pull_request_id == pull_request_id)
        .where(Analysis.head_sha == sha)
        .where(Analysis.status.in_([AnalysisStatus.COMPLETED, AnalysisStatus.RUNNING, AnalysisStatus.QUEUED]))
    )
    if existing:
        return AnalysisRead.model_validate(existing)

    analysis = Analysis(
        pull_request_id=pull_request_id,
        head_sha=sha,
        status=AnalysisStatus.QUEUED,
        trigger_type=AnalysisTrigger.MANUAL
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    # Helper to run background analysis with managed DB session lifecycle
    async def _run_bg_analysis(analysis_uuid: uuid.UUID, inst_id: int, bind_engine):
        bg_db = Session(bind_engine)
        try:
            await ai_analysis_service.run_analysis(db=bg_db, analysis_id=analysis_uuid, installation_id=inst_id)
        finally:
            bg_db.close()

    # Trigger background analysis
    asyncio.create_task(_run_bg_analysis(analysis.id, installation_id, db.get_bind()))

    return AnalysisRead.model_validate(analysis)


