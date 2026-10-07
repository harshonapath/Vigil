from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, Field


class AIUsageInfo(BaseModel):
    """Token usage metrics reported by the underlying model provider."""

    model_config = ConfigDict(extra="ignore")

    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None


class AICompletionRequest(BaseModel):
    """Model-agnostic request schema for AI text completions."""

    model_config = ConfigDict(extra="ignore")

    prompt: str = Field(..., min_length=1, description="Primary prompt or user instructions.")
    system_prompt: Optional[str] = Field(
        default=None,
        description="System prompt defining persona, constraints, or directives.",
    )
    model: Optional[str] = Field(
        default=None,
        description="Optional model identifier override (defaults to configured AI_MODEL).",
    )
    temperature: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=2.0,
        description="Sampling temperature between 0.0 and 2.0.",
    )
    max_tokens: Optional[int] = Field(
        default=None,
        gt=0,
        description="Maximum number of tokens to generate.",
    )
    response_format: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Provider-neutral structured response format, such as JSON mode.",
    )


class AICompletionResponse(BaseModel):
    """Normalized response schema returned by AIModelGateway and its providers."""

    model_config = ConfigDict(extra="ignore")

    content: str = Field(..., description="Generated text content from the model.")
    model: str = Field(..., description="Model name or identifier that produced the completion.")
    usage: Optional[AIUsageInfo] = Field(
        default=None,
        description="Token usage statistics if provided by the model backend.",
    )
    finish_reason: Optional[str] = Field(
        default=None,
        description="Termination reason (e.g. 'stop', 'length').",
    )
    provider: Optional[str] = None
    fallback_used: bool = False
    retry_count: int = 0
