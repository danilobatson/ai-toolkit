"""
Security utilities — rate limiting and audit logging.

Rate limiter uses Redis (from ai_toolkit.cache) for distributed counting.
Audit logger records all data access events for compliance.

Usage::

    from ai_toolkit.security import RateLimiter, AuditLogger

    limiter = RateLimiter(cache, max_requests=100, window_seconds=60)
    allowed = await limiter.check("user:123")

    audit = AuditLogger(name="rag-assistant")
    audit.log("document_accessed", org_id="org_1", user_id="u_1", resource="doc_42")
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any


# ─── Rate Limiter ────────────────────────────────────────────────────────────


@dataclass
class RateLimitResult:
    """Result of a rate limit check."""

    allowed: bool
    remaining: int
    limit: int
    reset_at: float
    """Unix timestamp when the window resets."""


class RateLimiter:
    """
    Redis-backed sliding window rate limiter.

    Uses simple key + TTL pattern. For high-volume production,
    consider Redis sorted sets for true sliding window.
    """

    def __init__(
        self,
        cache: Any,
        *,
        max_requests: int = 100,
        window_seconds: int = 60,
        key_prefix: str = "ratelimit",
    ) -> None:
        """
        Args:
            cache: CacheClient from ai_toolkit.cache
            max_requests: Maximum requests per window
            window_seconds: Window duration in seconds
            key_prefix: Redis key prefix
        """
        self._cache = cache
        self._max = max_requests
        self._window = window_seconds
        self._prefix = key_prefix

    async def check(self, identifier: str) -> RateLimitResult:
        """
        Check if a request is allowed.

        Args:
            identifier: Unique key (e.g., "user:123", "org:456", IP address)

        Returns:
            RateLimitResult with allowed status and remaining count
        """
        key = f"{self._prefix}:{identifier}"
        now = time.time()

        # Try to get current count
        try:
            current = await self._cache.get(key)
            count = int(current) if current is not None else 0
        except Exception:
            count = 0

        if count >= self._max:
            return RateLimitResult(
                allowed=False,
                remaining=0,
                limit=self._max,
                reset_at=now + self._window,
            )

        # Increment
        try:
            await self._cache.set(key, str(count + 1), ttl=self._window)
        except Exception:
            pass  # Fail open — allow the request if Redis is down

        return RateLimitResult(
            allowed=True,
            remaining=self._max - count - 1,
            limit=self._max,
            reset_at=now + self._window,
        )

    async def reset(self, identifier: str) -> None:
        """Reset rate limit for an identifier."""
        key = f"{self._prefix}:{identifier}"
        try:
            await self._cache.delete(key)
        except Exception:
            pass


# ─── Audit Logger ────────────────────────────────────────────────────────────


class AuditLogger:
    """
    Structured audit logger for compliance (HIPAA, SOC2, etc.).

    Logs all data access events in a structured JSON format.
    Backed by Python's logging module — configure handlers to send
    to files, CloudWatch, Datadog, etc.
    """

    def __init__(
        self,
        name: str = "audit",
        *,
        logger: logging.Logger | None = None,
    ) -> None:
        self._logger = logger or logging.getLogger(f"ai_toolkit.audit.{name}")

    def log(
        self,
        action: str,
        *,
        org_id: str = "",
        user_id: str = "",
        resource: str = "",
        detail: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """
        Log an audit event.

        Args:
            action: What happened (e.g., "document_accessed", "query_executed")
            org_id: Organization ID
            user_id: User ID
            resource: Resource accessed (e.g., document ID, endpoint)
            detail: Human-readable description
            metadata: Additional structured data
        """
        event = {
            "action": action,
            "org_id": org_id,
            "user_id": user_id,
            "resource": resource,
            "timestamp": time.time(),
        }
        if detail:
            event["detail"] = detail
        if metadata:
            event["metadata"] = metadata

        self._logger.info(json.dumps(event))

    def log_access(
        self,
        *,
        org_id: str,
        user_id: str,
        resource: str,
        action: str = "accessed",
    ) -> None:
        """Shorthand for data access logging."""
        self.log(
            f"data_{action}",
            org_id=org_id,
            user_id=user_id,
            resource=resource,
        )
