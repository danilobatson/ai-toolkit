# @jamaalbuilds/ai-toolkit

Unified TypeScript SDK for building AI-powered applications. One import. Clear names. Provider-agnostic. Auto-cleanup. Built-in security.

Wraps Vercel AI SDK, LangChain.js, LangGraph.js, LlamaIndex.js, Langfuse, Inngest, MCP SDK, Drizzle ORM, and more behind a consistent, beginner-friendly API.

## Install

```bash
yarn add @jamaalbuilds/ai-toolkit
```

All peer dependencies are optional — install only what you use.

## Quick Start

```typescript
import { initToolkit } from '@jamaalbuilds/ai-toolkit/config';
import { createAI } from '@jamaalbuilds/ai-toolkit/ai';
import { createCache } from '@jamaalbuilds/ai-toolkit/cache';

// Validate env vars at startup
const config = initToolkit();

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

Every module is a subpath import:

```typescript
import { createAI } from '@jamaalbuilds/ai-toolkit/ai';
import { createChain } from '@jamaalbuilds/ai-toolkit/chain';
import { createAgent } from '@jamaalbuilds/ai-toolkit/agents';
```

| Module | What It Does | Wraps | Peer Deps |
|--------|-------------|-------|-----------|
| `ai` | Call AI models — generate, stream, structured output | Vercel AI SDK | `ai`, `@ai-sdk/groq`, `@openrouter/ai-sdk-provider` |
| `chain` | Multi-step reasoning — prompt templates, output parsing, RAG | LangChain.js | `@langchain/core`, `@langchain/textsplitters` |
| `agents` | Multi-agent orchestration — routing, state, graphs | LangGraph.js | `@langchain/langgraph` |
| `knowledge` | Document ingestion, chunking, embedding, semantic search | LlamaIndex.js | `@llamaindex/liteparse` |
| `monitor` | Trace LLM calls, evaluate quality, cost tracking | Langfuse | `langfuse` |
| `workflow` | Durable background jobs — cron, retry, pause/resume, HITL | Inngest | `inngest` |
| `database` | Typed queries, vector search, migrations | Drizzle ORM | `drizzle-orm`, `postgres` |
| `mcp` | Build MCP servers, define tools & resources | MCP SDK | `@modelcontextprotocol/sdk` |
| `security` | PII detection, audit logging, rate limiting, guardrails | Custom | — |
| `auth` | API key validation, RBAC, multi-tenant context | Custom | — |
| `cache` | Get/set/invalidate with TTL (Redis or in-memory) | Custom | `ioredis` |
| `storage` | File upload with validation | Vercel Blob | `@vercel/blob` |
| `config` | Validate env vars, typed config | Zod | — |
| `errors` | Typed error hierarchy (8 subtypes) | Custom | — |
| `health` | Self-diagnostics, per-service status | Custom | — |
| `testing` | Mock AI, chains, agents, knowledge, workflows, DB — zero API calls | Custom | — |
| `data` | Shared API types (PaginatedResponse, ErrorResponse) | — | — |
| `api` | HTTP client with retry | Custom | — |

## AI — Generate, Stream, Structured Output

```typescript
import { createAI } from '@jamaalbuilds/ai-toolkit/ai';

const ai = createAI(); // auto-detects provider from env

// Generate text
const result = await ai.generate('Explain quantum computing');

// Stream tokens
const stream = await ai.stream('Write a poem about TypeScript');
for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}

// Structured output with Zod schema
import { z } from 'zod';
const structured = await ai.structured('Extract the person', {
  schema: z.object({ name: z.string(), age: z.number() }),
});
console.log(structured.object); // { name: "...", age: ... }
```

## Chain — Prompt Templates, Parsing, RAG

```typescript
import { prompt, parse, createChain, rag } from '@jamaalbuilds/ai-toolkit/chain';

// Prompt template
const template = prompt({ template: 'Summarize: {text}', variables: ['text'] });
const filled = template.format({ text: 'Long document...' });

// Output parsing (JSON, list, regex)
const parser = parse({ format: 'json', schema: z.object({ summary: z.string() }) });

// RAG pipeline
const result = await rag({
  query: 'What is the refund policy?',
  retriever: myRetriever,
  model: myModel,
});
```

## Agents — Multi-Agent Orchestration

```typescript
import { createAgent, createGraph, route } from '@jamaalbuilds/ai-toolkit/agents';

const researcher = createAgent({ name: 'researcher', instructions: 'Research topics' });
const writer = createAgent({ name: 'writer', instructions: 'Write content' });

