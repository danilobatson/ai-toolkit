"""
LLM Provider interface and built-in adapters.

Users can use any built-in provider or implement their own by
subclassing ``LLMProvider``.

Built-in providers:
- ``AnthropicProvider`` — Claude models
- ``OpenAIProvider`` — GPT models
- ``GoogleProvider`` — Gemini models (has a free tier)
- ``GroqProvider`` — Llama/Mixtral via Groq (has a free tier)
- ``OllamaProvider`` — Any local model via Ollama (always free)

Usage::

    from ai_toolkit.llm.providers import GoogleProvider, AnthropicProvider

    # Single provider (model is always explicit — no hidden defaults)
    llm = create_llm_client(providers=[GoogleProvider(model="gemini-2.0-flash")])

    # Fallback chain: free primary → paid backup
    llm = create_llm_client(providers=[
        GoogleProvider(model="gemini-2.0-flash"),
        AnthropicProvider(model="claude-sonnet-4-20250514"),
    ])

    # Custom provider — implement the LLMProvider interface
    class MyProvider(LLMProvider):
        name = "my-llm"
        async def complete(self, prompt, *, system, temperature, max_tokens): ...
        async def stream(self, prompt, *, system, temperature, max_tokens): ...
"""

from __future__ import annotations

import abc
import os
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from ai_toolkit.errors import LLMError, RateLimitError


# ─── Response Type ───────────────────────────────────────────────────────────


@dataclass
class LLMResponse:
    """Standard response from any LLM provider."""

    content: str
    model: str
    provider: str
    input_tokens: int
    output_tokens: int
    latency_ms: float
    cost: float
    cached: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


# ─── Provider Interface ──────────────────────────────────────────────────────


