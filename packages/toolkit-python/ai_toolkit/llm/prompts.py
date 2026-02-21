"""
Versioned prompt management via Langfuse.

Fetch, cache, and A/B test prompts without redeploying.
Falls back to local defaults if Langfuse is unavailable.

Usage::

    from ai_toolkit.llm.prompts import PromptManager

    pm = PromptManager()  # connects to Langfuse via env vars
    prompt = await pm.get("rag-system-prompt", version="latest")
    # or with variables
    prompt = await pm.get("triage-agent", variables={"severity": "high"})
"""

from __future__ import annotations

import os
import string
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Prompt:
    """A resolved prompt with metadata."""

    name: str
    text: str
    version: str = "local"
    source: str = "local"
    """'langfuse' or 'local'"""
    metadata: dict[str, Any] = field(default_factory=dict)


class PromptManager:
    """
    Fetch versioned prompts from Langfuse with local fallback.

    Requires LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY env vars
    for Langfuse mode. Without them, uses local defaults only.
    """

    def __init__(
        self,
        *,
        defaults: dict[str, str] | None = None,
        langfuse_host: str | None = None,
    ) -> None:
        """
        Args:
            defaults: Local fallback prompts {name: template_string}
            langfuse_host: Langfuse API host (default from LANGFUSE_HOST env)
        """
        self._defaults = defaults or {}
        self._langfuse: Any = None
        self._cache: dict[str, Prompt] = {}

        # Try to init Langfuse client
        public_key = os.environ.get("LANGFUSE_PUBLIC_KEY")
        secret_key = os.environ.get("LANGFUSE_SECRET_KEY")
        host = langfuse_host or os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com")

        if public_key and secret_key:
            try:
                from langfuse import Langfuse

                self._langfuse = Langfuse(
                    public_key=public_key,
                    secret_key=secret_key,
                    host=host,
                )
            except ImportError:
                pass  # Langfuse not installed — use local only

    async def get(
        self,
        name: str,
        *,
        version: str | None = None,
        variables: dict[str, str] | None = None,
    ) -> Prompt:
        """
        Get a prompt by name.

        Tries Langfuse first, falls back to local defaults.
        Applies variable substitution if provided.

        Args:
            name: Prompt name
            version: Specific version (None = latest)
            variables: Template variables to substitute
        """
        cache_key = f"{name}:{version or 'latest'}"

        # Check cache
        if cache_key in self._cache:
            prompt = self._cache[cache_key]
            text = self._substitute(prompt.text, variables)
            return Prompt(
                name=prompt.name,
                text=text,
                version=prompt.version,
                source=prompt.source,
                metadata=prompt.metadata,
            )

        # Try Langfuse
        if self._langfuse:
            try:
                lf_prompt = self._langfuse.get_prompt(name, version=version)
                text = lf_prompt.prompt if hasattr(lf_prompt, "prompt") else str(lf_prompt)

                prompt = Prompt(
                    name=name,
                    text=text,
                    version=str(version or "latest"),
                    source="langfuse",
                    metadata={"langfuse_id": getattr(lf_prompt, "id", None)},
                )
                self._cache[cache_key] = prompt

                final_text = self._substitute(prompt.text, variables)
                return Prompt(
                    name=name, text=final_text,
                    version=prompt.version, source="langfuse",
                    metadata=prompt.metadata,
                )
            except Exception:
                pass  # Fall through to local

        # Local fallback
        if name in self._defaults:
            text = self._substitute(self._defaults[name], variables)
            prompt = Prompt(name=name, text=text, version="local", source="local")
            self._cache[cache_key] = Prompt(
                name=name, text=self._defaults[name], version="local", source="local"
            )
            return prompt

        raise KeyError(
            f"Prompt '{name}' not found in Langfuse or local defaults. "
            f"Available defaults: {list(self._defaults.keys())}"
        )

    def register(self, name: str, template: str) -> None:
        """Register a local prompt template."""
        self._defaults[name] = template
        # Invalidate cache
        keys_to_remove = [k for k in self._cache if k.startswith(f"{name}:")]
        for k in keys_to_remove:
            del self._cache[k]

    def clear_cache(self) -> None:
        """Clear the prompt cache (forces re-fetch from Langfuse)."""
        self._cache.clear()

    @staticmethod
    def _substitute(template: str, variables: dict[str, str] | None) -> str:
        """Substitute ${var} and {var} style variables."""
        if not variables:
            return template

        result = template
        for key, value in variables.items():
            result = result.replace(f"${{{key}}}", value)
            result = result.replace(f"{{{key}}}", value)
        return result
