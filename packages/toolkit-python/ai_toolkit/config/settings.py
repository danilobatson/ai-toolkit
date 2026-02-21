"""
Pydantic BaseSettings for all toolkit environment variables.

Validates at startup. Missing ANTHROPIC_API_KEY? Clear error immediately,
not a cryptic failure 10 minutes later on the first LLM call.
"""

from pydantic import Field
from pydantic_settings import BaseSettings


class ToolkitSettings(BaseSettings):
    """All toolkit environment variables with validation and defaults."""

    model_config = {"env_prefix": "", "case_sensitive": True}

    # LLM
    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    llm_primary_model: str = Field(
        default="claude-sonnet-4-20250514", alias="LLM_PRIMARY_MODEL"
    )
    llm_fallback_model: str = Field(default="gpt-4o", alias="LLM_FALLBACK_MODEL")

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
            "redis": self.redis_url is not None,
            "database": self.database_url is not None,
            "langfuse": (
                self.langfuse_public_key is not None and self.langfuse_secret_key is not None
            ),
        }
        return checks.get(feature, False)
