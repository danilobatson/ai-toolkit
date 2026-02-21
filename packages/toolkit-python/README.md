# ai-toolkit (Python SDK)

Provider-agnostic AI toolkit for building production AI applications.

## Install

```bash
# Core (no LLM providers)
uv add ai-toolkit

# With specific providers
uv add ai-toolkit[google]     # Gemini (free tier)
uv add ai-toolkit[groq]       # Groq (free tier)
uv add ai-toolkit[anthropic]  # Claude
uv add ai-toolkit[openai]     # GPT + Embeddings + Ollama

# All providers
uv add ai-toolkit[llm]

# Everything (providers + redis cache)
uv add ai-toolkit[all]
```

## Quick Start

```python
from ai_toolkit.llm import create_llm_client

# Auto-detects providers from env vars (free tiers first)
llm = create_llm_client()
response = await llm.complete("Summarize this document")
print(f"${response.cost:.4f} | {response.provider}:{response.model}")

# Or pick your provider
from ai_toolkit.llm.providers import GoogleProvider
llm = create_llm_client(providers=[GoogleProvider()])  # uses gemini-2.0-flash
```

## Providers

| Provider | Default Model | Install | Cost |
|----------|--------------|---------|------|
| Google Gemini | gemini-2.0-flash | `[google]` | Free tier |
| Groq | llama-3.3-70b-versatile | `[groq]` | Free tier |
| Anthropic | claude-sonnet-4-20250514 | `[anthropic]` | Paid |
| OpenAI | gpt-4o | `[openai]` | Paid |
| Ollama | llama3.2 | `[openai]` | Free (local) |

All defaults are overridable: `GoogleProvider(model="gemini-1.5-flash")`

## Modules

| Module | What | Optional Dep |
|--------|------|-------------|
| `config/` | Pydantic Settings, env validation | — |
| `errors/` | Typed error hierarchy | — |
| `cache/` | Redis async client | `[redis]` |
| `llm/` | 5 providers, retry, fallback, circuit breaker, streaming, cost | `[llm]` |
| `llm/embeddings` | Batching, caching, cost tracking | `[openai]` |
| `llm/structured` | Pydantic model extraction | `[llm]` |
| `llm/prompts` | Langfuse + local fallback, variable substitution | `[observability]` |
| `ingestion/` | PDF/DOCX/HTML/text extraction, chunker, pipeline | `[ingestion]` |
| `guardrails/` | PII, topic filter, injection, hallucination, content filter | — |
| `evaluation/` | RAGAS metrics (fast + LLM-as-judge) | `[llm]` |
| `workflow/` | Inngest ai_step, human_in_the_loop, budget tracking | `[workflow]` |
| `auth/` | FastAPI deps: get_org_id, require_api_key | — |
| `security/` | RateLimiter (Redis), AuditLogger (JSON) | `[redis]` |
| `observability/` | Langfuse init, structured logger | `[observability]` |

## Part of [@jamaalbuilds/ai-toolkit](https://github.com/danilobatson/ai-toolkit)
