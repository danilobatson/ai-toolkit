"""
Production LLM client with retry, fallback, circuit breaker, and streaming.

Supports Anthropic (primary) and OpenAI (fallback). Every call is traced,
cost-tracked, and wrapped in the ToolkitError hierarchy.

Usage::

    from ai_toolkit.llm import create_llm_client

    llm = create_llm_client()
    response = await llm.complete("Summarize this document", system="You are a helpful assistant.")
    print(response.content)
    print(f"Cost: ${response.cost:.4f}")

    # Streaming
    async for chunk in llm.stream("Explain RAG architecture"):
        print(chunk, end="", flush=True)
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from ai_toolkit.errors import LLMError, RateLimitError


# ─── Response Types ──────────────────────────────────────────────────────────


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


@dataclass
class LLMConfig:
    """Configuration for an LLM provider."""

    provider: str  # "anthropic" or "openai"
    model: str
    api_key: str
    max_tokens: int = 4096
    temperature: float = 0.0


# ─── Cost Tracking ───────────────────────────────────────────────────────────

# Pricing per 1M tokens (as of Feb 2026)
PRICING: dict[str, dict[str, float]] = {
    "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
    "claude-haiku-4-5-20251001": {"input": 0.80, "output": 4.00},
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Estimate cost in USD for a given model and token counts."""
    prices = PRICING.get(model)
    if not prices:
        return 0.0
    return (input_tokens * prices["input"] + output_tokens * prices["output"]) / 1_000_000


# ─── Circuit Breaker ─────────────────────────────────────────────────────────


class CircuitState(Enum):
    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Failing, reject requests
    HALF_OPEN = "half_open"  # Test with one request


class CircuitBreaker:
    """
    Per-provider circuit breaker.

    After `threshold` consecutive failures, the circuit opens and all requests
    fail immediately (no wasted API calls). After `reset_ms`, it enters
    half-open state and allows one test request through.
    """

    def __init__(self, threshold: int = 5, reset_ms: int = 30_000) -> None:
        self._threshold = threshold
        self._reset_ms = reset_ms
        self._failures = 0
        self._last_failure_time = 0.0
        self._state = CircuitState.CLOSED

    @property
    def state(self) -> CircuitState:
        if self._state == CircuitState.OPEN:
            elapsed = (time.monotonic() - self._last_failure_time) * 1000
            if elapsed > self._reset_ms:
                self._state = CircuitState.HALF_OPEN
        return self._state

    def can_execute(self) -> bool:
        """Check if a request is allowed through."""
        return self.state != CircuitState.OPEN

    def record_success(self) -> None:
        """Record a successful call. Resets the circuit."""
        self._failures = 0
        self._state = CircuitState.CLOSED

    def record_failure(self) -> None:
        """Record a failed call. Opens circuit after threshold."""
        self._failures += 1
        self._last_failure_time = time.monotonic()
        if self._failures >= self._threshold:
            self._state = CircuitState.OPEN


# ─── Provider Adapters ───────────────────────────────────────────────────────


class AnthropicAdapter:
    """Adapter for the Anthropic API."""

    def __init__(self, config: LLMConfig) -> None:
        try:
            import anthropic

            self._client = anthropic.AsyncAnthropic(api_key=config.api_key)
        except ImportError as e:
            raise LLMError(
                "Anthropic SDK not installed. Run: uv add anthropic",
                provider="anthropic",
                code="LLM_MISSING_DEPENDENCY",
                cause=e,
            ) from e
        self._config = config

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
                model=self._config.model,
                max_tokens=max_tokens or self._config.max_tokens,
                temperature=temperature if temperature is not None else self._config.temperature,
                system=system or "You are a helpful assistant.",
                messages=[{"role": "user", "content": prompt}],
            )
        except anthropic.RateLimitError as e:
            raise RateLimitError(
                f"Anthropic rate limited: {e}",
                cause=e,
            ) from e
        except anthropic.APIStatusError as e:
            retryable = e.status_code >= 500 or e.status_code == 429
            raise LLMError(
                f"Anthropic API error: {e.status_code} {e.message}",
                provider="anthropic",
                model=self._config.model,
                code=f"LLM_API_{e.status_code}",
                status_code=e.status_code,
                retryable=retryable,
                cause=e,
            ) from e
        except anthropic.APIConnectionError as e:
            raise LLMError(
                f"Anthropic connection error: {e}",
                provider="anthropic",
                model=self._config.model,
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
                model=self._config.model,
                max_tokens=max_tokens or self._config.max_tokens,
                temperature=temperature if temperature is not None else self._config.temperature,
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
                model=self._config.model,
                retryable=e.status_code >= 500,
                cause=e,
            ) from e


