"""
AI safety guardrails — input validation and output filtering.

Usage::

    from ai_toolkit.guardrails import InputGuard, OutputGuard, PiiDetector, TopicFilter

    input_guard = InputGuard(rules=[PiiDetector(action="block"), TopicFilter(allowed_topics=["medical"])])
    output_guard = OutputGuard(rules=[HallucinationScorer(threshold=0.3), PiiDetector(action="redact")])
"""

from .guards import (
    Action,
    ContentFilter,
    GuardResult,
    GuardRule,
    HallucinationScorer,
    InputGuard,
    OutputGuard,
    PiiDetector,
    PromptInjectionDetector,
    Severity,
    TopicFilter,
    Violation,
)

__all__ = [
    "InputGuard",
    "OutputGuard",
    "ContentFilter",
    "GuardRule",
    "HallucinationScorer",
    "PiiDetector",
    "PromptInjectionDetector",
    "TopicFilter",
    "Action",
    "GuardResult",
    "Severity",
    "Violation",
]
