from typing import Any, Dict, List, Optional, Tuple

from app.core.logging_config import logger
from app.services.ai.context.schemas import ReviewContext
from app.services.ai.deep.schemas import CandidateFinding, InvestigationEvidence
from app.services.ai.gateway import AIModelGateway, ai_gateway
from app.services.ai.prompts.review_prompt import SYSTEM_PROMPT
from app.services.ai.review.parser import StructuredReviewParser
from app.services.ai.review.schemas import FindingCategory, FindingSeverity, ReviewFinding, ReviewResult
from app.services.ai.review.validator import ReviewValidator
from app.services.ai.schemas import AICompletionRequest


INVESTIGATION_PROMPT_TEMPLATE = """You are VIGIL Deep Investigator.
Your task is to perform an evidence-grounded deep investigation of a specific candidate vulnerability hypothesis.

==================================================
CANDIDATE HYPOTHESIS UNDER INVESTIGATION
==================================================
Title: {title}
Category: {category}
Severity Estimate: {severity}
Target File: {file}
Target Line: {line}
Problem Hypothesis: {problem_hypothesis}
Rationale: {why_investigate}

==================================================
ASSEMBLED EVIDENCE BUNDLE
==================================================
Target Symbol: {target_symbol}
Callers: {callers}
Callees: {callees}
Git History: {git_history}

<untrusted_diff_evidence>
{diff_evidence}
</untrusted_diff_evidence>

<untrusted_scanner_evidence>
{scanner_evidence}
</untrusted_scanner_evidence>

<untrusted_test_evidence>
{test_evidence}
</untrusted_test_evidence>

==================================================
INVESTIGATION DIRECTIVE
==================================================
Examine the candidate hypothesis against the actual diff and evidence provided above.
Determine whether the hypothesis is genuinely supported by the code diff, or whether it is a false positive / ungrounded claim.

You MUST return a JSON object with your final determination matching this schema:
{{
  "is_supported": true | false,
  "summary": "<Investigation reasoning summary>",
  "finding": {{
    "category": "Security" | "Logic" | "Error Handling" | "Testing" | "Maintainability" | "Code Quality" | "Documentation" | "Performance" | "Complexity",
    "severity": "info" | "low" | "medium" | "high" | "critical",
    "title": "<Short headline>",
    "file": "<exact file path from diff>",
    "line": <line number or null>,
    "problem": "<detailed bug/vulnerability explanation>",
    "why": "<impact and risk rationale>",
    "evidence": "<exact code snippet from diff>",
    "suggestion": "<concrete recommended remediation>",
    "current_time_complexity": "<e.g. O(n^2) or null>",
    "suggested_time_complexity": "<e.g. O(n) or null>",
    "current_space_complexity": "<e.g. O(n) or null>",
    "suggested_space_complexity": "<e.g. O(1) or null>"
  }}
}}

If the hypothesis is unsupported or is a false positive, set "is_supported": false and "finding": null.
Return valid JSON only.
"""


