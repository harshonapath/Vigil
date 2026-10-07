from unittest.mock import AsyncMock, MagicMock, patch
import pytest

import openai
from openai.types.chat import ChatCompletion, ChatCompletionMessage
from openai.types.chat.chat_completion import Choice
from openai.types.completion_usage import CompletionUsage

from app.core.config import settings
from app.services.ai.exceptions import (
    AIAuthenticationError,
    AIConfigurationError,
    AIGatewayError,
    AIProviderError,
    AIRateLimitError,
    AIResponseError,
    AITimeoutError,
)
from app.services.ai.gateway import AIModelGateway
from app.services.ai.providers.base import BaseAIProvider
from app.services.ai.providers.mock_provider import MockProvider
from app.services.ai.providers.openai_provider import OpenAICompatibleProvider
from app.services.ai.schemas import AICompletionRequest, AICompletionResponse


# 1. Valid AI completion using MockProvider
@pytest.mark.asyncio
async def test_valid_ai_completion_using_mock_provider():
    provider = MockProvider(default_response="System architecture is sound.")
    request = AICompletionRequest(
        prompt="Review this code snippet",
        system_prompt="You are a senior code reviewer",
        temperature=0.2,
    )
    response = await provider.complete(request)

    assert response.content == "System architecture is sound."
    assert response.model == "mock-model"
    assert response.finish_reason == "stop"
    assert response.usage is not None
    assert response.usage.prompt_tokens > 0
    assert provider.call_count == 1
    assert provider.last_request == request


# 2. Gateway returns normalized AICompletionResponse
@pytest.mark.asyncio
async def test_gateway_returns_normalized_response():
    provider = MockProvider(default_response="LGTM, no issues detected.")
    gateway = AIModelGateway(provider=provider)
    request = AICompletionRequest(prompt="Check this pull request")

    response = await gateway.complete(request)

    assert isinstance(response, AICompletionResponse)
    assert response.content == "LGTM, no issues detected."
    assert response.model == "mock-model"


# 3. Missing API configuration is rejected
@pytest.mark.asyncio
async def test_missing_api_configuration_rejected():
    provider = OpenAICompatibleProvider(api_key="")
    gateway = AIModelGateway(provider=provider)
    request = AICompletionRequest(prompt="Test prompt")

    with pytest.raises(AIConfigurationError) as exc_info:
        await gateway.complete(request)

    assert "AI_API_KEY is not configured" in str(exc_info.value)


# 4. Provider timeout is converted to AITimeoutError
@pytest.mark.asyncio
async def test_provider_timeout_converted_to_ai_timeout_error():
    provider = MockProvider(simulate_timeout=True)
    gateway = AIModelGateway(provider=provider)
    request = AICompletionRequest(prompt="Test prompt")

    with pytest.raises(AITimeoutError) as exc_info:
        await gateway.complete(request)

    assert isinstance(exc_info.value, AIGatewayError)
    assert "timeout" in str(exc_info.value).lower()


# 5. Provider failure is converted to AIGatewayError / AIProviderError
@pytest.mark.asyncio
async def test_provider_failure_converted_to_ai_provider_error():
    provider = MockProvider(simulate_provider_error=True)
    gateway = AIModelGateway(provider=provider)
    request = AICompletionRequest(prompt="Test prompt")

    with pytest.raises(AIProviderError) as exc_info:
        await gateway.complete(request)

    assert isinstance(exc_info.value, AIGatewayError)
    assert exc_info.value.status_code == 502


# 6. Empty provider response is rejected
@pytest.mark.asyncio
async def test_empty_provider_response_rejected_by_mock():
    # When provider returns empty choices or empty content, openai_provider throws AIResponseError
    mock_client = MagicMock()
    mock_response = MagicMock(spec=ChatCompletion)
    mock_response.choices = [
        MagicMock(message=MagicMock(content="   "), finish_reason="stop")
    ]
    mock_response.model = "Qwen/Qwen3-8B"
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    provider = OpenAICompatibleProvider(api_key="test-key", client=mock_client)
    gateway = AIModelGateway(provider=provider)
    request = AICompletionRequest(prompt="Test prompt")

    with pytest.raises(AIResponseError) as exc_info:
        await gateway.complete(request)

    assert "empty or blank" in str(exc_info.value).lower()


