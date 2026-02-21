"""
RAG evaluation metrics — measure retrieval and generation quality.

Implements RAGAS-inspired metrics without the RAGAS dependency:
- **Faithfulness**: Is the answer grounded in the retrieved context?
- **Relevancy**: Is the answer relevant to the question?
- **Context Precision**: Are the retrieved chunks relevant to the question?
- **Context Recall**: Does the context contain the information needed?

Two modes:
1. **Fast (no LLM)** — Token overlap heuristics. Free, instant, good for CI.
2. **LLM-as-judge** — Uses your LLMClient for scoring. More accurate, costs money.

Usage::

    from ai_toolkit.evaluation import evaluate, EvalConfig

    result = evaluate(
        question="What is the treatment for diabetes?",
        answer="Metformin is the first-line treatment.",
        context=["Metformin is recommended as first-line therapy for type 2 diabetes."],
        reference="Metformin is the standard first-line treatment for type 2 diabetes.",
    )
    print(f"Faithfulness: {result.faithfulness:.2f}")
    print(f"Relevancy:    {result.relevancy:.2f}")
    print(f"Precision:    {result.context_precision:.2f}")

    # LLM-as-judge (more accurate)
    result = await evaluate_with_llm(llm, question=..., answer=..., context=...)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from ai_toolkit.llm.client import LLMClient
from ai_toolkit.llm.structured import extract


# ─── Types ───────────────────────────────────────────────────────────────────


@dataclass
class EvalResult:
    """Evaluation scores for a single question-answer pair."""

    faithfulness: float
    """How well the answer is grounded in the context (0.0 - 1.0)."""

    relevancy: float
    """How relevant the answer is to the question (0.0 - 1.0)."""

    context_precision: float
    """How relevant the retrieved context is to the question (0.0 - 1.0)."""

    context_recall: float
    """How much of the reference answer is covered by the context (0.0 - 1.0)."""

    metadata: dict[str, Any] = field(default_factory=dict)
    """Additional scoring details."""

    @property
    def overall(self) -> float:
        """Harmonic mean of all four metrics."""
        scores = [self.faithfulness, self.relevancy, self.context_precision, self.context_recall]
        nonzero = [s for s in scores if s > 0]
        if not nonzero:
            return 0.0
        return len(nonzero) / sum(1.0 / s for s in nonzero)


@dataclass
class BatchEvalResult:
    """Aggregated evaluation over multiple question-answer pairs."""

    results: list[EvalResult]
    """Individual results."""

    @property
    def count(self) -> int:
        return len(self.results)

    @property
    def avg_faithfulness(self) -> float:
        return _mean([r.faithfulness for r in self.results])

    @property
    def avg_relevancy(self) -> float:
        return _mean([r.relevancy for r in self.results])

    @property
    def avg_context_precision(self) -> float:
        return _mean([r.context_precision for r in self.results])

    @property
    def avg_context_recall(self) -> float:
        return _mean([r.context_recall for r in self.results])

    @property
    def avg_overall(self) -> float:
        return _mean([r.overall for r in self.results])

    def summary(self) -> dict[str, float]:
        return {
            "faithfulness": self.avg_faithfulness,
            "relevancy": self.avg_relevancy,
            "context_precision": self.avg_context_precision,
            "context_recall": self.avg_context_recall,
            "overall": self.avg_overall,
            "count": float(self.count),
        }


# ─── Tokenizer Utility ──────────────────────────────────────────────────────

_STOP_WORDS = frozenset({
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "and", "but", "or", "nor", "not", "so", "yet",
    "both", "either", "neither", "each", "every", "all", "any", "few",
    "more", "most", "other", "some", "such", "no", "only", "own", "same",
    "than", "too", "very", "just", "because", "if", "when", "that",
    "this", "these", "those", "it", "its", "i", "me", "my", "we",
    "our", "you", "your", "he", "she", "they", "them", "their", "what",
    "how", "which", "where", "who", "whom",
})


def _tokenize(text: str) -> set[str]:
    """Tokenize text into content words (lowercase, no stop words)."""
    tokens = set()
    for word in re.split(r"\W+", text.lower()):
        if word and len(word) > 1 and word not in _STOP_WORDS:
            tokens.add(word)
    return tokens


def _overlap_score(a: str, b: str) -> float:
    """Token overlap ratio between two texts."""
    tokens_a = _tokenize(a)
    tokens_b = _tokenize(b)
    if not tokens_a or not tokens_b:
        return 0.0
    overlap = tokens_a & tokens_b
    return len(overlap) / max(len(tokens_a), len(tokens_b))


def _mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


# ─── Fast Evaluation (No LLM) ───────────────────────────────────────────────


def evaluate(
    *,
    question: str,
    answer: str,
    context: list[str],
    reference: str = "",
) -> EvalResult:
    """
    Evaluate a RAG response using token-overlap heuristics.

    Fast, free, no LLM needed. Good for CI pipelines and quick checks.
    For higher accuracy, use ``evaluate_with_llm``.

    Args:
        question: The user's question
        answer: The LLM's generated answer
        context: Retrieved chunks used to generate the answer
        reference: Ground-truth reference answer (optional, improves recall score)
    """
    combined_context = " ".join(context)

    # Faithfulness: answer grounded in context
    faithfulness = _overlap_score(answer, combined_context) if context else 0.0

    # Relevancy: answer addresses the question
    relevancy = _overlap_score(answer, question)

    # Context Precision: retrieved chunks relevant to question
    if context:
        chunk_scores = [_overlap_score(chunk, question) for chunk in context]
        context_precision = _mean(chunk_scores)
    else:
        context_precision = 0.0

    # Context Recall: context covers the reference answer
    if reference and context:
        context_recall = _overlap_score(combined_context, reference)
    elif not reference:
        # No reference — use answer as proxy
        context_recall = faithfulness
    else:
        context_recall = 0.0

    return EvalResult(
        faithfulness=round(faithfulness, 4),
        relevancy=round(relevancy, 4),
        context_precision=round(context_precision, 4),
        context_recall=round(context_recall, 4),
        metadata={"mode": "fast", "context_chunks": len(context)},
    )


def evaluate_batch(
    *,
    questions: list[str],
    answers: list[str],
    contexts: list[list[str]],
    references: list[str] | None = None,
) -> BatchEvalResult:
    """
    Evaluate multiple RAG responses.

    Args:
        questions: List of user questions
        answers: List of LLM answers
        contexts: List of context chunk lists
        references: Optional list of ground-truth answers
    """
    if not (len(questions) == len(answers) == len(contexts)):
        raise ValueError("questions, answers, and contexts must have the same length")

    refs = references or [""] * len(questions)
    results = [
        evaluate(question=q, answer=a, context=c, reference=r)
        for q, a, c, r in zip(questions, answers, contexts, refs)
    ]
    return BatchEvalResult(results=results)


# ─── LLM-as-Judge Evaluation ────────────────────────────────────────────────


async def evaluate_with_llm(
    llm: LLMClient,
    *,
    question: str,
    answer: str,
    context: list[str],
    reference: str = "",
) -> EvalResult:
    """
    Evaluate a RAG response using an LLM as judge.

    More accurate than token overlap but costs money.
    Uses structured output to get reliable scores.

    Args:
        llm: An LLMClient instance
        question: The user's question
        answer: The LLM's generated answer
        context: Retrieved chunks
        reference: Ground-truth reference answer (optional)
    """
    from pydantic import BaseModel, Field

    class EvalScores(BaseModel):
        faithfulness: float = Field(
            description="Score 0.0-1.0: Is the answer grounded in the provided context? "
            "1.0 = every claim is supported, 0.0 = completely made up."
        )
        relevancy: float = Field(
            description="Score 0.0-1.0: Does the answer address the question? "
            "1.0 = perfectly relevant, 0.0 = completely off-topic."
        )
        context_precision: float = Field(
            description="Score 0.0-1.0: Are the retrieved context chunks relevant to the question? "
            "1.0 = all chunks are relevant, 0.0 = none are relevant."
        )
        context_recall: float = Field(
            description="Score 0.0-1.0: Does the context contain enough information to answer? "
            "1.0 = context has everything needed, 0.0 = context is useless."
        )

    context_text = "\n\n---\n\n".join(f"[Chunk {i+1}] {c}" for i, c in enumerate(context))

    eval_prompt = f"""Evaluate this RAG (Retrieval-Augmented Generation) response.

Question: {question}

Answer: {answer}

Retrieved Context:
{context_text}
"""
    if reference:
        eval_prompt += f"\nReference Answer: {reference}\n"

    eval_prompt += "\nScore each metric from 0.0 to 1.0."

    result = await extract(
        llm,
        EvalScores,
        eval_prompt,
        system="You are an expert RAG evaluation judge. Score each metric precisely.",
        temperature=0.0,
    )

    scores = result.data
    return EvalResult(
        faithfulness=round(max(0.0, min(1.0, scores.faithfulness)), 4),
        relevancy=round(max(0.0, min(1.0, scores.relevancy)), 4),
        context_precision=round(max(0.0, min(1.0, scores.context_precision)), 4),
        context_recall=round(max(0.0, min(1.0, scores.context_recall)), 4),
        metadata={
            "mode": "llm",
            "model": result.model,
            "cost": result.cost,
            "context_chunks": len(context),
        },
    )
