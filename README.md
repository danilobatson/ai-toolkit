# ai-toolkit

`@jamaalbuilds/ai-toolkit` is a TypeScript SDK that wraps the libraries a
production AI feature typically needs — model calls, chains/RAG, agent
orchestration, document ingestion, observability, durable workflows,
Postgres/vector search, MCP servers, auth, caching, storage, and more —
behind one adapter API with consistent naming and typed errors.

This is the monorepo: the published package lives in `packages/toolkit`,
the documentation site in `packages/docs`, and a CLI in `packages/cli`.

## Install

```bash
yarn add @jamaalbuilds/ai-toolkit
```

Peer dependencies are optional — install only the libraries the modules you
use actually need (see [ADR-009](docs/adrs/009-optional-peer-dependency-pattern.md)).

## The problem

Shipping one production AI feature in TypeScript today usually means
reaching for a model SDK, LangChain.js for composition, LangGraph.js for
multi-step agents, LlamaIndex.js-adjacent tooling for document ingestion,
Langfuse for tracing, Inngest for durable background jobs, Drizzle for
vector search, and the MCP SDK for tool servers. Each has its own
initialization pattern, vocabulary, and error shape. The cost isn't reading
eight docs sites — it's holding eight incompatible mental models at once and
translating between them every time a feature crosses module boundaries.
`ai-toolkit` puts one interface in front of that translation so the rest of
the codebase only has to learn it once.

## Quick start

```typescript
import { initToolkit } from '@jamaalbuilds/ai-toolkit/config';
import { createAI } from '@jamaalbuilds/ai-toolkit/ai';
import { createCache } from '@jamaalbuilds/ai-toolkit/cache';

// Validate env vars at startup
const toolkit = initToolkit();

// Auto-detects provider from env (Groq, OpenRouter, OpenAI, Anthropic)
const ai = createAI();
const result = await ai.generate('Summarize this document.', {
  system: 'You are a helpful assistant.',
});
console.log(result.text);

// Auto-detects Redis vs in-memory
const cache = createCache();
await cache.set('key', result.text, { ttl: 3600 });
```

## Modules

The module table — what each module wraps, what it does, and its peer
deps — is the single source of truth in
[`packages/toolkit/README.md`](packages/toolkit/README.md#modules). The same
table is served machine-readable at
[`/llms.txt`](https://ai-toolkit-docs.vercel.app/llms.txt) from
[`packages/toolkit/LLMS.md`](packages/toolkit/LLMS.md). Full docs, with a
page per module, are at [ai-toolkit-docs.vercel.app](https://ai-toolkit-docs.vercel.app).

## Requirements

- Node.js >= 22
- Yarn 1.x (this repo uses yarn workspaces — see
  [CONTRIBUTING.md](CONTRIBUTING.md) for the monorepo dev setup)

## Architecture

Every module wraps its underlying library behind toolkit's own interface —
the third-party API is never exposed directly. The reasoning behind each
library choice (Vercel AI SDK over raw providers, Drizzle over Prisma,
Langfuse over LangSmith, and so on) is recorded as it's made in
[`docs/adrs/`](docs/adrs/). The [documentation site](https://ai-toolkit-docs.vercel.app)
covers the same rules in narrative form.

## License

MIT — see [LICENSE](LICENSE).