# 7. Retry behavior is bounded
@pytest.mark.asyncio
async def test_retry_behavior_is_bounded(monkeypatch):
    mock_client = MagicMock()
    # Simulate repeated 429 RateLimitError
    dummy_response = MagicMock()
    dummy_response.status_code = 429
    dummy_response.headers = {}
    mock_client.chat.completions.create = AsyncMock(
        side_effect=openai.RateLimitError(
            message="Rate limit hit",
            response=dummy_response,
            body={"error": "rate limit"},
        )
    )

    max_retries = 2
    provider = OpenAICompatibleProvider(
        api_key="test-key",
        max_retries=max_retries,
        client=mock_client,
    )
    gateway = AIModelGateway(provider=provider)
    monkeypatch.setattr(settings, "AI_FALLBACK_MODEL", settings.AI_MODEL)
    request = AICompletionRequest(prompt="Test retry bounded")

    with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        with pytest.raises(AIRateLimitError):
            await gateway.complete(request)

        # Expected calls: 1 initial + 2 retries = 3 calls
        assert mock_client.chat.completions.create.call_count == max_retries + 1
        assert mock_sleep.call_count == max_retries


@pytest.mark.asyncio
async def test_gateway_uses_configured_fallback_after_primary_failure(monkeypatch):
    class FallbackProvider(BaseAIProvider):
        def __init__(self):
            self.models = []

        async def complete(self, request):
            self.models.append(request.model or settings.AI_MODEL)
            if len(self.models) == 1:
                raise AIRateLimitError("limited")
            return AICompletionResponse(content='{"assumptions":[]}', model=request.model, finish_reason="stop")

    monkeypatch.setattr(settings, "AI_MODEL", "openai/gpt-oss-120b")
    monkeypatch.setattr(settings, "AI_FALLBACK_MODEL", "openai/gpt-oss-20b")
    provider = FallbackProvider()
    response = await AIModelGateway(provider=provider).complete(AICompletionRequest(prompt="test"))
    assert provider.models == ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]
    assert response.fallback_used is True
    assert response.retry_count == 0


# 8. Gateway does not expose raw provider-specific exceptions
@pytest.mark.asyncio
async def test_gateway_does_not_expose_raw_provider_exceptions():
    mock_client = MagicMock()
    # Simulate APIConnectionError
    mock_client.chat.completions.create = AsyncMock(
        side_effect=openai.APIConnectionError(request=MagicMock())
    )

    provider = OpenAICompatibleProvider(
        api_key="test-key",
        max_retries=0,
        client=mock_client,
    )
    gateway = AIModelGateway(provider=provider)
    request = AICompletionRequest(prompt="Test connection error")

    with pytest.raises(AIProviderError) as exc_info:
        await gateway.complete(request)

    assert not isinstance(exc_info.value, openai.OpenAIError)
    assert isinstance(exc_info.value, AIGatewayError)


@pytest.mark.asyncio
async def test_authentication_error_is_not_retried():
    mock_client = MagicMock()
    dummy_response = MagicMock()
    dummy_response.status_code = 401
    mock_client.chat.completions.create = AsyncMock(
        side_effect=openai.AuthenticationError(
            message="Invalid API Key",
            response=dummy_response,
            body={"error": "unauthorized"},
        )
    )

    provider = OpenAICompatibleProvider(
        api_key="invalid-key",
        max_retries=3,
        client=mock_client,
    )
    gateway = AIModelGateway(provider=provider)
    request = AICompletionRequest(prompt="Test auth")

    with pytest.raises(AIAuthenticationError):
        await gateway.complete(request)

    # Auth errors must fail immediately on the 1st attempt without retries
    assert mock_client.chat.completions.create.call_count == 1


# 9. Model can be configured through settings
@pytest.mark.asyncio
async def test_model_configured_through_settings():
    provider = OpenAICompatibleProvider(api_key="test-key")
    assert provider.default_model == settings.AI_MODEL
    # The provider intentionally has no hard-coded model default. Deployments
    # must supply AI_MODEL; per-request overrides remain supported.

    # Per-request model override works
    mock_provider = MockProvider()
    gateway = AIModelGateway(provider=mock_provider)
    request = AICompletionRequest(prompt="Code review", model="custom-ai/review-model")
    response = await gateway.complete(request)
    assert response.model == "custom-ai/review-model"


# 10. Mock provider performs no network calls
@pytest.mark.asyncio
async def test_mock_provider_performs_no_network_calls():
    provider = MockProvider(default_response="Safe offline completion")
    gateway = AIModelGateway(provider=provider)
    request = AICompletionRequest(prompt="Analyze commit")

    response = await gateway.complete(request)

    assert response.content == "Safe offline completion"
    assert provider.call_count == 1


# 11. High-level generate_text helper works
@pytest.mark.asyncio
async def test_generate_text_helper():
    provider = MockProvider(default_response="Direct text content")
    gateway = AIModelGateway(provider=provider)

    result = await gateway.generate_text(
        prompt="Summarize commit message",
        system_prompt="You are a helper",
    )

    assert result == "Direct text content"


# 12. Empty prompt rejected
@pytest.mark.asyncio
async def test_empty_prompt_rejected():
    gateway = AIModelGateway(provider=MockProvider())
    with pytest.raises(AIResponseError):
        await gateway.complete(AICompletionRequest(prompt="   "))
