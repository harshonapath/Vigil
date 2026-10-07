from typing import List, Optional, Tuple

from app.core.config import settings
from app.core.logging_config import logger
from app.services.ai.context.schemas import ReviewContext
from app.services.ai.deep.investigator import DeepInvestigator
from app.services.ai.deep.planner import ReviewPlanner
from app.services.ai.deep.schemas import (
    CandidateFinding,
    DeepReviewLimits,
    ReviewCoverage,
    ReviewPlan,
)
from app.services.ai.gateway import AIModelGateway, ai_gateway
from app.services.ai.prompts.review_prompt import SYSTEM_PROMPT, ReviewPromptBuilder
from app.services.ai.review.engine import ReviewEngine
from app.services.ai.review.parser import StructuredReviewParser
from app.services.ai.review.schemas import (
    FindingCategory,
    FindingSeverity,
    ReviewFinding,
    ReviewResult,
    ReviewStatus,
)
from app.services.ai.review.validator import ReviewValidator
from app.services.ai.schemas import AICompletionRequest


BROAD_REVIEW_PROMPT_TRAILER = """
<instructions_trailer>
You are executing the BROAD REVIEW pass based on the designated Review Plan.
Your objective is to identify potential CANDIDATE HYPOTHESES for deep investigation.

Review the plan targets and code changes above. You MUST return a structured JSON object containing candidate findings matching this schema:
{
  "summary": "<Broad review summary assessment>",
  "candidates": [
    {
      "category": "Security" | "Logic" | "Error Handling" | "Testing" | "Maintainability" | "Code Quality" | "Documentation" | "Performance" | "Complexity",
      "severity_estimate": "info" | "low" | "medium" | "high" | "critical",
      "title": "<Candidate finding headline hypothesis>",
      "file": "<relative file path from diff>",
      "line": <line number or null>,
      "problem_hypothesis": "<proposed bug/vulnerability hypothesis>",
      "why_investigate": "<rationale for why deep evidence check is needed>",
      "evidence": "<diff snippet>",
      "priority": "high" | "medium" | "low"
    }
  ]
}

Return valid JSON only.
</instructions_trailer>
"""


