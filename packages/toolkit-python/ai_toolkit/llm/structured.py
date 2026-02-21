"""
Structured LLM output — extract typed Pydantic models from any LLM provider.

No extra dependencies. Uses Pydantic (already a dependency) for schema
generation and validation. Works with all 5 built-in providers + custom ones.

How it works:
1. Generate JSON schema from your Pydantic model
2. Send schema + text to the LLM with extraction instructions
3. Parse JSON from the response (handles markdown fences, preamble, etc.)
4. Validate against the Pydantic model
5. On validation failure → retry with error feedback (LLM self-corrects)

Usage::

    from pydantic import BaseModel, Field
    from ai_toolkit.llm import create_llm_client
    from ai_toolkit.llm.structured import extract

    class PatientSummary(BaseModel):
        name: str
        age: int
        conditions: list[str] = Field(description="Medical conditions")
        risk_level: str = Field(description="low, medium, or high")

    llm = create_llm_client()
    result = await extract(llm, PatientSummary, "John is 45 with diabetes and hypertension")
    print(result.data.name)        # "John"
    print(result.data.risk_level)  # "high"
    print(f"${result.cost:.4f}")   # cost of extraction
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from typing import Any, TypeVar, overload

from pydantic import BaseModel, ValidationError

from ai_toolkit.errors import LLMError
from ai_toolkit.llm.client import LLMClient
from ai_toolkit.llm.providers import LLMResponse

# ─── Types ───────────────────────────────────────────────────────────────────

T = TypeVar("T", bound=BaseModel)


@dataclass
class StructuredResponse[T]:
    """Result of a structured extraction."""

    data: T
    """The validated Pydantic model instance."""

    raw_response: str
    """Raw LLM response text (before JSON parsing)."""

    model: str
    """LLM model that produced the response."""

    provider: str
    """LLM provider that produced the response."""

    input_tokens: int
    """Total input tokens across all attempts."""

    output_tokens: int
    """Total output tokens across all attempts."""

    cost: float
    """Total cost in USD across all attempts."""

    latency_ms: float
    """Total latency across all attempts."""

    retries: int = 0
    """Number of validation retries needed (0 = first attempt succeeded)."""


# ─── JSON Extraction ─────────────────────────────────────────────────────────

# Regex patterns for finding JSON in LLM responses.
# LLMs love wrapping JSON in markdown code fences, adding preamble, etc.
_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*\n?(.*?)\n?\s*```", re.DOTALL)
_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)
_JSON_ARRAY_RE = re.compile(r"\[.*\]", re.DOTALL)


def _extract_json(text: str) -> str:
    """
    Extract JSON from an LLM response.

    Handles: raw JSON, ```json fences, preamble text before JSON,
    trailing text after JSON. Raises ValueError if no JSON found.
    """
    # Try 1: the entire text is valid JSON
    stripped = text.strip()
    if stripped.startswith(("{", "[")):
        try:
            json.loads(stripped)
            return stripped
        except json.JSONDecodeError:
            pass

    # Try 2: JSON inside a code fence
    match = _JSON_BLOCK_RE.search(text)
    if match:
        candidate = match.group(1).strip()
        try:
            json.loads(candidate)
            return candidate
        except json.JSONDecodeError:
            pass

    # Try 3: first JSON object in the text
    match = _JSON_OBJECT_RE.search(text)
    if match:
        candidate = match.group(0)
        try:
            json.loads(candidate)
            return candidate
        except json.JSONDecodeError:
            pass

    # Try 4: first JSON array in the text
    match = _JSON_ARRAY_RE.search(text)
    if match:
        candidate = match.group(0)
        try:
            json.loads(candidate)
            return candidate
        except json.JSONDecodeError:
            pass

    raise ValueError(f"No valid JSON found in LLM response: {text[:200]}...")


# ─── Prompt Engineering ──────────────────────────────────────────────────────


def _build_system_prompt(
    model_class: type[BaseModel],
    *,
    system: str = "",
) -> str:
    """Build a system prompt that instructs the LLM to output structured JSON."""
    schema = model_class.model_json_schema()

    # Clean up schema for readability — remove internal Pydantic metadata
    schema.pop("title", None)

    parts = []

    if system:
        parts.append(system)

    parts.append(
        "You are a structured data extraction assistant. "
        "Extract information from the provided text and respond with ONLY valid JSON "
        "that matches the following schema. No markdown, no explanation, no preamble — "
        "just the JSON object."
    )
    parts.append(f"\nJSON Schema:\n{json.dumps(schema, indent=2)}")

    # Add field descriptions as hints
    hints = []
    for name, field_info in model_class.model_fields.items():
        if field_info.description:
            hints.append(f"- {name}: {field_info.description}")
    if hints:
        parts.append("\nField guidelines:\n" + "\n".join(hints))

    return "\n\n".join(parts)


def _build_retry_prompt(
    original_text: str,
    previous_response: str,
    error: str,
) -> str:
    """Build a retry prompt that includes the validation error."""
    return (
        f"Your previous response was not valid. Here is the error:\n\n"
        f"{error}\n\n"
        f"Please try again. Extract from this text and respond with ONLY valid JSON:\n\n"
        f"{original_text}\n\n"
        f"Your previous (invalid) response was:\n{previous_response[:500]}"
    )


# ─── Core Extraction ─────────────────────────────────────────────────────────


async def extract(
    llm: LLMClient,
    model: type[T],
    text: str,
    *,
    system: str = "",
    temperature: float | None = 0.0,
    max_tokens: int | None = None,
    max_retries: int = 2,
) -> StructuredResponse[T]:
    """
    Extract a typed Pydantic model from text using an LLM.

    The LLM is instructed to output JSON matching the model's schema.
    If validation fails, the error is fed back and the LLM retries.

    Args:
        llm: An LLMClient instance (from create_llm_client)
        model: A Pydantic BaseModel class to extract
        text: The text to extract from
        system: Additional system prompt context
        temperature: LLM temperature (default 0.0 for deterministic extraction)
        max_tokens: Maximum tokens for LLM response
        max_retries: Max validation retries (default 2, so up to 3 total attempts)

    Returns:
        StructuredResponse with the validated model instance and metadata

    Raises:
        LLMError: If all extraction attempts fail
    """
    system_prompt = _build_system_prompt(model, system=system)

    total_input_tokens = 0
    total_output_tokens = 0
    total_cost = 0.0
    total_latency = 0.0

    prompt = text
    last_response: LLMResponse | None = None
    last_error: str | None = None

    for attempt in range(max_retries + 1):
        # After first attempt, use retry prompt with error feedback
        if attempt > 0 and last_response and last_error:
            prompt = _build_retry_prompt(text, last_response.content, last_error)

        response = await llm.complete(
            prompt,
            system=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        total_input_tokens += response.input_tokens
        total_output_tokens += response.output_tokens
        total_cost += response.cost
        total_latency += response.latency_ms
        last_response = response

        # Try to extract and validate JSON
        try:
            json_str = _extract_json(response.content)
            data = model.model_validate_json(json_str)

            return StructuredResponse(
                data=data,
                raw_response=response.content,
                model=response.model,
                provider=response.provider,
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                cost=total_cost,
                latency_ms=total_latency,
                retries=attempt,
            )

        except ValueError as e:
            # JSON extraction failed
            last_error = f"JSON parsing error: {e}"
        except ValidationError as e:
            # Pydantic validation failed — feed error back to LLM
            last_error = f"Validation error: {e}"

    # All attempts failed
    raise LLMError(
        f"Structured extraction failed after {max_retries + 1} attempts. "
        f"Last error: {last_error}",
        provider=last_response.provider if last_response else "unknown",
        model=last_response.model if last_response else "unknown",
        code="LLM_STRUCTURED_EXTRACTION_FAILED",
    )


# ─── Batch Extraction ────────────────────────────────────────────────────────


async def extract_batch(
    llm: LLMClient,
    model: type[T],
    texts: list[str],
    *,
    system: str = "",
    temperature: float | None = 0.0,
    max_tokens: int | None = None,
    max_retries: int = 2,
    max_concurrency: int = 5,
) -> list[StructuredResponse[T]]:
    """
    Extract typed models from multiple texts concurrently.

    Args:
        llm: An LLMClient instance
        model: A Pydantic BaseModel class to extract
        texts: List of texts to extract from
        system: Additional system prompt context
        max_concurrency: Max concurrent LLM calls (default 5)

    Returns:
        List of StructuredResponse in the same order as input texts

    Raises:
        LLMError: If any extraction fails (fails fast on first error)
    """
    semaphore = asyncio.Semaphore(max_concurrency)

    async def _extract_one(text: str) -> StructuredResponse[T]:
        async with semaphore:
            return await extract(
                llm,
                model,
                text,
                system=system,
                temperature=temperature,
                max_tokens=max_tokens,
                max_retries=max_retries,
            )

    return list(await asyncio.gather(*[_extract_one(t) for t in texts]))


# ─── Convenience Class ───────────────────────────────────────────────────────


class StructuredClient:
    """
    Convenience wrapper for repeated structured extractions.

    Stores the LLM client and default options so you don't repeat them.

    Usage::

        from ai_toolkit.llm.structured import StructuredClient

        sc = StructuredClient(llm, system="You are a medical AI.")
        patient = await sc.extract(PatientSummary, clinical_note)
        patients = await sc.extract_batch(PatientSummary, notes)
    """

    def __init__(
        self,
        llm: LLMClient,
        *,
        system: str = "",
        temperature: float | None = 0.0,
        max_tokens: int | None = None,
        max_retries: int = 2,
        max_concurrency: int = 5,
    ) -> None:
        self._llm = llm
        self._system = system
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._max_retries = max_retries
        self._max_concurrency = max_concurrency

    async def extract(
        self,
        model: type[T],
        text: str,
        *,
        system: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        max_retries: int | None = None,
    ) -> StructuredResponse[T]:
        """Extract a typed model from text. Per-call overrides are supported."""
        return await extract(
            self._llm,
            model,
            text,
            system=system if system is not None else self._system,
            temperature=temperature if temperature is not None else self._temperature,
            max_tokens=max_tokens if max_tokens is not None else self._max_tokens,
            max_retries=max_retries if max_retries is not None else self._max_retries,
        )

    async def extract_batch(
        self,
        model: type[T],
        texts: list[str],
        *,
        system: str | None = None,
        max_concurrency: int | None = None,
    ) -> list[StructuredResponse[T]]:
        """Extract typed models from multiple texts concurrently."""
        return await extract_batch(
            self._llm,
            model,
            texts,
            system=system if system is not None else self._system,
            temperature=self._temperature,
            max_tokens=self._max_tokens,
            max_retries=self._max_retries,
            max_concurrency=max_concurrency or self._max_concurrency,
        )
