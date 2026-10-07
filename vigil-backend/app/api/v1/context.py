import uuid
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.auth import ReviewerContext, get_current_reviewer
from app.db.session import get_db
from app.models.repository import Repository
from app.integrations.repolens import repository_context_service

router = APIRouter(tags=["Context"])

class ContextStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    repository: str
    commit_sha: Optional[str] = None
    generated_at: Optional[str] = None
    schema_version: Optional[str] = None
    repolens_version: Optional[str] = None
    file_count: int = 0
    symbol_count: int = 0

@router.get(
    "/context/repositories/{repository_id}",
    response_model=ContextStatusResponse,
    status_code=status.HTTP_200_OK,
)
async def get_context_status(
    repository_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> ContextStatusResponse:
    repo = db.scalar(select(Repository).where(Repository.id == repository_id))
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    context = repository_context_service.get_context(repo.full_name)
    if not context:
        return ContextStatusResponse(repository=repo.full_name)

    symbol_count = sum(len(f.symbols) for f in context.files.values())
    return ContextStatusResponse(
        repository=context.repository,
        commit_sha=context.commit_sha,
        generated_at=context.generated_at,
        schema_version=context.context_schema_version,
        repolens_version=context.repolens_version,
        file_count=len(context.files),
        symbol_count=symbol_count
    )

@router.post(
    "/context/repositories/{repository_id}/generate",
    status_code=status.HTTP_202_ACCEPTED,
)
async def generate_context(
    repository_id: uuid.UUID,
    sha: str = Query(..., description="Commit SHA to generate context for"),
    installation_id: int = Query(..., description="GitHub App Installation ID"),
    db: Session = Depends(get_db),
    reviewer: ReviewerContext = Depends(get_current_reviewer),
):
    repo = db.scalar(select(Repository).where(Repository.id == repository_id))
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Perform asynchronously if possible, or synchronously for now but in real world it should be async.
    # In FastAPI we can just await it since we are async.
    try:
        await repository_context_service.generate_initial_context(
            installation_id=installation_id,
            owner=repo.owner_login,
            repo=repo.name,
            sha=sha
        )
        return {"status": "accepted", "message": "Context generation completed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post(
    "/context/repositories/{repository_id}/rebuild",
    status_code=status.HTTP_202_ACCEPTED,
)
async def rebuild_context(
    repository_id: uuid.UUID,
    sha: str = Query(..., description="Commit SHA to rebuild context for"),
    installation_id: int = Query(..., description="GitHub App Installation ID"),
    db: Session = Depends(get_db),
    reviewer: ReviewerContext = Depends(get_current_reviewer),
):
    repo = db.scalar(select(Repository).where(Repository.id == repository_id))
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    try:
        # Rebuild is just generate from scratch
        await repository_context_service.generate_initial_context(
            installation_id=installation_id,
            owner=repo.owner_login,
            repo=repo.name,
            sha=sha
        )
        return {"status": "accepted", "message": "Context rebuild completed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

