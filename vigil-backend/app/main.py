from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.analyses import router as analyses_router
from app.api.v1.auth import router as auth_router
from app.api.v1.commits import router as commits_router
from app.api.v1.finding_verification import router as finding_verification_router
from app.api.v1.findings import router as findings_router
from app.api.v1.findings_queue import router as findings_queue_router
from app.api.v1.github import router as github_router
from app.api.v1.github_status import router as github_status_router
from app.api.v1.health import router as health_router
from app.api.v1.pull_requests import router as pull_requests_router
from app.api.v1.repositories import router as repositories_router
from app.api.v1.review_queue import router as review_queue_router
from app.api.v1.sync import router as sync_router
from app.api.v1.context import router as context_router
from app.api.v1.reviews import router as reviews_router
from app.api.v1.security_assumptions import router as security_assumptions_router
from app.core.config import settings
from app.core.exception_handlers import vigil_exception_handler
from app.core.exceptions import VigilException
from app.core.logging_config import logger, setup_logging


from app.db.base import Base
from app.db.session import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    Base.metadata.create_all(bind=engine)
    logger.info("VIGIL Backend started")
    yield
    logger.info("VIGIL Backend shutting down")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Exception handlers
app.add_exception_handler(VigilException, vigil_exception_handler)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Root Endpoint
@app.get("/", tags=["Root"])
def read_root() -> dict[str, str]:
    """Root endpoint to confirm that the Vigil backend is running."""
    return {"message": "Vigil backend is running", "version": settings.APP_VERSION}


# Register API v1 Routers under /api/v1
api_v1_prefix = "/api/v1"

app.include_router(auth_router, prefix=api_v1_prefix)
app.include_router(repositories_router, prefix=api_v1_prefix)
app.include_router(pull_requests_router, prefix=api_v1_prefix)
app.include_router(analyses_router, prefix=api_v1_prefix)
app.include_router(commits_router, prefix=api_v1_prefix)
app.include_router(reviews_router, prefix=api_v1_prefix)
app.include_router(security_assumptions_router, prefix=api_v1_prefix)
# Phase 6: findings_queue BEFORE findings to avoid /findings/queue matching /{id}
app.include_router(findings_queue_router, prefix=api_v1_prefix)
app.include_router(findings_router, prefix=api_v1_prefix)
app.include_router(finding_verification_router, prefix=api_v1_prefix)
app.include_router(review_queue_router, prefix=api_v1_prefix)
app.include_router(github_router, prefix=api_v1_prefix)
app.include_router(github_status_router, prefix=api_v1_prefix)
app.include_router(sync_router, prefix=api_v1_prefix)
app.include_router(context_router, prefix=api_v1_prefix)
app.include_router(health_router, prefix=api_v1_prefix)
