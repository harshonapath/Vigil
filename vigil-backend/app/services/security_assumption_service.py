import hashlib
import re
import uuid
import asyncio
from sqlalchemy import select, func
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy.exc import IntegrityError

from app.core.auth import ReviewerContext
from app.core.exceptions import ResourceNotFoundException, UnauthorizedException, ForbiddenException, ConflictException
from app.models.analysis import Analysis
from app.models.pull_request import PullRequest
from app.models.repository import Repository
from app.models.security_assumption import (
    SecurityAssumption,
    SecurityAssumptionVersion,
    SecurityAssumptionEvidence,
    SecurityAssumptionChange,
    SecurityAssumptionDecision,
    SecurityAssumptionRun,
)
from app.services.ai.security_assumptions.schemas import SecurityAssumptionResult
from app.integrations.github.client import github_client


def _normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def assumption_identity_key(category: str, subject: str, security_property: str, scope: str) -> str:
    """Stable composite key; statement wording is deliberately excluded."""
    material = "|".join(_normalize(part) for part in (category, subject, security_property, scope))
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _evidence_signature(db: Session, version: SecurityAssumptionVersion) -> set[tuple[str, str]]:
    evidence = db.scalars(select(SecurityAssumptionEvidence).where(
        SecurityAssumptionEvidence.version_id == version.id
    )).all()
    return {
        (item.path.casefold(), "\n".join(line.strip() for line in item.excerpt.splitlines()))
        for item in evidence
    }


