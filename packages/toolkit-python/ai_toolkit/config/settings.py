"""
Pydantic BaseSettings for all toolkit environment variables.

Provider-agnostic — supports any LLM provider. Set whichever API keys
you have. The LLM client auto-detects available providers from env vars.
"""

from pydantic import Field
from pydantic_settings import BaseSettings


class ToolkitSettings(BaseSettings):
    """All toolkit environment variables with validation and defaults."""

    model_config = {"env_prefix": "", "case_sensitive": True}

    # LLM — set whichever keys you have, auto-detected in priority order
    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    google_api_key: str | None = Field(default=None, alias="GOOGLE_API_KEY")
    groq_api_key: str | None = Field(default=None, alias="GROQ_API_KEY")

    # Database
    database_url: str | None = Field(default=None, alias="DATABASE_URL")

    # Redis / Cache
    redis_url: str | None = Field(default=None, alias="REDIS_URL")
    cache_default_ttl: int = Field(default=300, alias="CACHE_DEFAULT_TTL")

    # Auth
    api_key: str | None = Field(default=None, alias="API_KEY")

    # Observability
    langfuse_public_key: str | None = Field(default=None, alias="LANGFUSE_PUBLIC_KEY")
    langfuse_secret_key: str | None = Field(default=None, alias="LANGFUSE_SECRET_KEY")
    langfuse_base_url: str = Field(
        default="https://cloud.langfuse.com", alias="LANGFUSE_BASE_URL"
    )
    log_level: str = Field(default="info", alias="LOG_LEVEL")

    # Environment
    environment: str = Field(default="development", alias="ENVIRONMENT")

    def has(self, feature: str) -> bool:
        """Check if a feature is available based on env vars."""
        checks: dict[str, bool] = {
            "anthropic": self.anthropic_api_key is not None,
            "openai": self.openai_api_key is not None,
            "google": self.google_api_key is not None,
            "groq": self.groq_api_key is not None,
            "llm": any([
                self.anthropic_api_key,
                self.openai_api_key,
                self.google_api_key,
                self.groq_api_key,
            ]),
            "redis": self.redis_url is not None,
            "database": self.database_url is not None,
            "langfuse": (
                self.langfuse_public_key is not None and self.langfuse_secret_key is not None
            ),
        }
        return checks.get(feature, False)
