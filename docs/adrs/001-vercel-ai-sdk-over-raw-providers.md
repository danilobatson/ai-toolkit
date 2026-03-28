# ADR-001: Vercel AI SDK over raw provider SDKs

**Status:** Accepted
**Date:** 2026-03-28
**Decision:** Use Vercel AI SDK (`ai` package) as the unified LLM interface instead of wrapping individual provider SDKs (OpenAI, Anthropic, Groq, etc.) directly.

## Context

The `ai` module needs to call LLM providers for text generation, streaming, and structured output. We evaluated two approaches:

1. **Raw provider SDKs** — import `@anthropic-ai/sdk`, `openai`, etc. and write adapters for each.
2. **Vercel AI SDK** — use the `ai` package which provides a single interface across all providers.

The v4 `llm/` module used approach 1, requiring separate Anthropic and OpenAI adapters with provider-specific response parsing.

## Decision

Use Vercel AI SDK v6 (`ai@6.0.141`) with provider sub-packages (`@ai-sdk/groq`, `@openrouter/ai-sdk-provider`).

## Reasons

1. **One interface, many providers.** `generateText()`, `streamText()`, `generateObject()` work identically across Groq, OpenRouter, Anthropic, OpenAI, and 20+ others. Adding a new provider requires only installing one package — zero adapter code.

2. **Structured output built-in.** `generateObject()` accepts a Zod schema directly and returns typed, validated output. Our v4 approach required manual JSON parsing and validation.

3. **Streaming built-in.** `streamText()` returns `textStream` (async iterable) plus helpers like `toDataStreamResponse()` for Next.js integration. No manual SSE handling.

4. **Massive adoption.** 10.2M weekly downloads, 23K GitHub stars, published daily. The ecosystem is not going away.

5. **22 MB install, 9 packages.** Extremely lean. Our v4 approach required `@anthropic-ai/sdk` (heavy) + `openai` (heavy) as separate peer deps.

6. **Free tier first.** Groq provides free API access for Llama models. OpenRouter offers free Gemini. This aligns with our "works with zero config" principle.

## Alternatives Considered

| Alternative | Why Not |
|---|---|
| Raw `@anthropic-ai/sdk` + `openai` | Two adapters to maintain, different response shapes, no unified streaming, no structured output |
| LangChain.js `ChatModel` | Heavier abstraction (45 MB), brings prompt template system we don't need for basic LLM calls |
| Direct fetch to provider REST APIs | No streaming helpers, no retry logic, no tool calling, manual token counting |

## Consequences

- **Positive:** Provider-agnostic from day one. Users can switch providers by changing one env var.
- **Positive:** Structured output (Zod schemas) works across all providers without adapter code.
- **Positive:** Free tier support (Groq, OpenRouter) out of the box.
- **Negative:** Dependency on Vercel's abstraction layer. If AI SDK makes breaking changes, we adapt.
- **Mitigated:** Our adapter pattern means we only change `ai-client.ts` and `provider.ts`, not consumer code.

## References

- [AI SDK v6 docs](https://ai-sdk.dev/docs)
- [AI SDK v6 migration guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0)
- Spike report: 2026-03-28 (all 6 deps evaluated)