class SecurityAssumptionService:
    async def resolve_ancestral_baseline_versions(
        self, db: Session, repository_id: uuid.UUID, base_sha: str,
        installation_id: int, owner: str, repo_name: str,
    ) -> dict[uuid.UUID, uuid.UUID]:
        """Select the nearest previously analyzed ancestor of the PR base using GitHub ancestry."""
        candidates = db.scalars(
            select(SecurityAssumptionVersion)
            .join(SecurityAssumption, SecurityAssumption.id == SecurityAssumptionVersion.assumption_id)
            .where(SecurityAssumption.repository_id == repository_id)
        ).all()
        by_sha: dict[str, list[SecurityAssumptionVersion]] = {}
        for version in candidates:
            by_sha.setdefault(version.head_sha, []).append(version)

        async def compare(candidate_sha: str):
            if candidate_sha == base_sha:
                return candidate_sha, 0
            try:
                response = await github_client.compare_commits(
                    installation_id, owner, repo_name, candidate_sha, base_sha
                )
            except Exception:
                return candidate_sha, None
            if response.get("status") not in {"ahead", "identical"}:
                return candidate_sha, None
            distance = response.get("ahead_by")
            return candidate_sha, distance if isinstance(distance, int) and distance >= 0 else None

        # Bound calls and fan-out for old repositories. Unchecked observations
        # remain insufficient evidence; they can never become NEW by omission.
        ordered_shas = sorted(by_sha)
        candidate_shas = ([base_sha] if base_sha in by_sha else []) + [
            sha for sha in ordered_shas if sha != base_sha
        ][:49 if base_sha in by_sha else 50]
        semaphore = asyncio.Semaphore(5)

        async def bounded_compare(sha: str):
            async with semaphore:
                return await compare(sha)

        comparisons = await asyncio.gather(*(bounded_compare(sha) for sha in candidate_shas))
        distances = {sha: distance for sha, distance in comparisons if distance is not None}
        nearest: dict[uuid.UUID, tuple[int, str, uuid.UUID]] = {}
        for sha, versions in by_sha.items():
            if sha not in distances:
                continue
            for version in versions:
                option = (distances[sha], sha, version.id)
                current = nearest.get(version.assumption_id)
                if current is None or option < current:
                    nearest[version.assumption_id] = option
        return {assumption_id: option[2] for assumption_id, option in nearest.items()}

    @staticmethod
    def _authorized_repository(db: Session, repository_id: uuid.UUID, reviewer: ReviewerContext) -> Repository:
        repo = db.scalar(select(Repository).options(joinedload(Repository.user)).where(Repository.id == repository_id))
        if repo is None:
            raise ResourceNotFoundException(f"Repository '{repository_id}' not found")
        if not reviewer.login or repo.user.github_login.casefold() != reviewer.login.casefold():
            raise ForbiddenException("Reviewer is not authorized to access this repository")
        return repo

    def persist_extraction(
        self,
        db: Session,
        analysis: Analysis,
        result: SecurityAssumptionResult,
        *,
        context_file_count: int = 0,
        context_char_count: int = 0,
        baseline_version_ids: dict[uuid.UUID, uuid.UUID] | None = None,
    ) -> list[SecurityAssumptionChange]:
        """Persist only validated candidates in one transaction; repeated calls are idempotent."""
        pr = db.scalar(select(PullRequest).where(PullRequest.id == analysis.pull_request_id))
        if pr is None:
            raise ResourceNotFoundException("Analysis pull request not found")
        repo_id = pr.repository_id
        out: list[SecurityAssumptionChange] = []
        try:
            existing_run = db.scalar(select(SecurityAssumptionRun).where(SecurityAssumptionRun.analysis_id == analysis.id))
            if existing_run:
                return db.scalars(select(SecurityAssumptionChange).where(
                    SecurityAssumptionChange.analysis_id == analysis.id
                )).all()
            db.add(SecurityAssumptionRun(
                analysis_id=analysis.id,
                status=result.status,
                context_file_count=context_file_count,
                context_char_count=context_char_count,
                candidate_count=len(result.candidates) + len(result.rejected),
                validated_candidate_count=len(result.candidates),
                rejected_candidate_count=len(result.rejected),
                validated_evidence_count=sum(len(candidate.evidence) for candidate in result.candidates),
                provider=result.provider,
                model=result.model,
                fallback_used=result.fallback_used,
                latency_ms=result.latency_ms,
                retry_count=result.retry_count,
                token_usage=result.token_usage,
                failure_code=result.error if result.status in {"UNAVAILABLE", "MALFORMED_OUTPUT"} else None,
            ))
            db.flush()
            # Use the PR's exact base when available. Other baselines are admitted
            # only when GitHub has proven their commit is an ancestor of that base.
            if baseline_version_ids is None:
                baseline_versions = db.scalars(
                select(SecurityAssumptionVersion)
                    .join(SecurityAssumption, SecurityAssumption.id == SecurityAssumptionVersion.assumption_id)
                    .where(SecurityAssumption.repository_id == repo_id, SecurityAssumptionVersion.head_sha == pr.base_sha)
                .order_by(SecurityAssumptionVersion.id)
                ).all()
            else:
                baseline_versions = db.scalars(select(SecurityAssumptionVersion).where(
                    SecurityAssumptionVersion.id.in_(list(baseline_version_ids.values()))
                )).all() if baseline_version_ids else []
            baseline_by_assumption = {}
            for baseline in baseline_versions:
                baseline_by_assumption.setdefault(baseline.assumption_id, baseline)
            seen: set[uuid.UUID] = set()

            for candidate in result.candidates:
                hints = candidate.identity_hints
                identity = assumption_identity_key(
                    candidate.category.value, hints.subject, hints.security_property,
                    hints.operation_boundary or candidate.scope,
                )
                assumption = db.scalar(select(SecurityAssumption).where(
                    SecurityAssumption.repository_id == repo_id,
                    SecurityAssumption.identity_key == identity,
                ))
                if assumption is None:
                    assumption = SecurityAssumption(
                        repository_id=repo_id,
                        identity_key=identity,
                        category=candidate.category.value,
                        subject=hints.subject,
                        security_property=hints.security_property,
                        scope=hints.operation_boundary or candidate.scope,
                    )
                    db.add(assumption)
                    db.flush()

                seen.add(assumption.id)
                version = db.scalar(select(SecurityAssumptionVersion).where(
                    SecurityAssumptionVersion.assumption_id == assumption.id,
                    SecurityAssumptionVersion.analysis_id == analysis.id,
                ))
                if version is None:
                    version = SecurityAssumptionVersion(
                        assumption_id=assumption.id,
                        analysis_id=analysis.id,
                        statement=candidate.statement,
                        category=candidate.category.value,
                        scope=candidate.scope,
                        confidence=candidate.confidence,
                        rationale=candidate.rationale,
                        potential_impact=candidate.potential_impact,
                        head_sha=analysis.head_sha,
                        evidence_strength=(
                            "E2" if len({e.file_path.casefold() for e in candidate.evidence}) > 1 else "E1"
                        ),
                    )
                    db.add(version)
                    db.flush()
                    for evidence in candidate.evidence:
                        db.add(SecurityAssumptionEvidence(
                            version_id=version.id,
                            path=evidence.file_path,
                            symbol=evidence.symbol,
                            start_line=evidence.start_line,
                            end_line=evidence.end_line,
                            excerpt=evidence.excerpt,
                            evidence_type=evidence.evidence_type.value,
                            commit_sha=evidence.commit_sha,
                            validation_status="VERIFIED",
                        ))

                prior = baseline_by_assumption.get(assumption.id)
                if prior is not None:
                    classification = (
                        "UNCHANGED"
                        if _evidence_signature(db, prior) == {
                            (evidence.file_path.casefold(), "\n".join(line.strip() for line in evidence.excerpt.splitlines()))
                            for evidence in candidate.evidence
                        }
                        else (
                            "POTENTIALLY_INVALIDATED"
                            if getattr(candidate.change_assessment, "value", candidate.change_assessment) == "POTENTIALLY_INVALIDATED"
                            else "CHANGED"
                        )
                    )
                else:
                    previous_observation = db.scalar(select(SecurityAssumptionVersion.id).where(
                        SecurityAssumptionVersion.assumption_id == assumption.id,
                        SecurityAssumptionVersion.analysis_id != analysis.id,
                    ).limit(1))
                    classification = "INSUFFICIENT_EVIDENCE" if previous_observation else "NEW"
                key = hashlib.sha256(f"{analysis.id}:{identity}:{classification}".encode()).hexdigest()
                change = db.scalar(select(SecurityAssumptionChange).where(SecurityAssumptionChange.idempotency_key == key))
                if change is None:
                    change = SecurityAssumptionChange(
                        repository_id=repo_id,
                        analysis_id=analysis.id,
                        assumption_id=assumption.id,
                        prior_version_id=prior.id if prior else None,
                        new_version_id=version.id,
                        classification=classification,
                        impact_summary=(
                            "A compatible prior observation at the PR base SHA was not available; this candidate cannot be safely classified as new. "
                            + candidate.potential_impact
                            if classification == "INSUFFICIENT_EVIDENCE"
                            else candidate.potential_impact
                        ),
                        confidence=candidate.confidence,
                        risk_level="UNASSESSED",
                        blast_radius_status="INSUFFICIENT_EVIDENCE",
                        blast_radius_items=[],
                        idempotency_key=key,
                    )
                    db.add(change)
                    db.flush()
                out.append(change)

            # Only a complete extraction can report non-observation; an unavailable,
            # malformed, or partial run must never imply that an invariant disappeared.
            if result.status == "COMPLETED":
                for prior in baseline_versions:
                    if prior.assumption_id in seen:
                        continue
                    key = hashlib.sha256(f"{analysis.id}:{prior.assumption_id}:NOT_OBSERVED".encode()).hexdigest()
                    change = db.scalar(select(SecurityAssumptionChange).where(SecurityAssumptionChange.idempotency_key == key))
                    if change is None:
                        change = SecurityAssumptionChange(
                            repository_id=repo_id,
                            analysis_id=analysis.id,
                            assumption_id=prior.assumption_id,
                            prior_version_id=prior.id,
                            classification="NOT_OBSERVED",
                            impact_summary="This assumption was not observed in the current extraction. Its absence is not evidence of resolution or safety.",
                            confidence=0.0,
                            idempotency_key=key,
                        )
                        db.add(change)
                        db.flush()
                    out.append(change)

            for rejected in result.rejected:
                key = hashlib.sha256(f"{analysis.id}:rejected:{rejected.index}:{rejected.reason}".encode()).hexdigest()
                change = db.scalar(select(SecurityAssumptionChange).where(SecurityAssumptionChange.idempotency_key == key))
                if change is None:
                    change = SecurityAssumptionChange(
                        repository_id=repo_id,
                        analysis_id=analysis.id,
                        classification="INSUFFICIENT_EVIDENCE",
                        impact_summary=f"Candidate was not persisted because evidence validation failed: {rejected.reason}",
                        confidence=0.0,
                        idempotency_key=key,
                    )
                    db.add(change)
                    db.flush()
                out.append(change)

            for conflict in result.conflicting_indexes:
                key = hashlib.sha256(f"{analysis.id}:conflict:{','.join(map(str, conflict))}".encode()).hexdigest()
                change = db.scalar(select(SecurityAssumptionChange).where(SecurityAssumptionChange.idempotency_key == key))
                if change is None:
                    change = SecurityAssumptionChange(
                        repository_id=repo_id,
                        analysis_id=analysis.id,
                        classification="INSUFFICIENT_EVIDENCE",
                        impact_summary="Conflicting candidates proposed different protected properties for the same subject and scope. Reviewer confirmation is required.",
                        confidence=0.0,
                        idempotency_key=key,
                    )
                    db.add(change)
                    db.flush()
                out.append(change)

            db.commit()
            return out
        except IntegrityError as exc:
            db.rollback()
            raise ConflictException("A concurrent reviewer decision was already recorded") from exc
        except Exception:
            db.rollback()
            raise

    def list_changes(self, db: Session, analysis_id: uuid.UUID, reviewer: ReviewerContext, page: int, page_size: int):
        analysis = db.scalar(select(Analysis).where(Analysis.id == analysis_id))
        if analysis is None:
            raise ResourceNotFoundException(f"Analysis '{analysis_id}' not found")
        pr = db.scalar(select(PullRequest).where(PullRequest.id == analysis.pull_request_id))
        self._authorized_repository(db, pr.repository_id, reviewer)
        query = select(SecurityAssumptionChange).where(SecurityAssumptionChange.analysis_id == analysis_id).order_by(SecurityAssumptionChange.created_at, SecurityAssumptionChange.id)
        total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
        items = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
        run = db.scalar(select(SecurityAssumptionRun).where(SecurityAssumptionRun.analysis_id == analysis_id))
        return items, total, run

    def list_repository_assumptions(self, db: Session, repository_id: uuid.UUID, reviewer: ReviewerContext, page: int, page_size: int):
        self._authorized_repository(db, repository_id, reviewer)
        query = select(SecurityAssumption).options(
            selectinload(SecurityAssumption.versions).selectinload(SecurityAssumptionVersion.evidence)
        ).where(SecurityAssumption.repository_id == repository_id).order_by(
            SecurityAssumption.category, SecurityAssumption.subject, SecurityAssumption.id
        )
        total = db.scalar(select(func.count()).select_from(
            select(SecurityAssumption.id).where(SecurityAssumption.repository_id == repository_id).subquery()
        )) or 0
        items = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
        return items, total

    def get_assumption(self, db: Session, assumption_id: uuid.UUID, reviewer: ReviewerContext):
        assumption = db.execute(select(SecurityAssumption).options(
            selectinload(SecurityAssumption.versions).selectinload(SecurityAssumptionVersion.evidence)
        ).where(SecurityAssumption.id == assumption_id)).unique().scalar_one_or_none()
        if assumption is None:
            raise ResourceNotFoundException(f"Security assumption '{assumption_id}' not found")
        self._authorized_repository(db, assumption.repository_id, reviewer)
        return assumption

    def get_change(self, db: Session, change_id: uuid.UUID, reviewer: ReviewerContext):
        change = db.execute(select(SecurityAssumptionChange).options(
            joinedload(SecurityAssumptionChange.prior_version).joinedload(SecurityAssumptionVersion.evidence),
            joinedload(SecurityAssumptionChange.new_version).joinedload(SecurityAssumptionVersion.evidence),
        ).where(SecurityAssumptionChange.id == change_id)).unique().scalar_one_or_none()
        if change is None:
            raise ResourceNotFoundException(f"Security assumption change '{change_id}' not found")
        self._authorized_repository(db, change.repository_id, reviewer)
        return change

    def decide(self, db: Session, change_id: uuid.UUID, payload, reviewer: ReviewerContext):
        change = self.get_change(db, change_id, reviewer)
        existing = db.scalar(select(SecurityAssumptionDecision).where(
            SecurityAssumptionDecision.idempotency_key == payload.idempotency_key
        ))
        if existing:
            if existing.change_id != change_id or existing.reviewer_login.casefold() != reviewer.login.casefold():
                raise UnauthorizedException("Idempotency key is already associated with another decision")
            return existing
        current_version = db.scalar(select(func.count()).where(SecurityAssumptionDecision.change_id == change_id)) or 0
        if payload.expected_version != current_version:
            raise ValueError(f"Decision version conflict; expected {current_version}")
        try:
            decision = SecurityAssumptionDecision(
                change_id=change_id,
                reviewer_login=reviewer.login,
                decision=payload.decision,
                expected_version=payload.expected_version,
                idempotency_key=payload.idempotency_key,
                comment=payload.comment,
            )
            db.add(decision)
            db.commit()
            db.refresh(decision)
            return decision
        except IntegrityError as exc:
            db.rollback()
            raise ConflictException("A concurrent reviewer decision was already recorded") from exc
        except Exception:
            db.rollback()
            raise


security_assumption_service = SecurityAssumptionService()
