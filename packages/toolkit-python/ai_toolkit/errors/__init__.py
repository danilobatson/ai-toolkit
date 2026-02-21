"""Error hierarchy for the AI Toolkit."""

from .base import ToolkitError
from .types import AuthError, CacheError, LLMError, RateLimitError, ValidationError

__all__ = [
    "ToolkitError",
    "LLMError",
    "RateLimitError",
    "AuthError",
    "ValidationError",
    "CacheError",
]