class OpenAIAdapter:
    """Adapter for the OpenAI API."""

    def __init__(self, config: LLMConfig) -> None:
        try:
            import openai

            self._client = openai.AsyncOpenAI(api_key=config.api_key)
        except ImportError as e:
            raise LLMError(
                "OpenAI SDK not installed. Run: uv add openai",
                provider="openai",
                code="LLM_MISSING_DEPENDENCY",
                cause=e,
            ) from e
        self._config = config

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
                model=self._config.model,
                max_tokens=max_tokens or self._config.max_tokens,
                temperature=temperature if temperature is not None else self._config.temperature,
                messages=[
                    {"role": "system", "content": system or "You are a helpful assistant."},
                    {"role": "user", "content": prompt},
                ],
            )
        except openai.RateLimitError as e:
            raise RateLimitError(f"OpenAI rate limited: {e}", cause=e) from e
        except openai.APIStatusError as e:
            retryable = e.status_code >= 500 or e.status_code == 429
            raise LLMError(
                f"OpenAI API error: {e.status_code} {e.message}",
                provider="openai",
                model=self._config.model,
                code=f"LLM_API_{e.status_code}",
                status_code=e.status_code,
                retryable=retryable,
                cause=e,
            ) from e
        except openai.APIConnectionError as e:
            raise LLMError(
                f"OpenAI connection error: {e}",
                provider="openai",
                model=self._config.model,
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
                model=self._config.model,
                max_tokens=max_tokens or self._config.max_tokens,
                temperature=temperature if temperature is not None else self._config.temperature,
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
                model=self._config.model,
                retryable=e.status_code >= 500,
                cause=e,
            ) from e


# ─── LLM Client ──────────────────────────────────────────────────────────────

_ADAPTER_MAP = {
    "anthropic": AnthropicAdapter,
    "openai": OpenAIAdapter,
}


