import asyncio
from typing import Any, Dict, List, Optional

import openai
from openai import AsyncOpenAI

from app.core.config import settings
from app.core.logging_config import logger
from app.services.ai.exceptions import (
    AIAuthenticationError,
    AIConfigurationError,
    AIGatewayError,
    AIProviderError,
    AIRateLimitError,
    AIResponseError,
    AIModelUnavailableError,
    AITimeoutError,
)
from app.services.ai.providers.base import BaseAIProvider
from app.services.ai.schemas import AICompletionRequest, AICompletionResponse, AIUsageInfo


class OpenAICompatibleProvider(BaseAIProvider):
    """Asynchronous provider for OpenAI-compatible model endpoints.

    Supports Groq's OpenAI-compatible endpoint and compatible providers while
    keeping HTTP/model details behind the provider boundary.

    The gateway keeps provider-specific HTTP handling behind this adapter.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        default_model: Optional[str] = None,
        timeout: Optional[float] = None,
        max_retries: Optional[int] = None,
        client: Optional[AsyncOpenAI] = None,
    ):
        self.api_key = api_key if api_key is not None else settings.AI_API_KEY
        self.base_url = base_url if base_url is not None else settings.AI_BASE_URL
        self.default_model = default_model if default_model is not None else settings.AI_MODEL
        self.timeout = timeout if timeout is not None else settings.AI_TIMEOUT_SECONDS
        self.max_retries = max_retries if max_retries is not None else settings.AI_MAX_RETRIES

        self._custom_client = client is not None
        self._client: Optional[AsyncOpenAI] = client

    def _get_client(self) -> AsyncOpenAI:
        if not self.api_key or not self.api_key.strip():
            raise AIConfigurationError(
                "AI_API_KEY is not configured or is empty. Please set AI_API_KEY in the environment or settings."
            )

        if not self._custom_client:
            clean_base_url = self.base_url.strip() if self.base_url and self.base_url.strip() else None
            return AsyncOpenAI(
                api_key=self.api_key,
                base_url=clean_base_url,
                timeout=self.timeout,
                max_retries=0,
            )

        if self._client is None:
            clean_base_url = self.base_url.strip() if self.base_url and self.base_url.strip() else None
            self._client = AsyncOpenAI(
                api_key=self.api_key,
                base_url=clean_base_url,
                timeout=self.timeout,
                max_retries=0,
            )
        return self._client

    async def complete(self, request: AICompletionRequest) -> AICompletionResponse:
        client = self._get_client()

        model_name = request.model or self.default_model
        if not model_name or not model_name.strip():
            raise AIConfigurationError("Model name is not specified and no default AI_MODEL is configured.")

        messages: List[Dict[str, str]] = []
        if request.system_prompt and request.system_prompt.strip():
            messages.append({"role": "system", "content": request.system_prompt.strip()})
        messages.append({"role": "user", "content": request.prompt})

        payload: Dict[str, Any] = {
            "model": model_name,
            "messages": messages,
        }
        if request.temperature is not None:
            payload["temperature"] = request.temperature
        if request.max_tokens is not None:
            payload["max_tokens"] = request.max_tokens
        if request.response_format is not None:
            payload["response_format"] = request.response_format

        last_transient_error: Optional[Exception] = None

        for attempt in range(self.max_retries + 1):
            try:
                response = await client.chat.completions.create(**payload)
                return self._parse_response(response, model_name).model_copy(update={"retry_count": attempt})

            except (openai.AuthenticationError, openai.PermissionDeniedError) as exc:
                # Authentication failures must not be retried
                logger.error("AI provider authentication failure: credentials rejected")
                raise AIAuthenticationError("AI provider authentication failed: invalid credentials or forbidden access.") from exc

            except openai.BadRequestError as exc:
                # Bad requests (malformed payload/parameters) must not be retried
                logger.error("AI provider bad request error")
                message = (getattr(exc, "message", "") or "").casefold()
                if "model" in message and any(term in message for term in ("not found", "unavailable", "access", "decommission")):
                    raise AIModelUnavailableError("Configured AI model is unavailable.") from exc
                raise AIProviderError(f"AI provider rejected request: {exc.message}") from exc

            except openai.RateLimitError as exc:
                last_transient_error = AIRateLimitError("AI provider rate limit exceeded. Please try again later.")
                if attempt < self.max_retries:
                    backoff = min(0.2 * (2**attempt), 2.0)
                    logger.warning(f"AI provider rate limited (attempt {attempt + 1}/{self.max_retries + 1}), retrying in {backoff:.2f}s...")
                    await asyncio.sleep(backoff)
                    continue
                last_transient_error.retry_count = attempt
                raise last_transient_error from exc

            except openai.APITimeoutError as exc:
                last_transient_error = AITimeoutError(f"AI provider request timed out after {self.timeout} seconds.")
                if attempt < self.max_retries:
                    backoff = min(0.2 * (2**attempt), 2.0)
                    logger.warning(f"AI provider timed out (attempt {attempt + 1}/{self.max_retries + 1}), retrying in {backoff:.2f}s...")
                    await asyncio.sleep(backoff)
                    continue
                last_transient_error.retry_count = attempt
                raise last_transient_error from exc

            except (openai.APIConnectionError, openai.InternalServerError) as exc:
                last_transient_error = AIProviderError("AI provider connectivity or internal server error.")
                if attempt < self.max_retries:
                    backoff = min(0.2 * (2**attempt), 2.0)
                    logger.warning(f"AI provider server/network error (attempt {attempt + 1}/{self.max_retries + 1}), retrying in {backoff:.2f}s...")
                    await asyncio.sleep(backoff)
                    continue
                last_transient_error.retry_count = attempt
                raise last_transient_error from exc

            except openai.APIError as exc:
                logger.error("AI provider API error encountered")
                raise AIProviderError(f"AI provider returned an API error: {exc.message}") from exc

            except AIGatewayError:
                raise

            except Exception as exc:
                logger.error(f"Unexpected exception during AI completion: {type(exc).__name__}")
                raise AIProviderError(f"Unexpected failure during AI completion: {type(exc).__name__}") from exc

        if last_transient_error:
            raise last_transient_error
        raise AIProviderError("AI completion failed after maximum retry attempts.")

    def _parse_response(self, response: Any, fallback_model: str) -> AICompletionResponse:
        if not hasattr(response, "choices") or not response.choices:
            raise AIResponseError("AI provider returned an empty choices list.")

        first_choice = response.choices[0]
        message = getattr(first_choice, "message", None)
        content = getattr(message, "content", None) if message else None

        if content is None or not content.strip():
            raise AIResponseError("AI provider returned an empty or blank response content.")

        response_model = getattr(response, "model", None) or fallback_model
        finish_reason = getattr(first_choice, "finish_reason", None)

        usage_info: Optional[AIUsageInfo] = None
        raw_usage = getattr(response, "usage", None)
        if raw_usage is not None:
            usage_info = AIUsageInfo(
                prompt_tokens=getattr(raw_usage, "prompt_tokens", None),
                completion_tokens=getattr(raw_usage, "completion_tokens", None),
                total_tokens=getattr(raw_usage, "total_tokens", None),
            )

        return AICompletionResponse(
            content=content,
            model=response_model,
            usage=usage_info,
            finish_reason=finish_reason,
            provider="groq",
        )
