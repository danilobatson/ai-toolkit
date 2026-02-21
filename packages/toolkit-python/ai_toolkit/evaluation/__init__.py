"""
RAG evaluation — RAGAS-style metrics for retrieval and generation quality.

Usage::

    from ai_toolkit.evaluation import evaluate, evaluate_batch

    result = evaluate(question=q, answer=a, context=chunks, reference=ref)
    print(f"Overall: {result.overall:.2f}")
"""

from .metrics import (
    BatchEvalResult,
    EvalResult,
    evaluate,
    evaluate_batch,
    evaluate_with_llm,
)

__all__ = [
    "BatchEvalResult",
    "EvalResult",
    "evaluate",
    "evaluate_batch",
    "evaluate_with_llm",
]
