"""
AI safety guardrails — input validation and output filtering.

Provides composable guards for AI pipelines:
- **InputGuard**: Validate user input before sending to LLM
  - Topic filtering (on-topic/off-topic classification)
  - PII detection (SSN, email, phone, credit card)
  - Prompt injection detection
  - Custom rules
- **OutputGuard**: Validate LLM output before returning to user
  - Hallucination scoring (compare output against source context)
  - PII scrubbing (redact leaked PII from responses)
  - Content policy filtering
  - Custom rules

Guards are composable — chain multiple checks, fail-fast or collect all violations.

Usage::

    from ai_toolkit.guardrails import InputGuard, OutputGuard, PiiDetector, TopicFilter

    # Input: block off-topic queries and PII
    input_guard = InputGuard(rules=[
        TopicFilter(allowed_topics=["clinical", "medical", "health"]),
        PiiDetector(action="block"),
    ])
    result = await input_guard.check("What's the treatment for diabetes?")
    # result.passed == True

    # Output: score hallucination, scrub PII
    output_guard = OutputGuard(rules=[
        HallucinationScorer(threshold=0.7),
        PiiDetector(action="redact"),
    ])
    result = await output_guard.check(
        output="The patient John (SSN: 123-45-6789) should take metformin.",
        context=retrieved_chunks,
    )
    # result.passed == True (hallucination ok)
    # result.output == "The patient John (SSN: [REDACTED]) should take metformin."
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ─── Types ───────────────────────────────────────────────────────────────────


class Severity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Action(Enum):
    BLOCK = "block"
    """Reject the input/output entirely."""
    REDACT = "redact"
    """Scrub offending content but allow through."""
    FLAG = "flag"
    """Allow through but attach a warning."""


@dataclass
class Violation:
    """A single guardrail violation."""

    rule: str
    """Name of the rule that triggered."""

    message: str
    """Human-readable description."""

    severity: Severity
    """How serious this violation is."""

    action: Action
    """What action was taken."""

    metadata: dict[str, Any] = field(default_factory=dict)
    """Additional context (matched patterns, scores, etc.)."""


@dataclass
class GuardResult:
    """Result of running guardrail checks."""

    passed: bool
    """True if no blocking violations found."""

    output: str
    """The (possibly redacted) text after processing."""

    violations: list[Violation] = field(default_factory=list)
    """All violations found, even non-blocking ones."""

    @property
    def blocked(self) -> bool:
        return any(v.action == Action.BLOCK for v in self.violations)

    @property
    def flagged(self) -> bool:
        return any(v.action == Action.FLAG for v in self.violations)

    @property
    def redacted(self) -> bool:
        return any(v.action == Action.REDACT for v in self.violations)


# ─── Rule Interface ──────────────────────────────────────────────────────────


class GuardRule(ABC):
    """Base class for guardrail rules."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Rule identifier."""
        ...

    @abstractmethod
    async def check(
        self,
        text: str,
        *,
        context: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str, list[Violation]]:
        """
        Check text against this rule.

        Args:
            text: The text to check
            context: Retrieved source chunks (for hallucination scoring)
            metadata: Additional context

        Returns:
            Tuple of (possibly modified text, list of violations)
        """
        ...


# ─── Built-in Rules ─────────────────────────────────────────────────────────