const graph = createGraph({
  agents: { researcher, writer },
  edges: [{ from: 'researcher', to: 'writer' }],
});

const result = await graph.invoke({ messages: [{ role: 'user', content: 'Write about AI' }] });
```

## Knowledge — Document Ingestion & Search

```typescript
import { createKnowledge, parseDocument, chunk, ingest, search } from '@jamaalbuilds/ai-toolkit/knowledge';

// Parse a document
const doc = await parseDocument({ source: './report.pdf' });

// Chunk it
const chunks = chunk(doc.content, { strategy: 'paragraph', maxTokens: 512 });

// Full pipeline
const client = createKnowledge({ vectorStore: myStore, embedFn: myEmbedFn });
await client.ingest({ source: './report.pdf' });
const results = await client.search('quarterly revenue');
```

## Monitor — Tracing & Cost Tracking

```typescript
import { createMonitor, trace } from '@jamaalbuilds/ai-toolkit/monitor';

const monitor = await createMonitor({ langfusePublicKey: '...', langfuseSecretKey: '...' });

// Trace an LLM call
const span = trace(monitor, { name: 'summarize', attributes: { model: 'gpt-4' } });
span.end({ output: 'Summary result' });

// Cost tracking
monitor.recordCost({ model: 'gpt-4', inputTokens: 100, outputTokens: 50 });
const report = monitor.getCostReport();
```

## Workflow — Durable Background Jobs

```typescript
import { createWorkflow, defineJob, serve } from '@jamaalbuilds/ai-toolkit/workflow';

const workflow = createWorkflow({ id: 'my-app' });

const emailJob = defineJob(workflow, {
  id: 'send-welcome-email',
  trigger: { event: 'user/signup' },
  handler: async ({ event, step }) => {
    await step.run('send-email', async () => {
      await sendEmail(event.data.email);
    });
  },
});

serve(workflow, { framework: 'next' });
```

## Database — Vector Search & Migrations

```typescript
import { createDatabase, vectorSearch, migrate } from '@jamaalbuilds/ai-toolkit/database';

const db = createDatabase({ connectionString: process.env.DATABASE_URL });

// Vector similarity search
const results = await vectorSearch(db, {
  table: 'documents',
  column: 'embedding',
  query: [0.1, 0.2, ...],
  limit: 10,
});

// Run migrations
await migrate(db, { migrationsFolder: './drizzle' });
```

## Security — PII Detection, Guardrails, Rate Limiting

```typescript
import { detectPII, createGuardrails, createRateLimiter } from '@jamaalbuilds/ai-toolkit/security';

// Detect PII in text
const findings = detectPII('Contact john@example.com or call 555-1234');
// [{ type: 'EMAIL', match: 'john@example.com' }, { type: 'PHONE', match: '555-1234' }]

// Guardrails for LLM output
const guardrails = createGuardrails({ rules: [{ type: 'no-pii' }] });
const result = await guardrails.check('LLM response text');

// Rate limiting
const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 100 });
const allowed = await limiter.check('user-123');
```

## Testing — Zero API Calls

```typescript
import { mockAI, mockChain, mockAgents, mockKnowledge, mockWorkflow, mockDatabase } from '@jamaalbuilds/ai-toolkit/testing';

test('AI pipeline', async () => {
  const ai = mockAI({ texts: ['Generated response'] });
  const db = mockDatabase({ rows: [{ id: 1, content: 'doc' }] });
  const knowledge = mockKnowledge({ searchResults: [{ content: 'relevant', score: 0.9 }] });

  // Use in your code — identical interfaces, zero API calls
  const result = await ai.generate('test');
  expect(result.text).toBe('Generated response');
  expect(ai.generate.callCount).toBe(1);
});
```

All v5 mocks: `mockAI`, `mockChain`, `mockAgents`, `mockKnowledge`, `mockMonitor`, `mockWorkflow`.
Legacy mocks: `mockCache`, `mockLLM`, `mockDb`, `mockDatabase`.

## Config — Environment Validation

No peer deps required.

```typescript
import { initToolkit, parseConfig } from '@jamaalbuilds/ai-toolkit/config';

// Validate all env vars at startup — throws on missing/invalid
const config = initToolkit();
console.log(config.nodeEnv, config.logLevel);

// Or parse manually with a custom schema
const custom = parseConfig(); // uses built-in toolkitConfigSchema
```

## Errors — Typed Error Hierarchy

No peer deps required.

```typescript
import { ToolkitError, LLMError, ValidationError, RateLimitError } from '@jamaalbuilds/ai-toolkit/errors';

