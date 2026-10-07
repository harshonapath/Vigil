import re
from typing import List, Tuple

from app.core.config import settings
from app.services.ai.security_assumptions.schemas import (
    CandidateValidationIssue,
    SecurityAssumptionCandidate,
    SecurityAssumptionContext,
    SecurityAssumptionExtraction,
    SecurityAssumptionResult,
)


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


class SecurityAssumptionValidator:
    """Binds model proposals to trusted backend context and validates evidence."""

    def validate(
        self,
        extraction: SecurityAssumptionExtraction,
        context: SecurityAssumptionContext,
        *,
        model: str | None = None,
        provider: str | None = None,
        fallback_used: bool = False,
        token_usage: dict | None = None,
    ) -> SecurityAssumptionResult:
        files = {(f.file_path.replace("\\", "/"), f.commit_sha): f.content for f in context.source_files}
        accepted: List[SecurityAssumptionCandidate] = []
        rejected: List[CandidateValidationIssue] = []
        duplicate_indexes: List[List[int]] = []
        conflicts: List[List[int]] = []
        identity_buckets: dict[Tuple[str, str, str], List[Tuple[int, SecurityAssumptionCandidate]]] = {}

        for index, candidate in enumerate(extraction.assumptions):
            reason = self._evidence_error(candidate, context, files)
            if candidate.confidence < settings.SECURITY_ASSUMPTIONS_CONFIDENCE_THRESHOLD:
                reason = reason or "Candidate confidence is below the configured threshold."
            if reason:
                rejected.append(CandidateValidationIssue(index=index, reason=reason))
                continue

            hints = candidate.identity_hints
            subject = _norm(hints.subject)
            boundary = _norm(hints.operation_boundary or candidate.scope)
            prop = _norm(hints.security_property)
            bucket = (candidate.category.value, subject, boundary)
            for prior_index, prior in identity_buckets.get(bucket, []):
                prior_prop = _norm(prior.identity_hints.security_property)
                if prior_prop == prop:
                    duplicate_indexes.append([prior_index, index])
                    reason = "Duplicate logical candidate in this extraction."
                    break
                conflicts.append([prior_index, index])
            if reason:
                rejected.append(CandidateValidationIssue(index=index, reason=reason))
                continue
            identity_buckets.setdefault(bucket, []).append((index, candidate))
            accepted.append(candidate)

        return SecurityAssumptionResult(
            repository=context.repository,
            base_sha=context.base_sha,
            head_sha=context.head_sha,
            status="COMPLETED" if not rejected else ("PARTIAL" if accepted else "INSUFFICIENT_EVIDENCE"),
            candidates=accepted,
            rejected=rejected,
            duplicate_indexes=duplicate_indexes,
            conflicting_indexes=conflicts,
            model=model,
            provider=provider,
            fallback_used=fallback_used,
            token_usage=token_usage,
        )

    @staticmethod
    def _evidence_error(
        candidate: SecurityAssumptionCandidate,
        context: SecurityAssumptionContext,
        files: dict[Tuple[str, str], str],
    ) -> str | None:
        if not candidate.evidence:
            return "Candidate has no evidence."
        for evidence in candidate.evidence:
            path = evidence.file_path.replace("\\", "/")
            if path.startswith("/") or any(p in ("", ".", "..") for p in path.split("/")):
                return "Evidence path is not a normalized relative repository path."
            if evidence.file_path.replace("\\", "/") != candidate.file_path.replace("\\", "/"):
                return "Evidence path does not match the candidate source file."
            if evidence.commit_sha not in {context.base_sha, context.head_sha}:
                return "Evidence commit SHA is not the analysis base or head SHA."
            content = files.get((path, evidence.commit_sha))
            if content is None:
                return "Evidence file content was not supplied for the stated commit SHA."
            lines = content.splitlines()
            if evidence.end_line < evidence.start_line or evidence.end_line > len(lines):
                return "Evidence line range is outside the source file."
            actual = "\n".join(lines[evidence.start_line - 1:evidence.end_line])
            if actual.strip() != evidence.excerpt.strip():
                return "Evidence excerpt does not exactly match the backend-supplied source lines."
        return None
