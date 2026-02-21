"""
Production LLM client with retry, fallback, circuit breaker, and streaming.

Provider-agnostic — accepts any LLMProvider implementation. Built-in providers
include Anthropic, OpenAI, Google Gemini, Groq, and Ollama.

Usage::

    from ai_toolkit.llm import create_llm_client
    from ai_toolkit.llm.providers import GoogleProvider, AnthropicProvider

    # Auto-detect from env vars
    llm = create_llm_client()

    # Explicit providers — free tier primary, paid fallback
    llm = create_llm_client(providers=[
        GoogleProvider(model="gemini-2.0-flash"),
        AnthropicProvider(model="claude-sonnet-4-20250514"),
    ])

    response = await llm.complete("Summarize this document", system="You are a helpful assistant.")
    print(f"{response.content}")
    print(f"Cost: ${response.cost:.4f} | {response.provider}:{response.model}")

    # Streaming
    async for chunk in llm.stream("Explain RAG architecture"):
        print(chunk, end="", flush=True)
"""

from __future__ import annotations

import asyncio
import time
from enum import Enum
from typing import Any

from collections.abc import AsyncIterator

from ai_toolkit.errors import LLMError, RateLimitError
from ai_toolkit.llm.providers import LLMProvider, LLMResponse, auto_detect_providers


# ─── Circuit Breaker ─────────────────────────────────────────────────────────


class CircuitState(Enum):
    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Failing, reject requests
    HALF_OPEN = "half_open"  # Test with one request


class CircuitBreaker:
    """
    Per-provider circuit breaker.

    After ``threshold`` consecutive failures, the circuit opens and all requests
    fail immediately (no wasted API calls). After ``reset_ms``, it enters
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


# ─── LLM Client ──────────────────────────────────────────────────────────────


class LLMClient:
    """
    Production LLM client with retry, fallback, and circuit breaker.

    Accepts any ``LLMProvider`` implementation. The client adds reliability
    infrastructure on top: retry, fallback chain, circuit breaking.

    Request flow:
    1. Check circuit breaker for primary provider
    2. If closed/half-open → call primary with retry
    3. On success → record success, return response
    4. On failure after retries → record failure, try fallback
    5. If all providers fail → raise LLMError
    """

    def __init__(
        self,
        providers: list[LLMProvider],
        *,
        max_retries: int = 3,
        base_delay: float = 0.5,
        max_delay: float = 10.0,
        circuit_breaker_threshold: int = 5,
        circuit_breaker_reset_ms: int = 30_000,
    ) -> None:
        if not providers:
            raise LLMError(
                "At least one LLM provider is required. "
                "Pass providers=[] or set API key env vars for auto-detection.",
                provider="none",
                code="LLM_NO_PROVIDERS",
            )

        self._providers = providers
        self._circuit_breakers: dict[str, CircuitBreaker] = {}

        for provider in providers:
            self._circuit_breakers[provider.key] = CircuitBreaker(
                threshold=circuit_breaker_threshold,
                reset_ms=circuit_breaker_reset_ms,
            )

        self._max_retries = max_retries
        self._base_delay = base_delay
        self._max_delay = max_delay

    @property
    def provider_names(self) -> list[str]:
        """List of configured provider keys (e.g., ['google:gemini-2.0-flash', 'anthropic:claude-sonnet-4-20250514'])."""
        return [p.key for p in self._providers]

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

        for provider in self._providers:
            breaker = self._circuit_breakers[provider.key]

            if not breaker.can_execute():
                continue  # Skip this provider, circuit is open

            try:
                response = await self._call_with_retry(
                    provider,
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

        for provider in self._providers:
            breaker = self._circuit_breakers[provider.key]

            if not breaker.can_execute():
                continue

            try:
                async for chunk in provider.stream(
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
        provider: LLMProvider,
        method: str,
        prompt: str,
        **kwargs: Any,
    ) -> LLMResponse:
        """Retry a call with exponential backoff and jitter."""
        last_error: Exception | None = None

        for attempt in range(self._max_retries + 1):
            try:
                return await getattr(provider, method)(prompt, **kwargs)
            except (LLMError, RateLimitError) as e:
                last_error = e

                if not e.retryable:
                    raise

                if attempt < self._max_retries:
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
            provider=provider.name,
            code="LLM_RETRY_EXHAUSTED",
        )


# ─── Factory ─────────────────────────────────────────────────────────────────


def create_llm_client(
    *,
    providers: list[LLMProvider] | None = None,
    max_retries: int = 3,
) -> LLMClient:
    """
    Create an LLM client.

    If ``providers`` is given, use those in order. Otherwise, auto-detect
    from environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY,
    GOOGLE_API_KEY, GROQ_API_KEY).

    Usage::

        # Auto-detect from env vars
        llm = create_llm_client()

        # Explicit providers — free tier primary, paid fallback
    llm = create_llm_client(providers=[
        GoogleProvider(model="gemini-2.0-flash"),
        AnthropicProvider(model="claude-sonnet-4-20250514"),
    ])

        # Local only — no API key needed
        from ai_toolkit.llm.providers import OllamaProvider
        llm = create_llm_client(providers=[OllamaProvider(model="llama3.2")])
    """
    if providers is not None:
        return LLMClient(providers, max_retries=max_retries)

    detected = auto_detect_providers()

    if not detected:
        raise LLMError(
            "No LLM providers configured. Set at least one API key env var: "
            "ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, or GROQ_API_KEY. "
            "Or use OllamaProvider for free local inference.",
            provider="none",
            code="LLM_NO_API_KEYS",
        )

    return LLMClient(detected, max_retries=max_retries)