try {
  await ai.generate('test');
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log(`Retry after ${err.retryAfter}s`);
  } else if (err instanceof LLMError) {
    console.log(`Provider ${err.provider} failed: ${err.message}`);
  }
}
```

Error types: `ToolkitError`, `LLMError`, `ValidationError`, `RateLimitError`, `AuthError`, `StorageError`, `CacheError`, `ApiClientError`.

## Auth — API Key Validation & RBAC

No peer deps required.

```typescript
import { createApiKeyGuard, requireApiKey, getTenantContext } from '@jamaalbuilds/ai-toolkit/auth';

// Express/Next.js middleware — validates X-API-Key header
const guard = createApiKeyGuard({ apiKey: process.env.API_KEY });

// Or one-shot validation
requireApiKey(request); // throws AuthError if invalid

// Multi-tenant context from headers
const tenant = getTenantContext(request); // { orgId, userId }
```

## Cache — Redis or In-Memory

Peer deps: `yarn add ioredis` (optional — falls back to in-memory)

```typescript
import { createCache } from '@jamaalbuilds/ai-toolkit/cache';

const cache = createCache(); // auto-detects REDIS_URL or uses in-memory

await cache.set('user:123', { name: 'Alice' }, { ttl: 3600 });
const user = await cache.get('user:123');
await cache.invalidate('user:123');
await cache.invalidatePrefix('user:'); // clear all user:* keys
```

## Storage — File Upload with Validation

Peer deps: `yarn add @vercel/blob`

```typescript
import { validateFile, uploadDocument, deleteDocument, listDocuments } from '@jamaalbuilds/ai-toolkit/storage';

// Validate before upload
validateFile(file, { maxSizeBytes: 10_000_000, allowedTypes: ['application/pdf'] });

// Upload to Vercel Blob
const result = await uploadDocument(file, { folder: 'reports' });
console.log(result.url);

// List and delete
const docs = await listDocuments({ prefix: 'reports/' });
await deleteDocument(result.url);
```

## Health — Self-Diagnostics

No peer deps required.

```typescript
import { createHealthCheck } from '@jamaalbuilds/ai-toolkit/health';

const check = createHealthCheck({
  checks: {
    database: async () => { await db.query('SELECT 1'); },
    redis: async () => { await cache.get('__health'); },
  },
});

const report = await check(); // { status: 'healthy', checks: { database: 'ok', redis: 'ok' } }
```

## Data — Shared API Types

No peer deps required. Types only — no runtime code.

```typescript
import type { PaginatedResponse, ErrorResponse, ApiResult } from '@jamaalbuilds/ai-toolkit/data';

function listUsers(): PaginatedResponse<User> {
  return { data: users, total: 100, page: 1, pageSize: 20 };
}
```

## API — HTTP Client with Retry

No peer deps required.

```typescript
import { createApiClient } from '@jamaalbuilds/ai-toolkit/api';

const api = createApiClient({ baseUrl: 'https://api.example.com', retries: 3 });
const users = await api.get('/users');
const created = await api.post('/users', { name: 'Alice' });
```

## MCP — Model Context Protocol Servers

```typescript
import { McpServerBuilder, defineTool, defineResource } from '@jamaalbuilds/ai-toolkit/mcp';

const server = new McpServerBuilder({ name: 'my-tools', version: '1.0.0' });

server.addTool(defineTool({
  name: 'get-weather',
  description: 'Get current weather',
  schema: z.object({ city: z.string() }),
  handler: async ({ city }) => ({ temperature: 72, city }),
}));
```

## Configuration

Set provider via environment variables:

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Groq (free tier available) |
| `OPENROUTER_API_KEY` | OpenRouter (multi-model) |
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic |
| `REDIS_URL` | Redis for cache/rate limiting |
| `DATABASE_URL` | PostgreSQL connection |
| `LANGFUSE_PUBLIC_KEY` | Langfuse monitoring |
| `LANGFUSE_SECRET_KEY` | Langfuse monitoring |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage |

## Architecture

- **Adapter pattern** — every third-party library wrapped behind toolkit's own interface
- **Provider-agnostic** — swap providers by changing env vars, not code
- **Auto-cleanup** — modules with connections register cleanup on process exit
- **Built-in security** — PII detection, audit logging, guardrails, rate limiting
- **Zero config** — sensible defaults, override what you need

## License

MIT

## Part of [ai-toolkit](https://github.com/danilobatson/ai-toolkit)
