from typing import Optional

from app.services.ai.context.schemas import ReviewContext
from app.services.ai.gateway import AIModelGateway, ai_gateway
from app.services.ai.prompts.review_prompt import ReviewPromptBuilder
from app.services.ai.review.parser import StructuredReviewParser
from app.services.ai.review.schemas import ReviewResult
from app.services.ai.review.validator import ReviewValidator


class ReviewEngine:
    """Orchestrates structured AI code review by assembling prompts, invoking the model gateway,

    parsing untrusted model JSON outputs, and validating findings against evidence.
    """

    def __init__(
        self,
        gateway: Optional[AIModelGateway] = None,
        prompt_builder: Optional[ReviewPromptBuilder] = None,
        parser: Optional[StructuredReviewParser] = None,
        validator: Optional[ReviewValidator] = None,
    ):
        self.gateway = gateway or ai_gateway
        self.prompt_builder = prompt_builder or ReviewPromptBuilder()
        self.parser = parser or StructuredReviewParser()
        self.validator = validator or ReviewValidator()

    async def review(
        self,
        context: ReviewContext,
        model: Optional[str] = None,
        temperature: Optional[float] = 0.1,
        max_tokens: Optional[int] = 4096,
    ) -> ReviewResult:
        """Executes a structured code review for a given ReviewContext.

        Args:
            context: Validated and normalized pull request review context.
            model: Optional model override.
            temperature: Generation temperature (defaults to 0.1 for high determinism).
            max_tokens: Maximum tokens for completion output.

        Returns:
            ReviewResult: Validated code review containing grounded findings and assessment summary.
        """
        # 1. Run prompt injection detector on untrusted repository context
        from app.services.ai.security.prompt_injection import prompt_injection_detector
        from app.services.ai.review.schemas import ReviewFinding, FindingCategory, FindingSeverity, FindingConfidence

        injection_results = prompt_injection_detector.scan_context(context)
        injection_findings = []
        for inj in injection_results:
            finding = ReviewFinding(
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
            injection_findings.append(finding)

        # 2. Build completion request with trust boundaries
        completion_request = self.prompt_builder.build_completion_request(
            context=context,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        # 3. Invoke gateway
        completion_response = await self.gateway.complete(completion_request)

        # 4. Defensively extract and parse JSON output
        parsed_data, parse_method, parse_warnings = self.parser.parse(completion_response.content)

        # 5. Ground and validate findings against context
        result = self.validator.validate(
            raw_data=parsed_data,
            context=context,
            model=completion_response.model,
            parse_method=parse_method,
            initial_warnings=parse_warnings,
            raw_response=completion_response.content,
        )

        # 6. Run deterministic static complexity analyzer to supplement LLM findings
        from app.services.ai.complexity import complexity_analyzer
        from app.services.ai.edge_cases import edge_case_analyzer
        from app.services.ai.security_assumptions import security_assumption_analyzer

        static_complexity_findings = complexity_analyzer.scan_context(context)
        for cf in static_complexity_findings:
            if not any(f.file == cf.file and f.line == cf.line and f.category == FindingCategory.COMPLEXITY for f in result.findings):
                result.findings.append(cf)

        # 7. Run deterministic static edge-case analyzer to supplement LLM findings
        static_edge_case_findings = edge_case_analyzer.scan_context(context)
        for ef in static_edge_case_findings:
            if not any(f.file == ef.file and f.line == ef.line and (f.category == FindingCategory.EDGE_CASE or f.title == ef.title) for f in result.findings):
                result.findings.append(ef)

        # 8. Run deterministic static security assumption analyzer to supplement LLM findings
        static_assumption_findings = security_assumption_analyzer.scan_context(context)
        for af in static_assumption_findings:
            if not any(
                f.file == af.file
                and (f.line == af.line or not f.line)
                and (f.category == FindingCategory.SECURITY_ASSUMPTION or f.title == af.title)
                for f in result.findings
            ):
                result.findings.append(af)

        if injection_findings:
            result.findings = injection_findings + result.findings

        return result



# Default singleton instance for general application use
review_engine = ReviewEngine()