class PiiDetector(GuardRule):
    """
    Detect and optionally redact PII patterns.

    Detects: SSN, credit cards, emails, phone numbers, IP addresses.
    Extensible with custom patterns.
    """

    # Pattern name → (regex, replacement text)
    _DEFAULT_PATTERNS: dict[str, tuple[str, str]] = {
        "ssn": (r"\b\d{3}-\d{2}-\d{4}\b", "[SSN REDACTED]"),
        "credit_card": (r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b", "[CC REDACTED]"),
        "email": (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "[EMAIL REDACTED]"),
        "phone_us": (r"\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b", "[PHONE REDACTED]"),
        "ip_address": (r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b", "[IP REDACTED]"),
    }

    def __init__(
        self,
        *,
        action: str = "block",
        patterns: dict[str, tuple[str, str]] | None = None,
        exclude: list[str] | None = None,
    ) -> None:
        """
        Args:
            action: "block" (reject) or "redact" (scrub and allow)
            patterns: Additional patterns {name: (regex, replacement)}
            exclude: Pattern names to skip (e.g., ["email"] to allow emails)
        """
        self._action = Action(action)
        self._patterns: dict[str, tuple[re.Pattern[str], str]] = {}

        all_patterns = {**self._DEFAULT_PATTERNS, **(patterns or {})}
        exclude_set = set(exclude or [])

        for name, (pattern, replacement) in all_patterns.items():
            if name not in exclude_set:
                self._patterns[name] = (re.compile(pattern), replacement)

    @property
    def name(self) -> str:
        return "pii_detector"

    async def check(
        self,
        text: str,
        *,
        context: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str, list[Violation]]:
        violations: list[Violation] = []
        result_text = text

        for pii_type, (pattern, replacement) in self._patterns.items():
            matches = pattern.findall(text)
            if matches:
                violations.append(
                    Violation(
                        rule=self.name,
                        message=f"Detected {pii_type}: {len(matches)} occurrence(s)",
                        severity=Severity.HIGH,
                        action=self._action,
                        metadata={"pii_type": pii_type, "count": len(matches)},
                    )
                )
                if self._action == Action.REDACT:
                    result_text = pattern.sub(replacement, result_text)

        return result_text, violations


class TopicFilter(GuardRule):
    """
    Filter queries by topic relevance using keyword matching.

    For production, swap the check method to use LLM-based classification.
    """

    def __init__(
        self,
        *,
        allowed_topics: list[str],
        blocked_keywords: list[str] | None = None,
        action: str = "block",
    ) -> None:
        """
        Args:
            allowed_topics: Keywords that indicate on-topic queries
            blocked_keywords: Keywords that are explicitly off-topic
            action: "block" or "flag"
        """
        self._allowed = [t.lower() for t in allowed_topics]
        self._blocked = [k.lower() for k in (blocked_keywords or [])]
        self._action = Action(action)

    @property
    def name(self) -> str:
        return "topic_filter"

    async def check(
        self,
        text: str,
        *,
        context: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str, list[Violation]]:
        lower = text.lower()

        # Check blocked keywords first
        for keyword in self._blocked:
            if keyword in lower:
                return text, [
                    Violation(
                        rule=self.name,
                        message=f"Blocked keyword detected: {keyword}",
                        severity=Severity.MEDIUM,
                        action=self._action,
                        metadata={"keyword": keyword, "type": "blocked"},
                    )
                ]

        # Check if any allowed topic matches
        if self._allowed:
            if not any(topic in lower for topic in self._allowed):
                return text, [
                    Violation(
                        rule=self.name,
                        message="Query does not match any allowed topics",
                        severity=Severity.LOW,
                        action=self._action,
                        metadata={"allowed_topics": self._allowed},
                    )
                ]

        return text, []


class PromptInjectionDetector(GuardRule):
    """
    Detect common prompt injection patterns.

    Uses pattern matching for speed. For production, combine with
    LLM-based classification for better accuracy.
    """

    _PATTERNS = [
        (r"ignore (?:previous|above|all|prior) (?:instructions|prompts|rules)", "instruction_override"),
        (r"you are now (?:a |an )?", "role_reassignment"),
        (r"new (?:instructions|rules|role):", "new_instructions"),
        (r"(?:system|assistant|user)\s*:", "role_injection"),
        (r"\[(?:INST|SYS|SYSTEM)\]", "format_injection"),
        (r"(?:do not|don't) (?:follow|obey|listen)", "disobey_command"),
        (r"pretend (?:you are|to be)", "pretend_command"),
        (r"(?:reveal|show|tell me) (?:your|the) (?:system|original|hidden) (?:prompt|instructions)", "prompt_extraction"),
    ]

    def __init__(self, *, action: str = "block") -> None:
        self._action = Action(action)
        self._compiled = [
            (re.compile(pattern, re.IGNORECASE), label)
            for pattern, label in self._PATTERNS
        ]

    @property
    def name(self) -> str:
        return "prompt_injection_detector"

    async def check(
        self,
        text: str,
        *,
        context: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str, list[Violation]]:
        violations: list[Violation] = []

        for pattern, label in self._compiled:
            if pattern.search(text):
                violations.append(
                    Violation(
                        rule=self.name,
                        message=f"Potential prompt injection: {label}",
                        severity=Severity.CRITICAL,
                        action=self._action,
                        metadata={"pattern": label},
                    )
                )

        return text, violations


class HallucinationScorer(GuardRule):
    """
    Score LLM output for hallucination against retrieved context.

    Uses token overlap as a fast heuristic. For production, enhance
    with NLI (Natural Language Inference) model or LLM-as-judge.

    The score is: (tokens in output that appear in context) / (total output tokens)
    Score of 1.0 = fully grounded, 0.0 = fully hallucinated.
    """

    def __init__(
        self,
        *,
        threshold: float = 0.3,
        action: str = "flag",
    ) -> None:
        """
        Args:
            threshold: Minimum grounding score (0.0 - 1.0). Below = violation.
            action: "block" or "flag"
        """
        self._threshold = threshold
        self._action = Action(action)

    @property
    def name(self) -> str:
        return "hallucination_scorer"

    async def check(
        self,
        text: str,
        *,
        context: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str, list[Violation]]:
        if not context:
            # No context to check against — can't score
            return text, [
                Violation(
                    rule=self.name,
                    message="No context provided for hallucination check",
                    severity=Severity.LOW,
                    action=Action.FLAG,
                    metadata={"score": 0.0, "reason": "no_context"},
                )
            ]

        score = self._compute_grounding_score(text, context)

        violations: list[Violation] = []
        if score < self._threshold:
            violations.append(
                Violation(
                    rule=self.name,
                    message=f"Low grounding score: {score:.2f} (threshold: {self._threshold})",
                    severity=Severity.MEDIUM if score > 0.1 else Severity.HIGH,
                    action=self._action,
                    metadata={"score": score, "threshold": self._threshold},
                )
            )

        return text, violations

    def _compute_grounding_score(self, output: str, context: list[str]) -> float:
        """
        Compute overlap-based grounding score.

        This is a fast heuristic. Production systems should use:
        - NLI model (e.g., cross-encoder/nli-deberta-v3-base)
        - LLM-as-judge (send output + context, ask "is this grounded?")
        """
        # Tokenize (simple whitespace + lowercased)
        output_tokens = set(self._tokenize(output))
        context_tokens: set[str] = set()
        for chunk in context:
            context_tokens.update(self._tokenize(chunk))

        if not output_tokens:
            return 1.0  # Empty output is trivially grounded

        # Remove common stop words to focus on content tokens
        stop_words = {
            "the", "a", "an", "is", "are", "was", "were", "be", "been",
            "being", "have", "has", "had", "do", "does", "did", "will",
            "would", "could", "should", "may", "might", "can", "shall",
            "to", "of", "in", "for", "on", "with", "at", "by", "from",
            "as", "into", "through", "during", "before", "after", "and",
            "but", "or", "nor", "not", "so", "yet", "both", "either",
            "neither", "each", "every", "all", "any", "few", "more",
            "most", "other", "some", "such", "no", "only", "own", "same",
            "than", "too", "very", "just", "because", "if", "when", "that",
            "this", "these", "those", "it", "its", "i", "me", "my", "we",
            "our", "you", "your", "he", "she", "they", "them", "their",
        }
        output_content = output_tokens - stop_words
        context_content = context_tokens - stop_words

        if not output_content:
            return 1.0

        overlap = output_content & context_content
        return len(overlap) / len(output_content)

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        """Simple whitespace tokenizer with cleanup."""
        return [
            re.sub(r"[^\w]", "", token.lower())
            for token in text.split()
            if len(token) > 1
        ]


class ContentFilter(GuardRule):
    """
    Filter output for content policy violations.

    Checks for explicit content, violence references, etc.
    Extend with custom patterns per domain.
    """

    def __init__(
        self,
        *,
        blocked_patterns: list[str] | None = None,
        action: str = "block",
    ) -> None:
        self._action = Action(action)
        self._patterns = [
            re.compile(p, re.IGNORECASE)
            for p in (blocked_patterns or [])
        ]

    @property
    def name(self) -> str:
        return "content_filter"

    async def check(
        self,
        text: str,
        *,
        context: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[str, list[Violation]]:
        violations: list[Violation] = []
        for pattern in self._patterns:
            if pattern.search(text):
                violations.append(
                    Violation(
                        rule=self.name,
                        message=f"Content policy violation: {pattern.pattern}",
                        severity=Severity.HIGH,
                        action=self._action,
                        metadata={"pattern": pattern.pattern},
                    )
                )
        return text, violations


# ─── Guards ──────────────────────────────────────────────────────────────────


class InputGuard:
    """
    Validate user input before sending to LLM.

    Runs rules in order. Fails fast on first blocking violation.

    Usage::

        guard = InputGuard(rules=[
            PiiDetector(action="block"),
            TopicFilter(allowed_topics=["medical", "health"]),
            PromptInjectionDetector(),
        ])
        result = await guard.check("What's the treatment for diabetes?")
        if result.passed:
            response = await llm.complete(result.output)
    """

    def __init__(self, rules: list[GuardRule]) -> None:
        self._rules = rules

    async def check(
        self,
        text: str,
        *,
        metadata: dict[str, Any] | None = None,
    ) -> GuardResult:
        """Run all input rules. Returns GuardResult."""
        current_text = text
        all_violations: list[Violation] = []

        for rule in self._rules:
            current_text, violations = await rule.check(
                current_text, metadata=metadata
            )
            all_violations.extend(violations)

            # Fail fast on blocking violations
            if any(v.action == Action.BLOCK for v in violations):
                return GuardResult(
                    passed=False,
                    output=current_text,
                    violations=all_violations,
                )

        return GuardResult(
            passed=True,
            output=current_text,
            violations=all_violations,
        )


class OutputGuard:
    """
    Validate LLM output before returning to user.

    Runs rules in order. Applies redactions cumulatively.

    Usage::

        guard = OutputGuard(rules=[
            HallucinationScorer(threshold=0.3),
            PiiDetector(action="redact"),
        ])
        result = await guard.check(
            output=llm_response,
            context=retrieved_chunks,
        )
        if result.passed:
            return result.output  # redacted if needed
    """

    def __init__(self, rules: list[GuardRule]) -> None:
        self._rules = rules

    async def check(
        self,
        output: str,
        *,
        context: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> GuardResult:
        """Run all output rules. Returns GuardResult with possibly redacted output."""
        current_text = output
        all_violations: list[Violation] = []

        for rule in self._rules:
            current_text, violations = await rule.check(
                current_text, context=context, metadata=metadata
            )
            all_violations.extend(violations)

            # Fail fast on blocking violations
            if any(v.action == Action.BLOCK for v in violations):
                return GuardResult(
                    passed=False,
                    output=current_text,
                    violations=all_violations,
                )

        blocked = any(v.action == Action.BLOCK for v in all_violations)
        return GuardResult(
            passed=not blocked,
            output=current_text,
            violations=all_violations,
        )
