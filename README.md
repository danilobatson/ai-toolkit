# ai-toolkit

`@jamaalbuilds/ai-toolkit` is a TypeScript SDK that wraps a set of AI and
infrastructure libraries — an LLM client, an orchestration layer, a vector
store, a background job runner, an observability tool, and more — behind one
consistent adapter API. See `packages/toolkit/README.md` for the full picture,
including every module's API and options.

## Install

```bash
yarn add @jamaalbuilds/ai-toolkit
```

Peer dependencies are optional — install only what the modules you use
actually require. `packages/toolkit/README.md` lists each module's peers.

## The Problem

A TypeScript AI feature typically needs an LLM client, a multi-step
orchestration layer, a vector store, a background job runner, a tracing tool,
and a way to expose tools over MCP. Each of those is shipped as a separate
library, and none of them agree on how to represent a message, a tool call,
a retry, or a config object. Wiring them together means learning eight
different mental models and hand-translating between them at every
integration point — a cost that is paid once per project, not once per
library. `ai-toolkit` does not replace those libraries; it wraps each one
behind a single adapter interface so that translation happens once, in the
toolkit, instead of being re-derived by every consumer. The reasoning behind
each wrapping decision is recorded as an ADR in `docs/adrs/`.

## Quick Start

```typescript
import { createAI } from '@jamaalbuilds/ai-toolkit/ai';

const ai = createAI(); // auto-detects provider from env (Groq, OpenRouter, OpenAI, Anthropic)
const result = await ai.generate('Summarize this document.');
console.log(result.text);
```

Requires a provider API key in the environment. See
`packages/toolkit/README.md` for the full quick start, including `config`
and `cache`.

## Modules

Every module is a subpath import, e.g. `@jamaalbuilds/ai-toolkit/ai`,
`@jamaalbuilds/ai-toolkit/chain`. The full module table — what each one
wraps and its peer dependencies — lives in `packages/toolkit/README.md` and
is served machine-readably at the docs site's `/llms.txt`.

## Requirements

- Node.js >= 22
- Yarn (this is a yarn workspaces monorepo; see `CONTRIBUTING.md`)

## Architecture

Every third-party library is wrapped behind the toolkit's own interface —
consumers never see raw LangChain, LlamaIndex, or other underlying APIs.
Each significant design decision (why LangGraph over a custom state
machine, why Drizzle over Prisma, how optional peer dependencies are
loaded, etc.) is recorded as an ADR in `docs/adrs/`. Full documentation,
including guides and API reference, is at
[ai-toolkit-docs.vercel.app](https://ai-toolkit-docs.vercel.app).

## License

MIT — see [LICENSE](./LICENSE).
