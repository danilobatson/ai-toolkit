"""
Embedding client with batching, caching, and dimension configuration.

Uses OpenAI text-embedding-3-small (1536 dims, $0.02/1M tokens).
Anthropic doesn't have a dedicated embedding model — OpenAI is the
industry standard for this job.

Usage::

    from ai_toolkit.llm import EmbeddingClient

    embeddings = EmbeddingClient()

    # Single text
    vector = await embeddings.embed("What are diabetes guidelines?")

    # Batch (100 chunks → 1 API call, not 100 separate calls)
    vectors = await embeddings.embed_batch(chunks)

    # Cached — same text returns cached vector, no API call
    vector = await embeddings.embed("same query again")  # cache hit
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any

from ai_toolkit.errors import LLMError


# ─── Types ───────────────────────────────────────────────────────────────────

EMBEDDING_PRICING: dict[str, float] = {
    "text-embedding-3-small": 0.02,  # per 1M tokens
    "text-embedding-3-large": 0.13,
}


@dataclass
class EmbeddingResult:
    """Result of embedding a single text."""

    vector: list[float]
    model: str
    tokens: int
    cached: bool = False


@dataclass
class BatchEmbeddingResult:
    """Result of embedding multiple texts."""

    vectors: list[list[float]]
    model: str
    total_tokens: int
    cached_count: int
    api_count: int
    latency_ms: float
    cost: float


@dataclass
class EmbeddingStats:
    """Running stats for cost tracking."""

    total_tokens: int = 0
    total_cost: float = 0.0
    total_requests: int = 0
    cache_hits: int = 0
    cache_misses: int = 0


# ─── Cache Key Generation ────────────────────────────────────────────────────


def _cache_key(text: str, model: str, dimensions: int) -> str:
    """
    Deterministic cache key for an embedding.

    Embeddings are deterministic: same text + model + dimensions = same vector.
    Key: emb:{sha256(text + model + dims)} — short, collision-resistant.
    """
    raw = f"{text}|{model}|{dimensions}"
    digest = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return f"emb:{digest}"


# ─── Embedding Client ────────────────────────────────────────────────────────


class EmbeddingClient:
    """
    Production embedding client with batching and caching.

    Features:
    - **Batching** — Embeds N chunks in one API call (up to batch_size limit)
    - **Caching** — Redis cache keyed by hash(text + model + dims). 7-day TTL.
    - **Dimension config** — text-embedding-3-small supports 1536, 1024, 512
    - **Cost tracking** — Running total of tokens and dollars spent
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str = "text-embedding-3-small",
        dimensions: int = 1536,
        batch_size: int = 100,
        cache: Any | None = None,  # CacheClient from ai_toolkit.cache
        cache_ttl: int = 604_800,  # 7 days in seconds
    ) -> None:
        import os

        self._api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self._api_key:
            raise LLMError(
                "OpenAI API key required for embeddings. Set OPENAI_API_KEY.",
                provider="openai",
                code="LLM_NO_API_KEYS",
            )

        self._model = model
        self._dimensions = dimensions
        self._batch_size = batch_size
        self._cache = cache
        self._cache_ttl = cache_ttl
        self._stats = EmbeddingStats()

        try:
            import openai

            self._client = openai.AsyncOpenAI(api_key=self._api_key)
        except ImportError as e:
            raise LLMError(
                "OpenAI SDK not installed. Run: uv add openai",
                provider="openai",
                code="LLM_MISSING_DEPENDENCY",
                cause=e,
            ) from e

    @property
    def stats(self) -> EmbeddingStats:
        """Running stats for monitoring and cost tracking."""
        return self._stats

    async def embed(self, text: str) -> list[float]:
        """
        Embed a single text. Returns the vector.

        Checks cache first. If miss, calls the API and caches the result.
        """
        result = await self._embed_single(text)
        return result.vector

    async def embed_batch(
        self,
        texts: list[str],
        *,
        batch_size: int | None = None,
    ) -> BatchEmbeddingResult:
        """
        Embed multiple texts with batching and caching.

        1. Check cache for each text
        2. Batch uncached texts into API calls (respecting batch_size)
        3. Cache new results
        4. Return vectors in original order

        This is the hot path for document ingestion. 1000 chunks with 90%
        cache hit rate = 1 API call instead of 1000.
        """
        size = batch_size or self._batch_size
        start = time.monotonic()

        # Phase 1: Check cache for all texts
        vectors: list[list[float] | None] = [None] * len(texts)
        uncached_indices: list[int] = []

        for i, text in enumerate(texts):
            cached = await self._get_cached(text)
            if cached is not None:
                vectors[i] = cached
                self._stats.cache_hits += 1
            else:
                uncached_indices.append(i)
                self._stats.cache_misses += 1

        cached_count = len(texts) - len(uncached_indices)
        api_count = len(uncached_indices)
        total_tokens = 0

        # Phase 2: Batch API calls for uncached texts
        if uncached_indices:
            uncached_texts = [texts[i] for i in uncached_indices]

            for batch_start in range(0, len(uncached_texts), size):
                batch = uncached_texts[batch_start : batch_start + size]
                batch_indices = uncached_indices[batch_start : batch_start + size]

                try:
                    response = await self._client.embeddings.create(
                        model=self._model,
                        input=batch,
                        dimensions=self._dimensions,
                    )
                except Exception as e:
                    raise LLMError(
                        f"Embedding API call failed: {e}",
                        provider="openai",
                        model=self._model,
                        code="LLM_EMBEDDING_FAILED",
                        retryable=True,
                        cause=e if isinstance(e, Exception) else None,
                    ) from e

                total_tokens += response.usage.total_tokens

                for j, embedding_data in enumerate(response.data):
                    idx = batch_indices[j]
                    vector = embedding_data.embedding
                    vectors[idx] = vector

                    # Cache the result
                    await self._set_cached(texts[idx], vector)

        # Update stats
        self._stats.total_tokens += total_tokens
        self._stats.total_requests += 1
        cost = self._estimate_cost(total_tokens)
        self._stats.total_cost += cost

        latency = (time.monotonic() - start) * 1000

        # All vectors should be filled now
        final_vectors = [v for v in vectors if v is not None]
        assert len(final_vectors) == len(texts), "Some embeddings were not produced"

        return BatchEmbeddingResult(
            vectors=final_vectors,
            model=self._model,
            total_tokens=total_tokens,
            cached_count=cached_count,
            api_count=api_count,
            latency_ms=latency,
            cost=cost,
        )

    async def _embed_single(self, text: str) -> EmbeddingResult:
        """Embed a single text with cache check."""
        # Check cache
        cached = await self._get_cached(text)
        if cached is not None:
            self._stats.cache_hits += 1
            return EmbeddingResult(
                vector=cached,
                model=self._model,
                tokens=0,
                cached=True,
            )

        self._stats.cache_misses += 1

        # API call
        try:
            response = await self._client.embeddings.create(
                model=self._model,
                input=text,
                dimensions=self._dimensions,
            )
        except Exception as e:
            raise LLMError(
                f"Embedding API call failed: {e}",
                provider="openai",
                model=self._model,
                code="LLM_EMBEDDING_FAILED",
                retryable=True,
                cause=e if isinstance(e, Exception) else None,
            ) from e

        tokens = response.usage.total_tokens
        vector = response.data[0].embedding

        # Update stats
        self._stats.total_tokens += tokens
        self._stats.total_requests += 1
        cost = self._estimate_cost(tokens)
        self._stats.total_cost += cost

        # Cache
        await self._set_cached(text, vector)

        return EmbeddingResult(
            vector=vector,
            model=self._model,
            tokens=tokens,
            cached=False,
        )

    async def _get_cached(self, text: str) -> list[float] | None:
        """Get cached embedding vector, or None."""
        if not self._cache:
            return None

        key = _cache_key(text, self._model, self._dimensions)
        try:
            result = await self._cache.get(key)
            return result  # type: ignore[return-value]
        except Exception:
            return None  # Cache failure is non-fatal

    async def _set_cached(self, text: str, vector: list[float]) -> None:
        """Cache an embedding vector."""
        if not self._cache:
            return

        key = _cache_key(text, self._model, self._dimensions)
        try:
            await self._cache.set(key, vector, ttl=self._cache_ttl)
        except Exception:
            pass  # Cache failure is non-fatal

    def _estimate_cost(self, tokens: int) -> float:
        """Estimate cost in USD."""
        price_per_million = EMBEDDING_PRICING.get(self._model, 0.0)
        return tokens * price_per_million / 1_000_000
