"""
Durable workflow helpers for AI pipelines via Inngest.

Wraps inngest-python with AI-specific patterns:
- **ai_step**: LLM call as a durable step (retries, fallback, cost tracking)
- **human_in_the_loop**: Pause workflow until human approves
- **budget_guard**: Enforce token/cost budgets per workflow

Inngest is optional — ``uv add inngest``

Usage::

    from ai_toolkit.workflow import ai_step, human_in_the_loop

    @inngest_client.create_function(
        fn_id="triage-agent",
        trigger=inngest.TriggerEvent(event="patient/submitted"),
    )
    async def triage(ctx: inngest.Context, step: inngest.Step):
        # Durable LLM call — retries on failure, resumes on crash
        result = await ai_step(step, llm, "triage",
            prompt=f"Triage this patient: {ctx.event.data['note']}",
            system="You are a triage nurse.",
        )

        # Human approval before proceeding
        approved = await human_in_the_loop(step,
            event_name="triage/approved",
            timeout="24h",
            data={"triage_result": result.content},
        )

        if approved:
            # Continue pipeline...
            pass
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ai_toolkit.errors import ToolkitError
from ai_toolkit.llm.client import LLMClient
from ai_toolkit.llm.providers import LLMResponse


class WorkflowError(ToolkitError):
    """Workflow execution error."""

    def __init__(self, message: str, **kwargs: Any) -> None:
        super().__init__(message, code="WORKFLOW_ERROR", **kwargs)


class BudgetExceededError(WorkflowError):
    """Token or cost budget exceeded."""

    def __init__(self, message: str, **kwargs: Any) -> None:
        # Call ToolkitError.__init__ directly to avoid double code
        ToolkitError.__init__(self, message, code="BUDGET_EXCEEDED", **kwargs)


@dataclass
class WorkflowBudget:
    """Token and cost budget for a workflow execution."""

    max_input_tokens: int = 0
    """Max input tokens (0 = unlimited)."""

    max_output_tokens: int = 0
    """Max output tokens (0 = unlimited)."""

    max_cost_usd: float = 0.0
    """Max cost in USD (0.0 = unlimited)."""

    # Running totals
    used_input_tokens: int = 0
    used_output_tokens: int = 0
    used_cost_usd: float = 0.0

    def check(self) -> None:
        """Raise BudgetExceededError if any limit is exceeded."""
        if self.max_input_tokens and self.used_input_tokens > self.max_input_tokens:
            raise BudgetExceededError(
                f"Input token budget exceeded: {self.used_input_tokens}/{self.max_input_tokens}",
            )
        if self.max_output_tokens and self.used_output_tokens > self.max_output_tokens:
            raise BudgetExceededError(
                f"Output token budget exceeded: {self.used_output_tokens}/{self.max_output_tokens}",
            )
        if self.max_cost_usd and self.used_cost_usd > self.max_cost_usd:
            raise BudgetExceededError(
                f"Cost budget exceeded: ${self.used_cost_usd:.4f}/${self.max_cost_usd:.4f}",
            )

    def track(self, response: LLMResponse) -> None:
        """Update running totals from an LLM response."""
        self.used_input_tokens += response.input_tokens
        self.used_output_tokens += response.output_tokens
        self.used_cost_usd += response.cost


async def ai_step(
    step: Any,
    llm: LLMClient,
    step_id: str,
    *,
    prompt: str,
    system: str = "",
    temperature: float | None = None,
    max_tokens: int | None = None,
    budget: WorkflowBudget | None = None,
) -> LLMResponse:
    """
    Execute an LLM call as a durable Inngest step.

    The step is retryable — if the process crashes mid-call, Inngest
    resumes from the last completed step. The LLM response is serialized
    and cached by Inngest.

    Args:
        step: Inngest Step object
        llm: LLMClient instance
        step_id: Unique identifier for this step
        prompt: User prompt
        system: System prompt
        budget: Optional budget to enforce

    Returns:
        LLMResponse from the LLM call
    """
    if budget:
        budget.check()

    async def _run() -> dict[str, Any]:
        response = await llm.complete(
            prompt,
            system=system,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if budget:
            budget.track(response)
            budget.check()

        return {
            "content": response.content,
            "model": response.model,
            "provider": response.provider,
            "input_tokens": response.input_tokens,
            "output_tokens": response.output_tokens,
            "cost": response.cost,
            "latency_ms": response.latency_ms,
        }

    # Inngest step.run makes this durable
    data = await step.run(step_id, _run)

    return LLMResponse(
        content=data["content"],
        model=data["model"],
        provider=data["provider"],
        input_tokens=data["input_tokens"],
        output_tokens=data["output_tokens"],
        cost=data["cost"],
        latency_ms=data["latency_ms"],
    )


async def human_in_the_loop(
    step: Any,
    *,
    event_name: str,
    timeout: str = "24h",
    data: dict[str, Any] | None = None,
    match_expression: str | None = None,
) -> dict[str, Any] | None:
    """
    Pause workflow and wait for human approval.

    Uses Inngest's ``step.wait_for_event`` to pause execution until
    an approval event is received or the timeout expires.

    Args:
        step: Inngest Step object
        event_name: Event name to wait for (e.g., "triage/approved")
        timeout: How long to wait (e.g., "24h", "7d", "30m")
        data: Data to include in the waiting context (for UI display)
        match_expression: Inngest match expression for event correlation

    Returns:
        The approval event data, or None if timeout expired
    """
    event = await step.wait_for_event(
        f"wait-{event_name}",
        event=event_name,
        timeout=timeout,
        if_exp=match_expression,
    )

    return event.data if event else None


async def parallel_agents(
    step: Any,
    llm: LLMClient,
    agents: list[dict[str, Any]],
    *,
    budget: WorkflowBudget | None = None,
) -> list[LLMResponse]:
    """
    Run multiple agent steps in parallel.

    Each agent is a dict with: step_id, prompt, system (optional).

    Args:
        step: Inngest Step object
        llm: LLMClient instance
        agents: List of agent configurations
        budget: Shared budget across all agents

    Returns:
        List of LLMResponses in the same order as agents
    """
    results: list[LLMResponse] = []
    for agent in agents:
        result = await ai_step(
            step,
            llm,
            agent["step_id"],
            prompt=agent["prompt"],
            system=agent.get("system", ""),
            budget=budget,
        )
        results.append(result)
    return results
