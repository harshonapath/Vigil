from typing import Optional

from openai import AsyncOpenAI

from app.core.config import settings
from app.services.ai.providers.openai_provider import OpenAICompatibleProvider


class GroqProvider(OpenAICompatibleProvider):
    """Groq inference adapter using the shared OpenAI-compatible transport."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        default_model: Optional[str] = None,
        timeout: Optional[float] = None,
        max_retries: Optional[int] = None,
        client: Optional[AsyncOpenAI] = None,
    ):
        super().__init__(
            api_key=api_key or settings.GROQ_API_KEY or settings.AI_API_KEY,
            base_url=base_url or settings.AI_BASE_URL,
            default_model=default_model or settings.AI_MODEL,
            timeout=timeout,
            max_retries=max_retries,
            client=client,
        )