class LLMClient:
    """
    Production LLM client with retry, fallback, and circuit breaker.

    Request flow:
    1. Check circuit breaker for primary provider
    2. If closed/half-open → call primary with retry
    3. On success → record success, return response
    4. On failure after retries → record failure, try fallback
    5. If all providers fail → raise LLMError
    """

    def __init__(
        self,
        providers: list[LLMConfig],
        *,
        max_retries: int = 3,
        base_delay: float = 0.5,
        max_delay: float = 10.0,
        circuit_breaker_threshold: int = 5,
        circuit_breaker_reset_ms: int = 30_000,
    ) -> None:
        if not providers:
            raise LLMError(
                "At least one LLM provider is required",
                provider="none",
                code="LLM_NO_PROVIDERS",
            )

        self._adapters: list[tuple[str, Any]] = []
        self._circuit_breakers: dict[str, CircuitBreaker] = {}

        for config in providers:
            adapter_cls = _ADAPTER_MAP.get(config.provider)
            if not adapter_cls:
                raise LLMError(
                    f"Unknown provider: {config.provider}. Supported: {list(_ADAPTER_MAP.keys())}",
                    provider=config.provider,
                    code="LLM_UNKNOWN_PROVIDER",
                )
            adapter = adapter_cls(config)
            key = f"{config.provider}:{config.model}"
            self._adapters.append((key, adapter))
            self._circuit_breakers[key] = CircuitBreaker(
                threshold=circuit_breaker_threshold,
                reset_ms=circuit_breaker_reset_ms,
            )

        self._max_retries = max_retries
        self._base_delay = base_delay
        self._max_delay = max_delay

    async def complete(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        """
        Send a completion request with automatic retry and fallback.

        Tries each provider in order. Retries on transient errors (429, 5xx).
        Circuit breaker skips providers that are consistently failing.
        """
        last_error: Exception | None = None

        for key, adapter in self._adapters:
            breaker = self._circuit_breakers[key]

            if not breaker.can_execute():
                continue  # Skip this provider, circuit is open

            try:
                response = await self._call_with_retry(
                    adapter,
                    "complete",
                    prompt,
                    system=system,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                breaker.record_success()
                return response
            except Exception as e:
                breaker.record_failure()
                last_error = e
                continue  # Try next provider

        raise LLMError(
            f"All LLM providers failed. Last error: {last_error}",
            provider="all",
            code="LLM_ALL_FAILED",
            cause=last_error if isinstance(last_error, Exception) else None,
        )

    async def stream(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        """
        Stream a completion with fallback (no retry on streams — they're not idempotent).

        Tries each provider in order. If the primary's circuit is open, skips to fallback.
        """
        last_error: Exception | None = None

        for key, adapter in self._adapters:
            breaker = self._circuit_breakers[key]

            if not breaker.can_execute():
                continue

            try:
                async for chunk in adapter.stream(
                    prompt,
                    system=system,
                    temperature=temperature,
                    max_tokens=max_tokens,
                ):
                    yield chunk
                breaker.record_success()
                return
            except Exception as e:
                breaker.record_failure()
                last_error = e
                continue

        raise LLMError(
            f"All LLM providers failed to stream. Last error: {last_error}",
            provider="all",
            code="LLM_ALL_FAILED",
            cause=last_error if isinstance(last_error, Exception) else None,
        )

    async def _call_with_retry(
        self,
        adapter: Any,
        method: str,
        prompt: str,
        **kwargs: Any,
    ) -> LLMResponse:
        """Retry a call with exponential backoff and jitter."""
        last_error: Exception | None = None

        for attempt in range(self._max_retries + 1):
            try:
                return await getattr(adapter, method)(prompt, **kwargs)
            except (LLMError, RateLimitError) as e:
                last_error = e

                if not e.retryable:
                    raise

                if attempt < self._max_retries:
                    # Exponential backoff with jitter
                    import random

                    delay = min(
                        self._base_delay * (2**attempt) + random.uniform(0, 0.5),
                        self._max_delay,
                    )

                    # Respect Retry-After header if present
                    if isinstance(e, RateLimitError) and e.retry_after:
                        delay = max(delay, e.retry_after)

                    await asyncio.sleep(delay)

        raise last_error or LLMError(
            "Retry exhausted",
            provider="unknown",
            code="LLM_RETRY_EXHAUSTED",
        )


# ─── Factory ─────────────────────────────────────────────────────────────────


def create_llm_client(
    *,
    anthropic_api_key: str | None = None,
    openai_api_key: str | None = None,
    primary_model: str = "claude-sonnet-4-20250514",
    fallback_model: str = "gpt-4o",
    max_retries: int = 3,
) -> LLMClient:
    """
    Create an LLM client from environment variables or explicit keys.

    Builds a provider chain based on what API keys are available.
    Primary model is tried first, fallback if primary fails.

    Usage::

        # Auto-detect from env vars
        llm = create_llm_client()

        # Explicit keys
        llm = create_llm_client(
            anthropic_api_key="sk-...",
            openai_api_key="sk-...",
        )
    """
    import os

    anthropic_key = anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY")
    openai_key = openai_api_key or os.environ.get("OPENAI_API_KEY")

    providers: list[LLMConfig] = []

    # Determine provider for each model
    anthropic_models = {"claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"}
    openai_models = {"gpt-4o", "gpt-4o-mini"}

    # Primary
    if primary_model in anthropic_models and anthropic_key:
        providers.append(
            LLMConfig(provider="anthropic", model=primary_model, api_key=anthropic_key)
        )
    elif primary_model in openai_models and openai_key:
        providers.append(
            LLMConfig(provider="openai", model=primary_model, api_key=openai_key)
        )

    # Fallback
    if fallback_model in openai_models and openai_key:
        providers.append(
            LLMConfig(provider="openai", model=fallback_model, api_key=openai_key)
        )
    elif fallback_model in anthropic_models and anthropic_key:
        providers.append(
            LLMConfig(provider="anthropic", model=fallback_model, api_key=anthropic_key)
        )

    if not providers:
        raise LLMError(
            "No LLM providers configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
            provider="none",
            code="LLM_NO_API_KEYS",
        )

    return LLMClient(providers, max_retries=max_retries)
