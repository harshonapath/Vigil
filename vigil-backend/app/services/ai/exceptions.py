from app.core.exceptions import VigilException


class AIGatewayError(VigilException):
    """Base exception for all AI Gateway errors in VIGIL."""

    def __init__(self, message: str = "AI Gateway encountered an error", status_code: int = 502):
        super().__init__(message=message, status_code=status_code)


class AIConfigurationError(AIGatewayError):
    """Raised when the AI gateway or provider is missing required configuration."""

    def __init__(self, message: str = "AI configuration is invalid or missing"):
        super().__init__(message=message, status_code=500)


class AIAuthenticationError(AIGatewayError):
    """Raised when authentication with the AI provider fails (e.g., invalid API key)."""

    def __init__(self, message: str = "AI provider authentication failed"):
        super().__init__(message=message, status_code=401)


class AIRateLimitError(AIGatewayError):
    """Raised when requests exceed provider rate limits or quota."""

    def __init__(self, message: str = "AI provider rate limit exceeded"):
        super().__init__(message=message, status_code=429)


class AITimeoutError(AIGatewayError):
    """Raised when an AI completion request exceeds the configured timeout."""

    def __init__(self, message: str = "AI provider request timed out"):
        super().__init__(message=message, status_code=504)


class AIProviderError(AIGatewayError):
    """Raised when an upstream AI provider reports an internal server or connectivity error."""

    def __init__(self, message: str = "Upstream AI provider error occurred"):
        super().__init__(message=message, status_code=502)


class AIModelUnavailableError(AIProviderError):
    """Configured model is unavailable and a configured fallback may be tried."""


class AIResponseError(AIGatewayError):
    """Raised when the AI provider returns an empty, invalid, or malformed response."""

    def __init__(self, message: str = "AI provider returned an empty or malformed response"):
        super().__init__(message=message, status_code=502)
