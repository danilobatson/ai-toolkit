# ADR-004: Langfuse over LangSmith for AI Observability

## Status
Accepted

## Date
2026-03-27

## Context
The toolkit needs an AI observability layer for tracing LLM calls, evaluating output quality, and tracking token costs. The monitor module wraps this behind our adapter pattern so the underlying provider can change without affecting user code. Two serious contenders exist: Langfuse (open-source) and LangSmith (LangChain's hosted platform).

## Decision
Use Langfuse as the observability backend for the monitor module.

## Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| **Langfuse** (chosen) | Open-source, free cloud tier, vendor-neutral, works with any LLM provider, simple JS SDK, self-hostable, v5 SDK with OTel support | Smaller community than LangSmith, fewer built-in evaluators |
| **LangSmith** | Deep LangChain integration, mature evaluation suite, large community | Proprietary, requires LangChain dependency for best experience, no free tier for production, vendor lock-in to LangChain ecosystem |
| **OpenTelemetry only** | Standard, vendor-neutral, huge ecosystem | No LLM-specific features (token tracking, prompt management, evaluation), requires significant custom work |
| **Custom logging** | Zero dependencies, full control | Massive build effort, no dashboard, no evaluation framework |

## Consequences
**Positive:**
- Free cloud tier works for demos and small projects (no billing required)
- Open-source means users can self-host for privacy-sensitive workloads
- Vendor-neutral: traces any LLM provider (OpenAI, Anthropic, Groq, etc.)
- Our adapter pattern means swapping Langfuse for another provider changes one file
- v5 SDK uses OpenTelemetry under the hood, future-proofing for OTel ecosystem

**Negative:**
- Langfuse SDK is a peer dependency users must install
- Built-in evaluators are less mature than LangSmith's
- Self-hosting requires separate infrastructure (Postgres + clickhouse)
- Noop fallback means users without Langfuse get local cost tracking only

## Interview Answer
We chose Langfuse over LangSmith because it's open-source, vendor-neutral (works with any LLM provider, not just LangChain), and has a free cloud tier — critical for a toolkit that needs to work out of the box without requiring billing setup. Our adapter pattern wraps Langfuse behind a MonitorClient interface, so if a team prefers LangSmith or pure OpenTelemetry, only the adapter file changes.
