"""One-call setup for the toolkit."""

from .settings import ToolkitSettings


def init_toolkit() -> ToolkitSettings:
    """
    Initialize the toolkit by loading and validating all env vars.

    Reads from environment variables and .env file automatically
    (Pydantic BaseSettings behavior). Fails fast with clear errors
    if required variables are missing or invalid.

    Usage::

        settings = init_toolkit()
        settings.has("llm")       # True if any LLM key is set
        settings.has("google")    # True if GOOGLE_API_KEY is set
        settings.has("redis")     # check feature availability
    """
    return ToolkitSettings()  # type: ignore[call-arg]
