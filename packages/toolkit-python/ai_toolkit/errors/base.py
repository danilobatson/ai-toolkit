"""
Base error class for the AI Toolkit.

Every module wraps underlying errors into this hierarchy.
Mirrors the TypeScript SDK's error structure for consistency.
"""


class ToolkitError(Exception):
    """Base error for all toolkit operations."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "TOOLKIT_ERROR",
        status_code: int = 500,
        retryable: bool = False,
        cause: Exception | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.retryable = retryable
        self.cause = cause

    def to_dict(self) -> dict[str, object]:
        """Serialize for structured logging and API responses."""
        return {
            "error": self.__class__.__name__,
            "message": str(self),
            "code": self.code,
            "status_code": self.status_code,
            "retryable": self.retryable,
            "cause": str(self.cause) if self.cause else None,
        }
