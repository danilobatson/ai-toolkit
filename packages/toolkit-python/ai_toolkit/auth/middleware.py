"""
Multi-tenant auth middleware for FastAPI.

Extracts org_id from request headers (set by BFF/frontend).
Every database query should include ``WHERE org_id = :org_id``.

Neon Auth handles actual authentication on the frontend.
This module just enforces tenant isolation on the backend.

Usage::

    from ai_toolkit.auth import get_org_id, require_api_key

    @router.get("/documents")
    async def list_documents(org_id: str = Depends(get_org_id)):
        return await db.execute(
            select(Document).where(Document.org_id == org_id)
        )

    @router.post("/ingest")
    async def ingest_doc(
        org_id: str = Depends(get_org_id),
        _: str = Depends(require_api_key),
    ):
        ...
"""

from __future__ import annotations

import os
from typing import Any


def _get_header(request: Any, header: str) -> str | None:
    """Extract header from FastAPI Request (or any object with .headers)."""
    headers = getattr(request, "headers", {})
    return headers.get(header)


async def get_org_id(request: Any) -> str:
    """
    FastAPI dependency — extract org_id from X-Org-Id header.

    Raises 401 if missing.

    Usage::

        @router.get("/data")
        async def get_data(org_id: str = Depends(get_org_id)):
            ...
    """
    org_id = _get_header(request, "x-org-id")
    if not org_id:
        # Import here to avoid requiring FastAPI at module level
        try:
            from fastapi import HTTPException

            raise HTTPException(status_code=401, detail="Missing X-Org-Id header")
        except ImportError:
            raise ValueError("Missing X-Org-Id header")
    return org_id


async def require_api_key(request: Any) -> str:
    """
    FastAPI dependency — validate API key from Authorization header.

    Compares against API_KEY environment variable.

    Usage::

        @router.post("/admin")
        async def admin_action(_: str = Depends(require_api_key)):
            ...
    """
    expected = os.environ.get("API_KEY") or os.environ.get("BACKEND_API_KEY")
    if not expected:
        raise ValueError("API_KEY or BACKEND_API_KEY not set in environment")

    auth_header = _get_header(request, "authorization") or ""
    token = auth_header.removeprefix("Bearer ").strip()

    if not token or token != expected:
        try:
            from fastapi import HTTPException

            raise HTTPException(status_code=401, detail="Invalid API key")
        except ImportError:
            raise ValueError("Invalid API key")
    return token


async def get_user_id(request: Any) -> str | None:
    """
    FastAPI dependency — extract user_id from X-User-Id header.

    Optional — returns None if not present. Neon Auth sets this
    on the frontend; the BFF forwards it.
    """
    return _get_header(request, "x-user-id")
