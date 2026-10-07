from typing import TYPE_CHECKING, Optional

from app.core.config import settings
from app.core.logging_config import logger
from app.services.ai.exceptions import (
    AIGatewayError,
    AIModelUnavailableError,
    AIRateLimitError,
    AIResponseError,
    AIProviderError,
    AITimeoutError,
)
from app.services.ai.providers.base import BaseAIProvider
from app.services.ai.providers.groq_provider import GroqProvider
from app.services.ai.schemas import AICompletionRequest, AICompletionResponse

if TYPE_CHECKING:
    from app.services.ai.security_assumptions.schemas import (
        SecurityAssumptionContext,
        SecurityAssumptionResult,
    )


class AIModelGateway:
    """Central model-agnostic AI Gateway for VIGIL.

    Decouples callers from specific model providers (Groq, OpenAI, vLLM, Hugging Face),
    standardizing prompt submission, error normalization, and response parsing.
    """

    def __init__(self, provider: Optional[BaseAIProvider] = None):
        """Initialize the gateway.

        Args:
            provider: Pluggable AI provider. If omitted, defaults to OpenAICompatibleProvider
                      configured via app.core.config.settings.
        """
        self._provider = provider

    @property
    def provider(self) -> BaseAIProvider:
        """Lazily initialize default provider to avoid side effects or configuration checks on module import."""
        if self._provider is None:
            provider_name = settings.AI_PROVIDER.strip().lower()
            if provider_name != "groq":
                raise AIGatewayError(
                    f"Unsupported AI_PROVIDER '{settings.AI_PROVIDER}'. Configure AI_PROVIDER=groq."
                )
            self._provider = GroqProvider()
        return self._provider

    async def complete(self, request: AICompletionRequest) -> AICompletionResponse:
        """Submit a completion request to the active AI provider.

        Args:
            request: The AI completion request.

        Returns:
            AICompletionResponse: Normalized completion with generated content, model name, and usage.

        Raises:
            AIGatewayError: Normalized exception hierarchy representing any provider or configuration failures.
        """
        if not request.prompt or not request.prompt.strip():
            raise AIResponseError("Completion prompt cannot be empty or whitespace only.")

        try:
            try:
                response = await self.provider.complete(request)
                return response.model_copy(update={"provider": "groq", "fallback_used": False})
            except (AIModelUnavailableError, AIRateLimitError, AITimeoutError, AIProviderError) as exc:
                fallback_model = settings.AI_FALLBACK_MODEL.strip()
                primary_model = request.model or settings.AI_MODEL
                if not fallback_model or fallback_model == primary_model:
                    raise
                logger.warning(
                    "Primary Groq model failed; trying configured fallback (failure=%s)",
                    type(exc).__name__,
                )
                fallback_request = request.model_copy(update={"model": fallback_model})
                primary_retries = getattr(exc, "retry_count", 0)
                try:
                    fallback_response = await self.provider.complete(fallback_request)
                except AIGatewayError as fallback_error:
                    fallback_error.retry_count = primary_retries + getattr(fallback_error, "retry_count", 0)
                    raise
                return fallback_response.model_copy(update={
                    "provider": "groq", "fallback_used": True,
                    "retry_count": primary_retries + fallback_response.retry_count,
                })
        except AIGatewayError:
            raise
        except Exception as exc:
            logger.error(f"Unhandled exception caught in AIModelGateway: {type(exc).__name__}")
            raise AIGatewayError(f"Unexpected error in AIModelGateway: {str(exc)}") from exc

    async def generate_text(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        """High-level helper to generate a text completion and return only the generated text content."""
        request = AICompletionRequest(
            prompt=prompt,
            system_prompt=system_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        response = await self.complete(request)
        return response.content

    async def extract_security_assumptions(
        self, context: "SecurityAssumptionContext"
    ) -> "SecurityAssumptionResult":
        """Propose assumptions through the provider-neutral extraction boundary."""
        from app.services.ai.security_assumptions.engine import SecurityAssumptionEngine

        return await SecurityAssumptionEngine(gateway=self).extract(context)


# Default singleton instance for general application use
ai_gateway = AIModelGateway()
