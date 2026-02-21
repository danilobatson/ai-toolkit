"""
Observability — Langfuse LLM tracing and structured logging.

Provides init helpers so every project gets consistent tracing and
logging with one import.

Usage::

    from ai_toolkit.observability import init_langfuse, get_logger

    # Init Langfuse tracing (reads from env vars)
    langfuse = init_langfuse()

    # Structured logger
    logger = get_logger("rag-assistant")
    logger.info("query_processed", extra={"tokens": 150, "latency_ms": 320})
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from typing import Any


# ─── Langfuse Init ───────────────────────────────────────────────────────────


def init_langfuse(
    *,
    public_key: str | None = None,
    secret_key: str | None = None,
    host: str | None = None,
) -> Any | None:
    """
    Initialize Langfuse client for LLM tracing.

    Reads from env vars if not provided:
    - LANGFUSE_PUBLIC_KEY
    - LANGFUSE_SECRET_KEY
    - LANGFUSE_HOST (default: https://cloud.langfuse.com)

    Returns None if Langfuse is not installed or keys are missing.
    """
    pk = public_key or os.environ.get("LANGFUSE_PUBLIC_KEY")
    sk = secret_key or os.environ.get("LANGFUSE_SECRET_KEY")
    h = host or os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com")

    if not pk or not sk:
        return None

    try:
        from langfuse import Langfuse

        return Langfuse(public_key=pk, secret_key=sk, host=h)
    except ImportError:
        return None


# ─── Structured Logging ─────────────────────────────────────────────────────


class JsonFormatter(logging.Formatter):
    """JSON log formatter for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Include extra fields
        for key, value in record.__dict__.items():
            if key not in (
                "name", "msg", "args", "created", "relativeCreated",
                "exc_info", "exc_text", "stack_info", "lineno", "funcName",
                "pathname", "filename", "module", "levelname", "levelno",
                "thread", "threadName", "process", "processName",
                "msecs", "message", "taskName",
            ):
                log_entry[key] = value

        if record.exc_info and record.exc_info[1]:
            log_entry["error"] = str(record.exc_info[1])
            log_entry["error_type"] = type(record.exc_info[1]).__name__

        return json.dumps(log_entry)


def get_logger(
    name: str,
    *,
    level: int = logging.INFO,
    json_output: bool | None = None,
) -> logging.Logger:
    """
    Get a configured structured logger.

    Args:
        name: Logger name (e.g., "rag-assistant", "agent-workflows")
        level: Log level (default INFO)
        json_output: Force JSON format. Default: auto-detect
            (JSON in production, human-readable in dev)
    """
    logger = logging.getLogger(f"ai_toolkit.{name}")

    if logger.handlers:
        return logger  # Already configured

    logger.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    # Auto-detect: JSON in production, readable in dev
    use_json = json_output
    if use_json is None:
        env = os.environ.get("ENVIRONMENT", os.environ.get("ENV", "development"))
        use_json = env.lower() in ("production", "prod", "staging")

    if use_json:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )

    logger.addHandler(handler)
    logger.propagate = False

    return logger
