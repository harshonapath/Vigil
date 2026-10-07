import uuid
import asyncio
import json
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.analysis import Analysis, AnalysisStatus, AnalysisTrigger
from app.models.commit import Commit
from app.models.finding import Finding, FindingStatus, FindingSource
from app.models.security_assumption import SecurityAssumptionRun, SecurityAssumptionVersion
from app.integrations.repolens.service import repository_context_service
from app.services.ai.prompt import AnalysisPromptBuilder
from app.services.ai.provider import get_llm_provider
from app.integrations.github.client import github_client
from app.core.config import settings
from app.core.logging_config import logger
from app.services.ai.gateway import ai_gateway
from app.services.ai.security_assumptions.schemas import SecurityAssumptionContext, SourceFileAtCommit
from app.services.security_assumption_service import security_assumption_service

class AIAnalysisService:
    def __init__(self):
        self.provider = get_llm_provider()

    async def run_analysis(self, db: Session, analysis_id: uuid.UUID, installation_id: int):
        analysis = db.scalar(select(Analysis).where(Analysis.id == analysis_id))
        if not analysis:
            return

        pr = analysis.pull_request
        owner = pr.repository.owner_login
        repo = pr.repository.name

        analysis.status = AnalysisStatus.RUNNING
        analysis.started_at = datetime.now(timezone.utc)
        db.commit()

        try:
            context = repository_context_service.get_context(pr.repository.full_name)
            if not context or context.commit_sha != analysis.head_sha:
                context = await repository_context_service.update_context_for_commit(
                    installation_id=installation_id,
                    owner=owner,
                    repo=repo,
                    sha=analysis.head_sha
                )

            commit_data = await github_client.get_commit(
                installation_id=installation_id,
                owner=owner,
                repo=repo,
                sha=analysis.head_sha
            )
            
            pr_files = []
            for page in range(1, 4):
                page_files = await github_client.get_pull_request_files(
                    installation_id=installation_id,
                    owner=owner,
                    repo=repo,
                    pr_number=pr.pr_number,
                    page=page,
                    per_page=100,
                )
                pr_files.extend(page_files)
                if len(page_files) < 100:
                    break
            diff_files = []
            diff_chars = 0
            for f in pr_files[:30]:
                patch_text = f.get("patch") or "patch unavailable"
                if not isinstance(patch_text, str):
                    patch_text = "patch unavailable"
                remaining = max(0, 16_000 - diff_chars)
                if remaining == 0:
                    break
                bounded_patch = patch_text[:remaining]
                diff_chars += len(bounded_patch)
                diff_files.append({
                    "filename": f.get("filename"),
                    "status": f.get("status"),
                    "additions": f.get("additions"),
                    "deletions": f.get("deletions"),
                    "patch": bounded_patch
                })
            
            commit_info = {
                "sha": analysis.head_sha,
                "message": commit_data.get("commit", {}).get("message"),
                "files": diff_files
            }

            # Security Assumptions run once for this Analysis, using only content
            # fetched from GitHub at the exact head SHA. The source text remains
            # untrusted and is JSON-encoded by the prompt builder.
            try:
                if not db.scalar(select(SecurityAssumptionRun.id).where(
                    SecurityAssumptionRun.analysis_id == analysis.id
                ).limit(1)):
                    source_files = []
                    context_chars = 0
                    candidate_paths = [
                        item.get("filename") for item in pr_files[:30]
                        if isinstance(item, dict)
                        and isinstance(item.get("filename"), str)
                        and item.get("status") != "removed"
                    ]
                    relevant_context = (
                        f"PR title and description (untrusted): {pr.title[:500]}\n{(pr.description or '')[:4000]}\n"
                        f"Commit patches (untrusted): {json.dumps(diff_files, ensure_ascii=True)[:16000]}"
                    )
                    source_budget = max(
                        0,
                        settings.SECURITY_ASSUMPTIONS_MAX_CONTEXT_CHARS
                        - len(relevant_context)
                        - sum(len(path) for path in candidate_paths),
                    )
                    for changed in pr_files[:30]:
                        if not isinstance(changed, dict):
                            continue
                        path = changed.get("filename")
                        if not isinstance(path, str) or changed.get("status") == "removed":
                            continue
                        content = await github_client.get_file_content_at_sha(
                            installation_id=installation_id,
                            owner=owner,
                            repo=repo,
                            path=path,
                            sha=analysis.head_sha,
                        )
                        if content is None or len(content) > source_budget:
                            continue
                        if context_chars + len(content) > source_budget:
                            break
                        source_files.append(SourceFileAtCommit(
                            file_path=path,
                            commit_sha=analysis.head_sha,
                            content=content,
                        ))
                        context_chars += len(content)

                    if source_files:
                        baseline_version_ids = await security_assumption_service.resolve_ancestral_baseline_versions(
                            db,
                            pr.repository_id,
                            pr.base_sha,
                            installation_id,
                            owner,
                            repo,
                        )
                        baseline_versions = db.scalars(select(SecurityAssumptionVersion).where(
                            SecurityAssumptionVersion.id.in_(list(baseline_version_ids.values()))
                        )).all() if baseline_version_ids else []
                        assumption_context = SecurityAssumptionContext(
                            repository=pr.repository.full_name,
                            base_sha=pr.base_sha,
                            head_sha=analysis.head_sha,
                            pull_request_number=pr.pr_number,
                            changed_paths=[item.file_path for item in source_files],
                            relevant_context=relevant_context,
                            prior_assumptions=[
                                f"{version.category} | {version.statement} | scope: {version.scope} | evidence strength: {version.evidence_strength}"
                                for version in baseline_versions
                            ],
                            source_files=source_files,
                        )
                        assumption_result = await ai_gateway.extract_security_assumptions(assumption_context)
                        security_assumption_service.persist_extraction(
                            db, analysis, assumption_result,
                            context_file_count=len(source_files), context_char_count=context_chars,
                            baseline_version_ids=baseline_version_ids,
                        )
                        logger.info(
                            "Security assumptions extraction finished [analysis_id=%s repository_id=%s model=%s candidates=%d rejected=%d status=%s]",
                            analysis.id, pr.repository_id, assumption_result.model,
                            len(assumption_result.candidates), len(assumption_result.rejected), assumption_result.status,
                        )
                    else:
                        from app.services.ai.security_assumptions.schemas import SecurityAssumptionResult
                        insufficient = SecurityAssumptionResult(
                            repository=pr.repository.full_name,
                            base_sha=pr.base_sha,
                            head_sha=analysis.head_sha,
                            status="INSUFFICIENT_EVIDENCE",
                            error="No changed source content could be fetched at the analysis SHA.",
                        )
                        security_assumption_service.persist_extraction(db, analysis, insufficient)
                        logger.warning(
                            "Security assumptions context unavailable [analysis_id=%s repository_id=%s]",
                            analysis.id, pr.repository_id,
                        )
            except Exception as exc:
                db.rollback()
                try:
                    from app.services.ai.security_assumptions.schemas import SecurityAssumptionResult
                    unavailable = SecurityAssumptionResult(
                        repository=pr.repository.full_name,
                        base_sha=pr.base_sha,
                        head_sha=analysis.head_sha,
                        status="UNAVAILABLE",
                        error=type(exc).__name__,
                    )
                    security_assumption_service.persist_extraction(db, analysis, unavailable)
                except Exception:
                    db.rollback()
                logger.warning(
                    "Security assumptions extraction failed [analysis_id=%s failure=%s]",
                    analysis.id, type(exc).__name__,
                )

            prompt = AnalysisPromptBuilder.build(context, commit_info)
            result = await self.provider.analyze_commit(prompt)

            for f in result.findings:
                finding = Finding(
                    analysis_id=analysis.id,
                    source=FindingSource.AI_REVIEW,
                    category=f.category,
                    severity=f.severity,
                    fingerprint=str(uuid.uuid4()), 
                    file_path=f.file_path,
                    start_line=f.start_line,
                    end_line=f.end_line,
                    message=f.title + "\n\n" + f.description,
                    # Phase 6: AI findings enter PENDING_REVIEW — never auto-verified
                    status=FindingStatus.PENDING_REVIEW,
                    evidence={"reasoning": f.reasoning, "evidence": f.evidence, "introduced_by_commit": f.introduced_by_commit}
                )
                db.add(finding)

            analysis.status = AnalysisStatus.COMPLETED
            analysis.completed_at = datetime.now(timezone.utc)
            db.commit()

        except Exception as e:
            analysis.status = AnalysisStatus.FAILED
            analysis.error_message = str(e)
            analysis.completed_at = datetime.now(timezone.utc)
            db.commit()

ai_analysis_service = AIAnalysisService()