class LLMProvider(abc.ABC):
    """
    Abstract base class for LLM providers.

    Implement ``complete()`` and ``stream()`` to add a new provider.
    The LLMClient handles retry, fallback, and circuit breaking on top.
    """

    @property
    @abc.abstractmethod
    def name(self) -> str:
        """Provider name (e.g., 'anthropic', 'openai', 'google')."""
        ...

    @property
    @abc.abstractmethod
    def model(self) -> str:
        """Model identifier (e.g., 'claude-sonnet-4-20250514', 'gemini-2.0-flash')."""
        ...

    @abc.abstractmethod
    async def complete(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        """Send a completion request and return the full response."""
        ...

    @abc.abstractmethod
    async def stream(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        """Stream a completion, yielding text chunks."""
        ...

    @property
    def key(self) -> str:
        """Unique key for circuit breaker tracking."""
        return f"{self.name}:{self.model}"


# ─── Pricing Registry ────────────────────────────────────────────────────────

# Per 1M tokens. Users can extend via register_pricing().
_PRICING: dict[str, dict[str, float]] = {
    # Anthropic
    "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
    "claude-haiku-4-5-20251001": {"input": 0.80, "output": 4.00},
    # OpenAI
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    # Google — free tier exists
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    "gemini-2.0-flash-lite": {"input": 0.0, "output": 0.0},
    "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
    # Groq — free tier exists
    "llama-3.3-70b-versatile": {"input": 0.59, "output": 0.79},
    "llama-3.1-8b-instant": {"input": 0.05, "output": 0.08},
    "mixtral-8x7b-32768": {"input": 0.24, "output": 0.24},
    # Ollama — always free
    # (local models have no API cost, but user can register compute costs)
}


def register_pricing(model: str, input_per_million: float, output_per_million: float) -> None:
    """Register or override pricing for a model."""
    _PRICING[model] = {"input": input_per_million, "output": output_per_million}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Estimate cost in USD for a given model and token counts."""
    prices = _PRICING.get(model)
    if not prices:
        return 0.0
    return (input_tokens * prices["input"] + output_tokens * prices["output"]) / 1_000_000


# ─── Built-in Providers ──────────────────────────────────────────────────────


class AnthropicProvider(LLMProvider):
    """Anthropic Claude models."""

    def __init__(
        self,
        *,
        model: str,
        api_key: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.0,
    ) -> None:
        self._model = model
        self._max_tokens = max_tokens
        self._temperature = temperature

        key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise LLMError(
                "Anthropic API key required. Set ANTHROPIC_API_KEY or pass api_key=.",
                provider="anthropic",
                code="LLM_NO_API_KEYS",
            )

        try:
            import anthropic

            self._client = anthropic.AsyncAnthropic(api_key=key)
        except ImportError as e:
            raise LLMError(
                "anthropic SDK not installed. Run: uv add anthropic",
                provider="anthropic",
                code="LLM_MISSING_DEPENDENCY",
                cause=e,
            ) from e

    @property
    def name(self) -> str:
        return "anthropic"

    @property
    def model(self) -> str:
        return self._model

    async def complete(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        import anthropic

        start = time.monotonic()
        try:
            response = await self._client.messages.create(
                model=self._model,
                max_tokens=max_tokens or self._max_tokens,
                temperature=temperature if temperature is not None else self._temperature,
                system=system or "You are a helpful assistant.",
                messages=[{"role": "user", "content": prompt}],
            )
        except anthropic.RateLimitError as e:
            raise RateLimitError(f"Anthropic rate limited: {e}", cause=e) from e
        except anthropic.APIStatusError as e:
            raise LLMError(
                f"Anthropic API error: {e.status_code} {e.message}",
                provider="anthropic",
                model=self._model,
                code=f"LLM_API_{e.status_code}",
                status_code=e.status_code,
                retryable=e.status_code >= 500 or e.status_code == 429,
                cause=e,
            ) from e
        except anthropic.APIConnectionError as e:
            raise LLMError(
                f"Anthropic connection error: {e}",
                provider="anthropic",
                model=self._model,
                code="LLM_CONNECTION_ERROR",
                retryable=True,
                cause=e,
            ) from e

        latency = (time.monotonic() - start) * 1000
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens

        return LLMResponse(
            content=response.content[0].text,
            model=response.model,
            provider="anthropic",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency,
            cost=estimate_cost(response.model, input_tokens, output_tokens),
        )

    async def stream(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        import anthropic

        try:
            async with self._client.messages.stream(
                model=self._model,
                max_tokens=max_tokens or self._max_tokens,
                temperature=temperature if temperature is not None else self._temperature,
                system=system or "You are a helpful assistant.",
                messages=[{"role": "user", "content": prompt}],
            ) as stream:
                async for text in stream.text_stream:
                    yield text
        except anthropic.RateLimitError as e:
            raise RateLimitError(f"Anthropic rate limited: {e}", cause=e) from e
        except anthropic.APIStatusError as e:
            raise LLMError(
                f"Anthropic stream error: {e.status_code}",
                provider="anthropic",
                model=self._model,
                retryable=e.status_code >= 500,
                cause=e,
            ) from e


class OpenAIProvider(LLMProvider):
    """OpenAI GPT models."""

    def __init__(
        self,
        *,
        model: str,
        api_key: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.0,
    ) -> None:
        self._model = model
        self._max_tokens = max_tokens
        self._temperature = temperature

        key = api_key or os.environ.get("OPENAI_API_KEY")
        if not key:
            raise LLMError(
                "OpenAI API key required. Set OPENAI_API_KEY or pass api_key=.",
                provider="openai",
                code="LLM_NO_API_KEYS",
            )

        try:
            import openai

            self._client = openai.AsyncOpenAI(api_key=key)
        except ImportError as e:
            raise LLMError(
                "openai SDK not installed. Run: uv add openai",
                provider="openai",
                code="LLM_MISSING_DEPENDENCY",
                cause=e,
            ) from e

    @property
    def name(self) -> str:
        return "openai"

    @property
    def model(self) -> str:
        return self._model

    async def complete(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        import openai

        start = time.monotonic()
        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                max_tokens=max_tokens or self._max_tokens,
                temperature=temperature if temperature is not None else self._temperature,
                messages=[
                    {"role": "system", "content": system or "You are a helpful assistant."},
                    {"role": "user", "content": prompt},
                ],
            )
        except openai.RateLimitError as e:
            raise RateLimitError(f"OpenAI rate limited: {e}", cause=e) from e
        except openai.APIStatusError as e:
            raise LLMError(
                f"OpenAI API error: {e.status_code} {e.message}",
                provider="openai",
                model=self._model,
                code=f"LLM_API_{e.status_code}",
                status_code=e.status_code,
                retryable=e.status_code >= 500 or e.status_code == 429,
                cause=e,
            ) from e
        except openai.APIConnectionError as e:
            raise LLMError(
                f"OpenAI connection error: {e}",
                provider="openai",
                model=self._model,
                code="LLM_CONNECTION_ERROR",
                retryable=True,
                cause=e,
            ) from e

        latency = (time.monotonic() - start) * 1000
        usage = response.usage
        input_tokens = usage.prompt_tokens if usage else 0
        output_tokens = usage.completion_tokens if usage else 0

        return LLMResponse(
            content=response.choices[0].message.content or "",
            model=response.model,
            provider="openai",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency,
            cost=estimate_cost(response.model, input_tokens, output_tokens),
        )

    async def stream(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        import openai

        try:
            stream = await self._client.chat.completions.create(
                model=self._model,
                max_tokens=max_tokens or self._max_tokens,
                temperature=temperature if temperature is not None else self._temperature,
                messages=[
                    {"role": "system", "content": system or "You are a helpful assistant."},
                    {"role": "user", "content": prompt},
                ],
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    yield delta.content
        except openai.RateLimitError as e:
            raise RateLimitError(f"OpenAI rate limited: {e}", cause=e) from e
        except openai.APIStatusError as e:
            raise LLMError(
                f"OpenAI stream error: {e.status_code}",
                provider="openai",
                model=self._model,
                retryable=e.status_code >= 500,
                cause=e,
            ) from e


class GoogleProvider(LLMProvider):
    """
    Google Gemini models.

    Free tier: 15 RPM, 1M tokens/day, 1500 RPD on Gemini 2.0 Flash.
    Install: ``uv add google-genai``
    """

    def __init__(
        self,
        *,
        model: str,
        api_key: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.0,
    ) -> None:
        self._model = model
        self._max_tokens = max_tokens
        self._temperature = temperature

        key = api_key or os.environ.get("GOOGLE_API_KEY")
        if not key:
            raise LLMError(
                "Google API key required. Set GOOGLE_API_KEY or pass api_key=. "
                "Get a free key at https://aistudio.google.com/apikey",
                provider="google",
                code="LLM_NO_API_KEYS",
            )

        try:
            from google import genai

            self._client = genai.Client(api_key=key)
        except ImportError as e:
            raise LLMError(
                "google-genai SDK not installed. Run: uv add google-genai",
                provider="google",
                code="LLM_MISSING_DEPENDENCY",
                cause=e,
            ) from e

    @property
    def name(self) -> str:
        return "google"

    @property
    def model(self) -> str:
        return self._model

    async def complete(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        from google.genai import types

        start = time.monotonic()
        try:
            response = await self._client.aio.models.generate_content(
                model=self._model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system or "You are a helpful assistant.",
                    temperature=temperature if temperature is not None else self._temperature,
                    max_output_tokens=max_tokens or self._max_tokens,
                ),
            )
        except Exception as e:
            error_str = str(e)
            retryable = "429" in error_str or "500" in error_str or "503" in error_str
            raise LLMError(
                f"Google API error: {e}",
                provider="google",
                model=self._model,
                code="LLM_API_ERROR",
                retryable=retryable,
                cause=e,
            ) from e

        latency = (time.monotonic() - start) * 1000
        text = response.text or ""
        usage = response.usage_metadata
        input_tokens = usage.prompt_token_count if usage else 0
        output_tokens = usage.candidates_token_count if usage else 0

        return LLMResponse(
            content=text,
            model=self._model,
            provider="google",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency,
            cost=estimate_cost(self._model, input_tokens, output_tokens),
        )

    async def stream(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        from google.genai import types

        try:
            response = await self._client.aio.models.generate_content_stream(
                model=self._model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system or "You are a helpful assistant.",
                    temperature=temperature if temperature is not None else self._temperature,
                    max_output_tokens=max_tokens or self._max_tokens,
                ),
            )
            async for chunk in response:
                if chunk.text:
                    yield chunk.text
        except Exception as e:
            raise LLMError(
                f"Google stream error: {e}",
                provider="google",
                model=self._model,
                retryable=True,
                cause=e,
            ) from e


class GroqProvider(LLMProvider):
    """
    Groq — fast inference for open-source models.

    Free tier available. Models: llama-3.3-70b-versatile, mixtral-8x7b-32768, etc.
    Install: ``uv add groq``
    """

    def __init__(
        self,
        *,
        model: str,
        api_key: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.0,
    ) -> None:
        self._model = model
        self._max_tokens = max_tokens
        self._temperature = temperature

        key = api_key or os.environ.get("GROQ_API_KEY")
        if not key:
            raise LLMError(
                "Groq API key required. Set GROQ_API_KEY or pass api_key=. "
                "Get a free key at https://console.groq.com/keys",
                provider="groq",
                code="LLM_NO_API_KEYS",
            )

        try:
            from groq import AsyncGroq

            self._client = AsyncGroq(api_key=key)
        except ImportError as e:
            raise LLMError(
                "groq SDK not installed. Run: uv add groq",
                provider="groq",
                code="LLM_MISSING_DEPENDENCY",
                cause=e,
            ) from e

    @property
    def name(self) -> str:
        return "groq"

    @property
    def model(self) -> str:
        return self._model

    async def complete(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        start = time.monotonic()
        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                max_tokens=max_tokens or self._max_tokens,
                temperature=temperature if temperature is not None else self._temperature,
                messages=[
                    {"role": "system", "content": system or "You are a helpful assistant."},
                    {"role": "user", "content": prompt},
                ],
            )
        except Exception as e:
            error_str = str(e)
            retryable = "429" in error_str or "500" in error_str
            raise LLMError(
                f"Groq API error: {e}",
                provider="groq",
                model=self._model,
                code="LLM_API_ERROR",
                retryable=retryable,
                cause=e,
            ) from e

        latency = (time.monotonic() - start) * 1000
        usage = response.usage
        input_tokens = usage.prompt_tokens if usage else 0
        output_tokens = usage.completion_tokens if usage else 0

        return LLMResponse(
            content=response.choices[0].message.content or "",
            model=response.model or self._model,
            provider="groq",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency,
            cost=estimate_cost(self._model, input_tokens, output_tokens),
        )

    async def stream(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        try:
            stream = await self._client.chat.completions.create(
                model=self._model,
                max_tokens=max_tokens or self._max_tokens,
                temperature=temperature if temperature is not None else self._temperature,
                messages=[
                    {"role": "system", "content": system or "You are a helpful assistant."},
                    {"role": "user", "content": prompt},
                ],
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    yield delta.content
        except Exception as e:
            raise LLMError(
                f"Groq stream error: {e}",
                provider="groq",
                model=self._model,
                retryable=True,
                cause=e,
            ) from e


class OllamaProvider(LLMProvider):
    """
    Ollama — run any model locally. Always free.

    Requires Ollama running locally (``ollama serve``).
    Uses the OpenAI-compatible API endpoint.
    Install: ``uv add openai`` (uses OpenAI client with custom base_url)
    """

    def __init__(
        self,
        *,
        model: str,
        base_url: str = "http://localhost:11434/v1",
        max_tokens: int = 4096,
        temperature: float = 0.0,
    ) -> None:
        self._model = model
        self._max_tokens = max_tokens
        self._temperature = temperature
        self._base_url = base_url

        try:
            import openai

            # Ollama exposes an OpenAI-compatible API — no API key needed
            self._client = openai.AsyncOpenAI(
                base_url=base_url,
                api_key="ollama",  # required by SDK but not validated
            )
        except ImportError as e:
            raise LLMError(
                "openai SDK not installed (used for Ollama compatibility). Run: uv add openai",
                provider="ollama",
                code="LLM_MISSING_DEPENDENCY",
                cause=e,
            ) from e

    @property
    def name(self) -> str:
        return "ollama"

    @property
    def model(self) -> str:
        return self._model

    async def complete(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        start = time.monotonic()
        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                max_tokens=max_tokens or self._max_tokens,
                temperature=temperature if temperature is not None else self._temperature,
                messages=[
                    {"role": "system", "content": system or "You are a helpful assistant."},
                    {"role": "user", "content": prompt},
                ],
            )
        except Exception as e:
            raise LLMError(
                f"Ollama error: {e}. Is Ollama running? (ollama serve)",
                provider="ollama",
                model=self._model,
                code="LLM_CONNECTION_ERROR",
                retryable=True,
                cause=e,
            ) from e

        latency = (time.monotonic() - start) * 1000
        usage = response.usage
        input_tokens = usage.prompt_tokens if usage else 0
        output_tokens = usage.completion_tokens if usage else 0

        return LLMResponse(
            content=response.choices[0].message.content or "",
            model=self._model,
            provider="ollama",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency,
            cost=0.0,  # Local models are free
        )

    async def stream(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        try:
            stream = await self._client.chat.completions.create(
                model=self._model,
                max_tokens=max_tokens or self._max_tokens,
                temperature=temperature if temperature is not None else self._temperature,
                messages=[
                    {"role": "system", "content": system or "You are a helpful assistant."},
                    {"role": "user", "content": prompt},
                ],
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    yield delta.content
        except Exception as e:
            raise LLMError(
                f"Ollama stream error: {e}. Is Ollama running? (ollama serve)",
                provider="ollama",
                model=self._model,
                retryable=True,
                cause=e,
            ) from e


# ─── Auto-detect Providers ───────────────────────────────────────────────────


def auto_detect_providers() -> list[LLMProvider]:
    """
    Build a provider list from available environment variables.

    Checks in order: GOOGLE_API_KEY (free tier), GROQ_API_KEY (free tier),
    ANTHROPIC_API_KEY, OPENAI_API_KEY. Returns providers for all keys found.

    Model defaults used here are intentionally simple. For production,
    pass explicit providers with your chosen models to create_llm_client().
    """
    providers: list[LLMProvider] = []

    # Free tiers first
    if os.environ.get("GOOGLE_API_KEY"):
        try:
            providers.append(GoogleProvider(model="gemini-2.0-flash"))
        except LLMError:
            pass  # SDK not installed

    if os.environ.get("GROQ_API_KEY"):
        try:
            providers.append(GroqProvider(model="llama-3.3-70b-versatile"))
        except LLMError:
            pass

    # Paid providers as fallback
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            providers.append(AnthropicProvider(model="claude-sonnet-4-20250514"))
        except LLMError:
            pass

    if os.environ.get("OPENAI_API_KEY"):
        try:
            providers.append(OpenAIProvider(model="gpt-4o"))
        except LLMError:
            pass

    return providers
