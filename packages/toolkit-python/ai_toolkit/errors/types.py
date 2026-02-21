"""Typed error subtypes for each domain."""

from .base import ToolkitError


class LLMError(ToolkitError):
    """LLM provider returned an error."""

    def __init__(
        self,
        message: str,
        *,
        provider: str,
        model: str | None = None,
        code: str = "LLM_ERROR",
        status_code: int = 502,
        retryable: bool = False,
        cause: Exception | None = None,
    ) -> None:
        super().__init__(
            message, code=code, status_code=status_code, retryable=retryable, cause=cause
        )
        self.provider = provider
        self.model = model


class RateLimitError(ToolkitError):
    """Rate limit exceeded."""

    def __init__(
        self,
        message: str,
        *,
        retry_after: int | None = None,
        code: str = "RATE_LIMITED",
        cause: Exception | None = None,
    ) -> None:
        super().__init__(message, code=code, status_code=429, retryable=True, cause=cause)
        self.retry_after = retry_after


class AuthError(ToolkitError):
    """Authentication or authorization failure."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "AUTH_ERROR",
        status_code: int = 401,
        cause: Exception | None = None,
    ) -> None:
        super().__init__(message, code=code, status_code=status_code, retryable=False, cause=cause)


class ValidationError(ToolkitError):
    """Input validation failed."""

    def __init__(
        self,
        message: str,
        *,
        fields: dict[str, str] | None = None,
        code: str = "VALIDATION_ERROR",
        cause: Exception | None = None,
    ) -> None:
        super().__init__(message, code=code, status_code=400, retryable=False, cause=cause)
        self.fields = fields


class CacheError(ToolkitError):
    """Cache operation failed."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "CACHE_ERROR",
        cause: Exception | None = None,
    ) -> None:
        super().__init__(message, code=code, status_code=500, retryable=True, cause=cause)