class DeepReviewOrchestrator:
    """Orchestrates multi-pass Deep Intelligence code review:

    Understand/Plan -> Broad Review -> Candidate Findings -> Deep Investigation -> Validated ReviewResult.
    """

    def __init__(
        self,
        gateway: Optional[AIModelGateway] = None,
        planner: Optional[ReviewPlanner] = None,
        investigator: Optional[DeepInvestigator] = None,
        review_engine: Optional[ReviewEngine] = None,
        limits: Optional[DeepReviewLimits] = None,
    ):
        self.gateway = gateway or ai_gateway
        self.planner = planner or ReviewPlanner(gateway=self.gateway)
        self.investigator = investigator or DeepInvestigator(gateway=self.gateway)
        self.review_engine = review_engine or ReviewEngine(gateway=self.gateway)
        self.limits = limits or DeepReviewLimits()
        self.parser = StructuredReviewParser()
        self.validator = ReviewValidator()

    async def generate_candidate_findings(
        self, context: ReviewContext, plan: ReviewPlan
    ) -> Tuple[List[CandidateFinding], str]:
        """Executes the broad review pass to generate CandidateFinding hypotheses."""
        prompt_builder = ReviewPromptBuilder()
        user_prompt = prompt_builder.build_user_prompt(context)

        # Inject Review Plan into prompt context
        plan_section = (
            f"<review_plan>\n"
            f"Strategy: {plan.strategy}\n"
            f"Plan Summary: {plan.summary}\n"
            f"Target Areas: {', '.join(t.file + ':' + '/'.join(t.areas) for t in plan.targets)}\n"
            f"</review_plan>\n\n"
        )
        user_prompt = plan_section + user_prompt

        if "<instructions_trailer>" in user_prompt:
            user_prompt = user_prompt.split("<instructions_trailer>")[0] + BROAD_REVIEW_PROMPT_TRAILER

        request = AICompletionRequest(
            prompt=user_prompt,
            system_prompt=SYSTEM_PROMPT,
            temperature=0.1,
            max_tokens=3000,
        )

        try:
            response = await self.gateway.complete(request)
            parsed_data, _, warnings = self.parser.parse(response.content)

            candidates = []
            if parsed_data and "candidates" in parsed_data:
                valid_files = {f.file_path for f in context.changed_files}
                for c in parsed_data.get("candidates", [])[: self.limits.max_candidates]:
                    target_file = c.get("file", "").strip()
                    # Filter candidate files against actual context files
                    if target_file in valid_files or not target_file:
                        candidates.append(
                            CandidateFinding(
                                category=c.get("category", FindingCategory.SECURITY),
                                severity_estimate=c.get("severity_estimate", FindingSeverity.MEDIUM),
                                title=c.get("title", "Proposed Candidate Hypothesis"),
                                file=target_file or (context.changed_files[0].file_path if context.changed_files else "unknown"),
                                line=c.get("line"),
                                problem_hypothesis=c.get("problem_hypothesis", c.get("problem", "Hypothesis requiring investigation")),
                                why_investigate=c.get("why_investigate", c.get("why", "Verify evidence")),
                                evidence=c.get("evidence"),
                                priority=c.get("priority", "medium"),
                                provenance="broad_review",
                            )
                        )

            summary = parsed_data.get("summary", "Broad review pass complete") if parsed_data else "Broad review parsed with fallback"
            return candidates, summary

        except Exception as exc:
            logger.error(f"Broad review candidate generation failed: {type(exc).__name__} - {str(exc)}")
            return [], f"Broad review error: {type(exc).__name__}"

    async def review(self, context: ReviewContext) -> ReviewResult:
        """Executes full Deep Intelligence Engine review pipeline."""
        from app.services.ai.security.prompt_injection import prompt_injection_detector
        from app.services.ai.review.schemas import FindingConfidence

        model_calls = 0
        warnings: List[str] = []

        # 0. Run prompt injection scan on all untrusted context BEFORE any LLM call
        injection_results = prompt_injection_detector.scan_context(context)
        injection_findings: List[ReviewFinding] = []
        for inj in injection_results:
            injection_finding = ReviewFinding(
                category=FindingCategory.PROMPT_INJECTION,
                severity=FindingSeverity.HIGH,
                confidence=FindingConfidence.HIGH,
                title="Prompt Injection Detected",
                file=inj.file_path or "untrusted_input",
                line=inj.line_number,
                problem=(
                    "Instruction-like content was detected inside repository-derived content. "
                    "Repository content is treated as untrusted data and must not be followed as an instruction by the AI reviewer."
                ),
                why=f"{inj.reason}. Matched indicator: '{inj.matched_indicators[0] if inj.matched_indicators else ''}'",
                evidence=inj.evidence or (inj.matched_indicators[0] if inj.matched_indicators else None),
                suggestion="Remove instruction-hijacking directives, pseudo-system prompts, or prompt injection attempts from repository content.",
                source="SECURITY_DETECTOR",
                is_grounded=True,
            )
            injection_findings.append(injection_finding)
            warnings.append(
                f"SECURITY: Prompt injection attempt detected in '{inj.file_path or 'untrusted_input'}' "
                f"at line {inj.line_number}: {inj.reason}"
            )

        # 1. PLAN PASS
        plan = await self.planner.plan(context)
        model_calls += 1

        # 2. BROAD REVIEW PASS (Candidate Generation)
        candidates, broad_summary = await self.generate_candidate_findings(context, plan)
        model_calls += 1

        # 3. DEEP INVESTIGATION PASS (Per Candidate)
        final_findings: List[ReviewFinding] = []
        investigated_count = 0
        dropped_count = 0

        # Sort candidates by priority (high priority first)
        sorted_candidates = sorted(
            candidates,
            key=lambda c: 0 if c.priority == "high" else (1 if c.priority == "medium" else 2),
        )

        for candidate in sorted_candidates:
            if investigated_count >= self.limits.max_investigations or model_calls >= self.limits.max_total_model_calls:
                warnings.append(f"Reached deep investigation budget limit ({self.limits.max_investigations} investigations max)")
                break

            investigated_count += 1
            model_calls += 1

            finding, inv_summary = await self.investigator.investigate(candidate, context)
            if finding:
                # Avoid duplicate findings on same file + line + title
                if not any(f.file == finding.file and f.line == finding.line and f.title == finding.title for f in final_findings):
                    final_findings.append(finding)
            else:
                dropped_count += 1
                warnings.append(f"Candidate '{candidate.title}' on '{candidate.file}' dropped: {inv_summary}")

        # Supplement deep review with static complexity analysis findings
        from app.services.ai.complexity import complexity_analyzer

        static_complexity_findings = complexity_analyzer.scan_context(context)
        for cf in static_complexity_findings:
            if not any(f.file == cf.file and f.line == cf.line and f.category == FindingCategory.COMPLEXITY for f in final_findings):
                final_findings.append(cf)

        # Supplement deep review with static edge-case analysis findings
        from app.services.ai.edge_cases import edge_case_analyzer

        static_edge_case_findings = edge_case_analyzer.scan_context(context)
        for ef in static_edge_case_findings:
            if not any(f.file == ef.file and f.line == ef.line and (f.category == FindingCategory.EDGE_CASE or f.title == ef.title) for f in final_findings):
                final_findings.append(ef)

        # Supplement deep review with static security assumption analysis findings
        from app.services.ai.security_assumptions import security_assumption_analyzer

        static_assumption_findings = security_assumption_analyzer.scan_context(context)
        for af in static_assumption_findings:
            if not any(
                f.file == af.file
                and (f.line == af.line or not f.line)
                and (f.category == FindingCategory.SECURITY_ASSUMPTION or f.title == af.title)
                for f in final_findings
            ):
                final_findings.append(af)

        # Compute coverage metrics
        examined_files = [f.file_path for f in context.changed_files]
        all_cats = [c.value for c in FindingCategory]
        observed_cats = list({f.category.value if hasattr(f.category, "value") else str(f.category) for f in final_findings})

        coverage = ReviewCoverage(
            changed_files_examined=examined_files,
            changed_symbols_examined=[],
            categories_considered=all_cats,
            categories_skipped={},
            candidates_generated=len(candidates),
            candidates_investigated=investigated_count,
            candidates_dropped=dropped_count,
            final_findings=len(final_findings),
            execution_status=ReviewStatus.SUCCESS.value if not warnings else ReviewStatus.WARNING.value,
        )

        meta = {
            "review_depth": "deep",
            "model_calls": model_calls,
            "plan_summary": plan.summary,
            "broad_summary": broad_summary,
            "coverage": coverage.model_dump(),
            "grounded_count": len(final_findings),
            "dropped_hallucinations": dropped_count,
        }

        # Build narrative summary
        injection_note = (
            f"\n- ⚠ {len(injection_findings)} prompt injection attempt(s) detected and blocked by security detector."
            if injection_findings else ""
        )
        summary = (
            f"Deep Intelligence Code Review ({plan.strategy} strategy):\n"
            f"- Analyzed {len(examined_files)} changed files and generated {len(candidates)} candidate hypotheses.\n"
            f"- Deeply investigated {investigated_count} high-priority targets; validated {len(final_findings)} evidence-grounded findings.\n"
            f"- Strategy: {plan.summary}"
            f"{injection_note}"
        )

        all_findings = injection_findings + final_findings

        return ReviewResult(
            summary=summary,
            findings=all_findings,
            model=settings.AI_MODEL,
            status=ReviewStatus.SUCCESS if not warnings or all_findings else ReviewStatus.WARNING,
            warnings=warnings,
            validation_metadata=meta,
        )
