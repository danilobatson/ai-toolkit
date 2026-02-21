"""General-purpose caching with Redis backend."""

from __future__ import annotations

import json
from typing import Any

from ai_toolkit.errors import CacheError


class CacheClient:
    """
    Redis-backed cache client.

    Usage::

        cache = CacheClient(redis_url="redis://localhost:6379")
        await cache.set("user:123", {"name": "Danilo"}, ttl=300)
        user = await cache.get("user:123")
        await cache.invalidate("user:123")
    """

    def __init__(self, redis_url: str, *, default_ttl: int = 300) -> None:
        self._default_ttl = default_ttl
        try:
            import redis.asyncio as aioredis

            self._redis = aioredis.from_url(redis_url, decode_responses=True)
        except ImportError as e:
            raise CacheError(
                "Redis cache requires the redis package. Install it: uv add redis",
                code="CACHE_MISSING_DEPENDENCY",
                cause=e,
            ) from e

    async def get(self, key: str) -> Any | None:
        """Get a cached value. Returns None if not found or expired."""
        try:
            value = await self._redis.get(key)
            if value is None:
                return None
            return json.loads(value)
        except Exception as e:
            raise CacheError(f"Cache get failed for key: {key}", cause=e) from e

    async def set(self, key: str, value: Any, *, ttl: int | None = None) -> None:
        """Set a cached value with TTL in seconds."""
        try:
            await self._redis.set(key, json.dumps(value), ex=ttl or self._default_ttl)
        except Exception as e:
            raise CacheError(f"Cache set failed for key: {key}", cause=e) from e

    async def invalidate(self, key: str) -> None:
        """Delete a cached value."""
        try:
            await self._redis.delete(key)
        except Exception as e:
            raise CacheError(f"Cache invalidate failed for key: {key}", cause=e) from e

    async def invalidate_prefix(self, prefix: str) -> None:
        """Delete all keys matching a prefix."""
        try:
            keys = []
            async for key in self._redis.scan_iter(match=f"{prefix}*"):
                keys.append(key)
            if keys:
                await self._redis.delete(*keys)
        except Exception as e:
            raise CacheError(f"Cache invalidate_prefix failed for: {prefix}", cause=e) from e

    async def disconnect(self) -> None:
        """Close the Redis connection."""
        await self._redis.aclose()
