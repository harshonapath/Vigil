from datetime import datetime, timezone
import hashlib
from typing import Any, Dict, List, Optional, Tuple
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ResourceNotFoundException
from app.core.logging_config import logger
from app.models.analysis import Analysis, AnalysisStatus, AnalysisTrigger
from app.models.finding import (
    Finding,
    FindingCategory as DBFindingCategory,
    FindingSeverity as DBFindingSeverity,
    FindingSource,
    FindingStatus,
)
from app.models.pull_request import PullRequest
from app.models.review import Review, ReviewStatus as DBReviewStatus
from app.schemas.ai_review import AIReviewResponse
from app.services.ai.context.builder import ReviewContextBuilder
from app.services.ai.context.schemas import (
    ChangedFileContext,
    RepositoryStructureContext,
    ReviewContext,
    ScannerFindingContext,
)
from app.services.ai.review.engine import ReviewEngine
from app.services.ai.review.schemas import ReviewFinding, ReviewResult


class AIReviewService:
    """Service adapter that bridges existing VIGIL backend domain models with the AI ReviewEngine.

    Constructs normalized ReviewContext from VIGIL PullRequest data, invokes the review
    engine, and optionally persists validated Review and Finding records into the database.
    """

    def __init__(self, review_engine: Optional[ReviewEngine] = None):
        self.review_engine = review_engine or ReviewEngine()
        self._review_cache: Dict[str, ReviewResult] = {}

    def clear_cache(self) -> None:
        """Clears the in-memory review response cache."""
        self._review_cache.clear()

    def compute_context_fingerprint(self, context: ReviewContext) -> str:
        """Computes a deterministic SHA256 fingerprint for a ReviewContext to support response deduplication."""
        hasher = hashlib.sha256()
        hasher.update(f"engine:{id(self.review_engine)}".encode())
        if context.pull_request:
            pr = context.pull_request
            hasher.update(f"pr:{pr.head_sha}:{pr.base_sha}:{pr.title}".encode())
        if context.changed_files:
            for f in context.changed_files:
                hasher.update(f"file:{f.file_path}:{f.diff_patch or ''}".encode())
        if context.scanner_findings:
            for sf in context.scanner_findings:
                hasher.update(f"sf:{sf.file_path}:{sf.start_line}:{sf.rule_id}".encode())
        if context.custom_instructions:
            hasher.update(f"ci:{context.custom_instructions}".encode())
        return hasher.hexdigest()

    @staticmethod
    def map_review_finding_to_db_finding(
        finding: ReviewFinding,
        analysis_id: uuid.UUID,
    ) -> Finding:
        """Maps an evidence-grounded ReviewFinding into a persistent VIGIL Finding model."""
        fingerprint = hashlib.sha256(
            f"{analysis_id}:{finding.file}:{finding.line}:{finding.title}".encode()
        ).hexdigest()

        # Map category safely to DB enum string
        cat_value = finding.category.value if hasattr(finding.category, "value") else str(finding.category)
        sev_value = finding.severity.value if hasattr(finding.severity, "value") else str(finding.severity)

        evidence_payload = {
            "why": finding.why,
            "evidence": finding.evidence,
            "suggestion": finding.suggestion,
        }
        if finding.current_time_complexity:
            evidence_payload["current_time_complexity"] = finding.current_time_complexity
        if finding.suggested_time_complexity:
            evidence_payload["suggested_time_complexity"] = finding.suggested_time_complexity
        if finding.current_space_complexity:
            evidence_payload["current_space_complexity"] = finding.current_space_complexity
        if finding.suggested_space_complexity:
            evidence_payload["suggested_space_complexity"] = finding.suggested_space_complexity
        if finding.edge_case_type:
            evidence_payload["edge_case_type"] = finding.edge_case_type
        if finding.scenario:
            evidence_payload["scenario"] = finding.scenario
        if finding.expected_behavior:
            evidence_payload["expected_behavior"] = finding.expected_behavior
        if finding.current_behavior:
            evidence_payload["current_behavior"] = finding.current_behavior
        if finding.potential_impact:
            evidence_payload["potential_impact"] = finding.potential_impact
        if finding.assumption_name:
            evidence_payload["assumption_name"] = finding.assumption_name
        if finding.scope:
            evidence_payload["scope"] = finding.scope
        if finding.previous_assumption:
            evidence_payload["previous_assumption"] = finding.previous_assumption
        if finding.new_assumption:
            evidence_payload["new_assumption"] = finding.new_assumption
        if finding.change_type:
            evidence_payload["change_type"] = finding.change_type
        if finding.potential_repercussions:
            evidence_payload["potential_repercussions"] = finding.potential_repercussions

        return Finding(
            analysis_id=analysis_id,
            source=FindingSource.AI_REVIEW.value,
            category=cat_value.upper(),
            severity=sev_value.upper(),
            rule_id=f"ai-review-{cat_value.lower()}",
            fingerprint=fingerprint,
            file_path=finding.file,
            start_line=finding.line,
            end_line=finding.line,
            message=f"{finding.title}: {finding.problem}",
            status=FindingStatus.OPEN.value,
            evidence=evidence_payload,
        )

    @staticmethod
    def map_review_result_to_db_review(
        result: ReviewResult,
        analysis_id: uuid.UUID,
    ) -> Review:
        """Maps a validated ReviewResult into a persistent VIGIL Review model."""
        return Review(
            analysis_id=analysis_id,
            status=DBReviewStatus.READY.value,
            summary=result.summary,
            review_body=result.summary,
        )

    def build_review_context_for_pull_request(
        self,
        db: Session,
        pull_request_id: uuid.UUID,
        changed_files: Optional[List[ChangedFileContext]] = None,
        scanner_findings: Optional[List[ScannerFindingContext]] = None,
        custom_instructions: Optional[str] = None,
        repository_structure: Optional[RepositoryStructureContext] = None,
    ) -> Tuple[PullRequest, ReviewContext]:
        """Gathers available VIGIL PR, repository, commit, and scanner data into a ReviewContext."""
        pr = db.scalar(select(PullRequest).where(PullRequest.id == pull_request_id))
        if not pr:
            raise ResourceNotFoundException(f"Pull request with ID '{pull_request_id}' not found")

        builder = ReviewContextBuilder()

        # 1. Pull Request Metadata
        builder.set_pull_request(
            title=pr.title,
            description=pr.description,
            author=pr.author_login,
            source_branch=pr.source_branch,
            target_branch=pr.target_branch,
            head_sha=pr.head_sha,
            base_sha=pr.base_sha,
            pr_number=pr.pr_number,
        )

        # 2. Repository Structure Context
        if repository_structure:
            repo_name = (
                repository_structure.repository_name
                or (pr.repository.full_name or pr.repository.name if pr.repository else None)
            )
            builder.set_repository(
                repository_name=repo_name,
                file_paths=repository_structure.file_paths,
                relevant_directories=repository_structure.relevant_directories,
                languages=repository_structure.languages,
                dependencies=repository_structure.dependencies,
                test_paths=repository_structure.test_paths,
            )
        elif pr.repository:
            repo_name = pr.repository.full_name or pr.repository.name
            builder.set_repository(repository_name=repo_name)

        # 3. Commits Context
        if pr.commits:
            for commit in pr.commits:
                builder.add_commit(
                    sha=commit.sha,
                    message=commit.message,
                    author=commit.author_login or commit.author_name,
                    committed_at=commit.committed_at,
                    parent_sha=commit.parent_sha,
                )

        # 4. Scanner Findings from previous analyses on this PR
        if pr.analyses:
            for analysis in pr.analyses:
                if analysis.findings:
                    for f in analysis.findings:
                        # Exclude previously generated AI review findings to avoid duplicate reflection
                        if f.source != FindingSource.AI_REVIEW.value:
                            builder.add_scanner_finding(
                                source=f.source,
                                category=f.category,
                                severity=f.severity,
                                message=f.message,
                                rule_id=f.rule_id,
                                file_path=f.file_path,
                                start_line=f.start_line,
                                end_line=f.end_line,
                                evidence=f.evidence,
                            )

        # 5. External Scanner Findings passed explicitly
        if scanner_findings:
            for sf in scanner_findings:
                builder.add_scanner_finding(
                    source=sf.source,
                    category=sf.category,
                    severity=sf.severity,
                    message=sf.message,
                    rule_id=sf.rule_id,
                    file_path=sf.file_path,
                    start_line=sf.start_line,
                    end_line=sf.end_line,
                    evidence=sf.evidence,
                )

        # 6. Changed Files & Diffs (Supplied by upstream extraction layer)
        if changed_files:
            for cf in changed_files:
                builder.add_changed_file(
                    file_path=cf.file_path,
                    diff_patch=cf.diff_patch,
                    change_type=cf.change_type,
                    additions=cf.additions,
                    deletions=cf.deletions,
                    file_content=cf.file_content,
                    old_content=cf.old_content,
                    new_content=cf.new_content,
                )

        # 7. Custom Reviewer Directives
        if custom_instructions:
            builder.set_custom_instructions(custom_instructions)

        return pr, builder.build(normalize=True)

    def persist_review_result(
        self,
        db: Session,
        pr: PullRequest,
        analysis_id: Optional[uuid.UUID],
        result: ReviewResult,
    ) -> Tuple[Review, List[Finding]]:
        """Persists or updates Review and Finding records for a completed AI review."""
        target_analysis: Optional[Analysis] = None

        if analysis_id:
            target_analysis = db.scalar(select(Analysis).where(Analysis.id == analysis_id))
            if not target_analysis:
                raise ResourceNotFoundException(f"Analysis with ID '{analysis_id}' not found")
        elif pr.analyses:
            # Associate with latest analysis
            target_analysis = sorted(pr.analyses, key=lambda a: a.created_at, reverse=True)[0]
        else:
            # Create a completed analysis record to anchor the review and findings
            target_analysis = Analysis(
                pull_request_id=pr.id,
                head_sha=pr.head_sha,
                status=AnalysisStatus.COMPLETED.value,
                trigger_type=AnalysisTrigger.MANUAL.value,
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc),
            )
            db.add(target_analysis)
            db.flush()

        # Upsert Review
        review = db.scalar(select(Review).where(Review.analysis_id == target_analysis.id))
        if review:
            review.summary = result.summary
            review.review_body = result.summary
            review.status = DBReviewStatus.READY.value
            review.updated_at = datetime.now(timezone.utc)
        else:
            review = Review(
                analysis_id=target_analysis.id,
                status=DBReviewStatus.READY.value,
                summary=result.summary,
                review_body=result.summary,
            )
            db.add(review)

        # Upsert Findings (only persist verified grounded findings)
        created_findings: List[Finding] = []
        for finding in result.findings:
            if not finding.is_grounded:
                logger.warning(
                    f"Skipping database persistence for ungrounded finding '{finding.title}' "
                    f"on file '{finding.file}'"
                )
                continue

            db_finding = self.map_review_finding_to_db_finding(
                finding=finding,
                analysis_id=target_analysis.id,
            )
            # Avoid duplicate fingerprint violations if review re-run on same analysis
            existing = db.scalar(
                select(Finding).where(
                    Finding.analysis_id == target_analysis.id,
                    Finding.fingerprint == db_finding.fingerprint,
                )
            )
            if not existing:
                db.add(db_finding)
                created_findings.append(db_finding)
            else:
                existing.message = db_finding.message
                existing.evidence = db_finding.evidence
                created_findings.append(existing)

        db.commit()
        db.refresh(review)

        return review, created_findings

    async def review_pull_request(
        self,
        db: Session,
        pull_request_id: uuid.UUID,
        custom_instructions: Optional[str] = None,
        persist: bool = False,
        analysis_id: Optional[uuid.UUID] = None,
        changed_files: Optional[List[ChangedFileContext]] = None,
        scanner_findings: Optional[List[ScannerFindingContext]] = None,
        repository_structure: Optional[RepositoryStructureContext] = None,
        use_cache: bool = True,
        review_depth: str = "standard",
    ) -> AIReviewResponse:
        """Executes the end-to-end AI review pipeline on a pull request and returns an AIReviewResponse."""
        start_time = datetime.now(timezone.utc)
        logger.info(
            f"Starting AI code review for pull request {pull_request_id} "
            f"(analysis_id={analysis_id}, persist={persist}, depth={review_depth})"
        )

        pr, context = self.build_review_context_for_pull_request(
            db=db,
            pull_request_id=pull_request_id,
            changed_files=changed_files,
            scanner_findings=scanner_findings,
            custom_instructions=custom_instructions,
            repository_structure=repository_structure,
        )

        fingerprint = self.compute_context_fingerprint(context) + f":depth={review_depth}"
        review_result: Optional[ReviewResult] = None

        if use_cache and fingerprint in self._review_cache:
            logger.info(f"AI code review cache hit for fingerprint {fingerprint[:12]}")
            review_result = self._review_cache[fingerprint]
        else:
            try:
                if review_depth == "deep":
                    from app.services.ai.deep.orchestrator import DeepReviewOrchestrator
                    orchestrator = DeepReviewOrchestrator(gateway=self.review_engine.gateway)
                    review_result = await orchestrator.review(context)
                else:
                    review_result = await self.review_engine.review(context)

                if use_cache:
                    self._review_cache[fingerprint] = review_result
            except Exception as exc:
                logger.error(
                    f"AI code review failed for pull request {pull_request_id}: "
                    f"{type(exc).__name__} - {str(exc)}"
                )
                raise

        elapsed_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000.0

        review_entity: Optional[Review] = None
        if persist:
            review_entity, _ = self.persist_review_result(
                db=db,
                pr=pr,
                analysis_id=analysis_id,
                result=review_result,
            )

        meta = review_result.validation_metadata or {}
        grounded_count = meta.get(
            "grounded_count", len([f for f in review_result.findings if f.is_grounded])
        )
        dropped_count = meta.get("dropped_hallucinations", 0)

        from app.services.ai.review.coverage import (
            compute_review_coverage,
            compute_review_limitations,
            compute_review_matrix,
        )

        cov_obj = compute_review_coverage(context, review_result.findings, meta)
        matrix_objs = compute_review_matrix(context, review_result.findings, review_depth)
        lim_objs = compute_review_limitations(context, meta)

        coverage_dict = cov_obj.model_dump()
        matrix_dicts = [m.model_dump() for m in matrix_objs]
        limitations_dicts = [l.model_dump() for l in lim_objs]

        logger.info(
            f"AI code review completed for pull request {pull_request_id} in {elapsed_ms:.1f}ms: "
            f"status={review_result.status.value}, "
            f"findings={len(review_result.findings)}, "
            f"grounded={grounded_count}, "
            f"dropped={dropped_count}, "
            f"model={review_result.model}"
        )

        resolved_analysis_id = (
            review_entity.analysis_id
            if review_entity
            else (analysis_id or (pr.analyses[0].id if pr.analyses else None))
        )

        return AIReviewResponse(
            pull_request_id=pr.id,
            analysis_id=resolved_analysis_id,
            review_id=review_entity.id if review_entity else None,
            status=review_result.status.value,
            summary=review_result.summary,
            findings_count=len(review_result.findings),
            grounded_findings=grounded_count,
            dropped_findings=dropped_count,
            findings=review_result.findings,
            warnings=review_result.warnings,
            model=review_result.model or "unknown",
            review_depth=review_depth,
            coverage=coverage_dict,
            review_matrix=matrix_dicts,
            limitations=limitations_dicts,
        )


ai_review_service = AIReviewService()