class DeepInvestigator:
    """Investigates individual CandidateFinding hypotheses against assembled evidence bundles."""

    def __init__(
        self,
        gateway: Optional[AIModelGateway] = None,
        parser: Optional[StructuredReviewParser] = None,
        validator: Optional[ReviewValidator] = None,
    ):
        self.gateway = gateway or ai_gateway
        self.parser = parser or StructuredReviewParser()
        self.validator = validator or ReviewValidator()

    def assemble_evidence(self, candidate: CandidateFinding, context: ReviewContext) -> InvestigationEvidence:
        """Assembles an InvestigationEvidence bundle using actually available context data."""
        provenance = []

        # 1. Diff Patch Excerpt
        diff_patch = None
        for f in context.changed_files:
            if f.file_path == candidate.file:
                diff_patch = f.diff_patch or f.file_content
                provenance.append("diff")
                break

        # 2. Scanner Findings Matching File
        scanner_items = []
        if context.scanner_findings:
            for sf in context.scanner_findings:
                if sf.file_path == candidate.file:
                    scanner_items.append({
                        "source": sf.source,
                        "rule_id": sf.rule_id,
                        "severity": sf.severity,
                        "message": sf.message,
                        "line": sf.start_line,
                    })
            if scanner_items:
                provenance.append("scanner")
            else:
                provenance.append("unavailable")
        else:
            provenance.append("unavailable")

        # 3. Relevant Tests
        test_paths = []
        if context.repository and context.repository.test_paths:
            base_name = candidate.file.split("/")[-1].split(".")[0]
            for tp in context.repository.test_paths:
                if base_name in tp or "test" in tp:
                    test_paths.append(tp)
            if test_paths:
                provenance.append("test")
            else:
                provenance.append("unavailable")
        else:
            provenance.append("unavailable")

        # 4. Commits / Git History
        git_hist = "unavailable"
        if context.commits:
            commits_summary = [f"[{c.sha[:7]}] {c.message} (by {c.author or 'unknown'})" for c in context.commits[:5]]
            git_hist = "\n".join(commits_summary)
            provenance.append("git_history")
        else:
            provenance.append("unavailable")

        return InvestigationEvidence(
            candidate=candidate,
            target_symbol=candidate.symbol or "unavailable",
            callers=["unavailable"],
            callees=["unavailable"],
            relevant_tests=test_paths,
            configuration=context.repository.dependencies if context.repository else {},
            scanner_evidence=scanner_items,
            git_history=git_hist,
            diff_evidence=diff_patch or candidate.evidence or "No diff patch available for this file.",
            repository_evidence=candidate.evidence,
            provenance=list(set(provenance)),
        )

    async def investigate(
        self, candidate: CandidateFinding, context: ReviewContext
    ) -> Tuple[Optional[ReviewFinding], str]:
        """Investigates a single candidate finding hypothesis.

        Returns:
            Tuple[Optional[ReviewFinding], reasoning_summary]
        """
        evidence = self.assemble_evidence(candidate, context)

        # Build prompt
        prompt = INVESTIGATION_PROMPT_TEMPLATE.format(
            title=candidate.title,
            category=candidate.category.value if hasattr(candidate.category, "value") else str(candidate.category),
            severity=candidate.severity_estimate.value if hasattr(candidate.severity_estimate, "value") else str(candidate.severity_estimate),
            file=candidate.file,
            line=candidate.line or "N/A",
            problem_hypothesis=candidate.problem_hypothesis,
            why_investigate=candidate.why_investigate,
            target_symbol=evidence.target_symbol,
            callers=", ".join(evidence.callers),
            callees=", ".join(evidence.callees),
            git_history=evidence.git_history,
            diff_evidence=evidence.diff_evidence or "None",
            scanner_evidence=json.dumps(evidence.scanner_evidence) if evidence.scanner_evidence else "None",
            test_evidence=", ".join(evidence.relevant_tests) if evidence.relevant_tests else "None",
        )

        request = AICompletionRequest(
            prompt=prompt,
            system_prompt=SYSTEM_PROMPT,
            temperature=0.1,
            max_tokens=2048,
        )

        try:
            response = await self.gateway.complete(request)
            parsed_data, _, warnings = self.parser.parse(response.content)

            if not parsed_data or not parsed_data.get("is_supported", False):
                reason = parsed_data.get("summary", "Candidate hypothesis rejected by investigation pass") if parsed_data else "Failed parsing investigation response"
                logger.info(f"Candidate finding '{candidate.title}' on '{candidate.file}' was unsupported: {reason}")
                return None, reason

            raw_finding = parsed_data.get("finding")
            if not raw_finding or not isinstance(raw_finding, dict):
                return None, "Investigation marked supported but returned no valid finding object"

            # Parse finding schema
            finding_obj = ReviewFinding(
                category=raw_finding.get("category", candidate.category),
                severity=raw_finding.get("severity", candidate.severity_estimate),
                title=raw_finding.get("title", candidate.title),
                file=raw_finding.get("file", candidate.file),
                line=raw_finding.get("line", candidate.line),
                problem=raw_finding.get("problem", candidate.problem_hypothesis),
                why=raw_finding.get("why", candidate.why_investigate),
                evidence=raw_finding.get("evidence", candidate.evidence),
                suggestion=raw_finding.get("suggestion"),
                current_time_complexity=raw_finding.get("current_time_complexity"),
                suggested_time_complexity=raw_finding.get("suggested_time_complexity"),
                current_space_complexity=raw_finding.get("current_space_complexity"),
                suggested_space_complexity=raw_finding.get("suggested_space_complexity"),
                source="AI-DeepInvestigation",
            )

            # Ground finding via ReviewValidator against context
            validated_result = self.validator.validate(
                raw_data={"summary": "Investigation check", "findings": [finding_obj.model_dump()]},
                context=context,
                model=response.model,
            )

            grounded_findings = [f for f in validated_result.findings if f.is_grounded]
            if grounded_findings:
                return grounded_findings[0], parsed_data.get("summary", "Evidence verified")
            else:
                logger.warning(f"Investigated finding '{candidate.title}' on '{candidate.file}' failed grounding check")
                return None, "Finding failed evidence grounding check"

        except Exception as exc:
            logger.error(f"DeepInvestigator failed for candidate '{candidate.title}': {type(exc).__name__} - {str(exc)}")
            return None, f"Investigation error: {type(exc).__name__}"
