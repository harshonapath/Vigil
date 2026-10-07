from typing import Optional
from time import perf_counter

from app.core.config import settings
from app.services.ai.exceptions import AIGatewayError, AIResponseError
from app.services.ai.gateway import AIModelGateway
from app.services.ai.schemas import AICompletionRequest
from app.services.ai.security_assumptions.parser import SecurityAssumptionParser
from app.services.ai.security_assumptions.prompt import SYSTEM_PROMPT, SecurityAssumptionPromptBuilder
from app.services.ai.security_assumptions.schemas import SecurityAssumptionContext, SecurityAssumptionResult
from app.services.ai.security_assumptions.validator import SecurityAssumptionValidator


class SecurityAssumptionEngine:
    """Provider-independent extraction, parsing, and evidence validation boundary."""

    def __init__(
        self,
        gateway: AIModelGateway,
        prompt_builder: Optional[SecurityAssumptionPromptBuilder] = None,
        parser: Optional[SecurityAssumptionParser] = None,
        validator: Optional[SecurityAssumptionValidator] = None,
    ):
        self.gateway = gateway
        self.prompt_builder = prompt_builder or SecurityAssumptionPromptBuilder()
        self.parser = parser or SecurityAssumptionParser()
        self.validator = validator or SecurityAssumptionValidator()

    async def extract(self, context: SecurityAssumptionContext) -> SecurityAssumptionResult:
        started = perf_counter()
        response = None
        try:
            response = await self.gateway.complete(AICompletionRequest(
                prompt=self.prompt_builder.build_user_prompt(context),
                system_prompt=SYSTEM_PROMPT,
                temperature=settings.AI_TEMPERATURE,
                max_tokens=settings.AI_MAX_OUTPUT_TOKENS,
                response_format={"type": "json_object"},
            ))
            extraction = self.parser.parse(response.content)
            usage = response.usage.model_dump() if response.usage else None
            result = self.validator.validate(
                extraction,
                context,
                model=response.model,
                provider=response.provider,
                fallback_used=response.fallback_used,
                token_usage=usage,
            )
            return result.model_copy(update={
                "latency_ms": max(0, int((perf_counter() - started) * 1000)),
                "retry_count": response.retry_count,
            })
        except AIResponseError as exc:
            return SecurityAssumptionResult(
                repository=context.repository,
                base_sha=context.base_sha,
                head_sha=context.head_sha,
                status="MALFORMED_OUTPUT",
                provider=response.provider if response else None,
                model=response.model if response else None,
                fallback_used=response.fallback_used if response else False,
                token_usage=response.usage.model_dump() if response and response.usage else None,
                error=str(exc),
                latency_ms=max(0, int((perf_counter() - started) * 1000)),
                retry_count=response.retry_count if response else 0,
            )
        except AIGatewayError as exc:
            return SecurityAssumptionResult(
                repository=context.repository,
                base_sha=context.base_sha,
                head_sha=context.head_sha,
                status="UNAVAILABLE",
                error=type(exc).__name__,
                latency_ms=max(0, int((perf_counter() - started) * 1000)),
                retry_count=getattr(exc, "retry_count", 0),
            )
