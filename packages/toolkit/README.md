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
const toolkit = initToolkit();
// toolkit.config.NODE_ENV, toolkit.config.LOG_LEVEL, etc.

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
| `ai` | Call AI models — generate, stream, structured output | Vercel AI SDK | `ai`, `@ai-sdk/groq`, `@openrouter/ai-sdk-provider`, `openai` (optional), `@anthropic-ai/sdk` (optional) |
| `chain` | Multi-step reasoning — prompt templates, output parsing, RAG | LangChain.js | `@langchain/core`, `@langchain/textsplitters` |
| `agents` | Multi-agent orchestration — routing, state, graphs | LangGraph.js | `@langchain/langgraph` |
| `knowledge` | Document ingestion, chunking, embedding, semantic search | LlamaIndex.js | `@llamaindex/liteparse` |
| `monitor` | Trace LLM calls, evaluate quality, cost tracking | Langfuse | `langfuse` |
| `workflow` | Durable background jobs — cron, retry, pause/resume, HITL | Inngest | `inngest` |
| `database` | Typed queries, vector search, migrations | Drizzle ORM | `drizzle-orm`, `postgres`, `@neondatabase/serverless` (optional) |
| `mcp` | Build MCP servers, define tools & resources | MCP SDK | `@modelcontextprotocol/sdk` |
| `security` | PII detection, audit logging, rate limiting, guardrails | Custom | — |
| `auth` | API key validation, RBAC, multi-tenant context | Custom | — |
| `cache` | Get/set/invalidate with TTL (Redis or in-memory) | Custom | `ioredis` |
| `storage` | File upload with validation | Vercel Blob | `@vercel/blob` |
| `config` | Validate env vars, typed config | Zod | — |
| `errors` | Typed error hierarchy (7 subtypes) | Custom | — |
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
import { prompt, parse, createChain, rag, createSplitter, createLanguageSplitter } from '@jamaalbuilds/ai-toolkit/chain';

// Prompt template
const template = prompt({ template: 'Summarize: {text}', inputVariables: ['text'] });
const filled = await template.format({ text: 'Long document...' });

// Output parsing (JSON, list, regex)
const parser = parse({ schema: z.object({ summary: z.string() }), name: 'summary' });

// RAG pipeline — rag() returns a Chain, then invoke it
const ragChain = rag({
  retriever: myRetriever,
  promptTemplate: 'Answer based on:\n{context}\n\nQuestion: {question}',
  model: (prompt) => ai.generate(prompt).then((r) => r.text),
});
const result = await ragChain.invoke({ question: 'What is the refund policy?' });

// Text splitting
const splitter = createSplitter({ chunkSize: 500, chunkOverlap: 50 });
const chunks = await splitter.split(longDocument);

// Language-aware splitting (TypeScript, Python, Markdown, etc.)
const tsSplitter = createLanguageSplitter('js', { chunkSize: 1000 });
```

## Agents — Multi-Agent Orchestration

```typescript
import { createAgent, createGraph, route } from '@jamaalbuilds/ai-toolkit/agents';

const researcher = createAgent({ name: 'researcher', systemPrompt: 'Research topics' });
const writer = createAgent({ name: 'writer', systemPrompt: 'Write content' });

const graph = await createGraph({
  agents: [researcher, writer],
  edges: [
    { from: '__start__', to: 'researcher' },
    { from: 'researcher', to: 'writer' },
    { from: 'writer', to: '__end__' },
  ],
});

const result = await graph.invoke({ messages: [{ role: 'user', content: 'Write about AI' }] });
```

## Knowledge — Document Ingestion & Search

```typescript
import { createKnowledge, parseDocument, chunk, ingest, search } from '@jamaalbuilds/ai-toolkit/knowledge';

// Parse a document (file path, Buffer, or plain text)
const doc = await parseDocument('./report.pdf');

// Chunk it (async — uses chain splitter when available)
const chunks = await chunk(doc.content, { chunkSize: 512, chunkOverlap: 50 });

// Full pipeline with client
const client = createKnowledge({ store: myStore, embedder: myEmbedFn });
await client.ingest('./report.pdf', { metadata: { source: 'quarterly' } });
const results = await client.search('quarterly revenue', { limit: 5 });

// Standalone operations (without client)
await ingest('./doc.pdf', embedder, store, { metadata: { source: 'manual' } });
const found = await search('revenue', embedder, store, { limit: 10 });
```

## Monitor — Tracing & Cost Tracking

```typescript
import {
  createMonitor, trace, evaluate, getCostReport,
  getTraces, getTrace, onTrace, exportMetrics, createLogger,
} from '@jamaalbuilds/ai-toolkit/monitor';

const monitor = await createMonitor(); // reads LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY from env

// Trace an LLM call — async callback API
const { result, traceId } = await trace(monitor, 'summarize', async (span) => {
  span.update({ input: 'Summarize this', model: 'gpt-4o' });
  const answer = await ai.generate('Summarize this');
  span.update({ output: answer.text, usage: { promptTokens: 100, completionTokens: 50 } });
  return answer;
});

// Evaluate quality (scores sent to Langfuse)
await evaluate(monitor, { traceId, name: 'relevance', value: 0.95, dataType: 'NUMERIC' });

// Cost report (standalone function, not a method)
const report = getCostReport(monitor);

// In-memory trace access (works without Langfuse)
const allTraces = getTraces(monitor);
const single = getTrace(monitor, traceId);
const unsub = onTrace(monitor, (t) => console.log(`${t.name}: ${t.durationMs}ms`));

// OpenTelemetry-compatible metrics export
const metrics = exportMetrics(monitor);

// Structured logger
const logger = createLogger('my-service', { level: 'info' });
logger.info('Pipeline complete', { traceId });
```

## Workflow — Durable Background Jobs

```typescript
import { createWorkflow, defineJob, serve, humanInTheLoop, aiStep } from '@jamaalbuilds/ai-toolkit/workflow';

const workflow = await createWorkflow({ id: 'my-app' });

const emailJob = defineJob(workflow, {
  id: 'send-welcome-email',
  trigger: { event: 'user/signup' },
}, async ({ event, step }) => {
  await step.run('send-email', async () => {
    await sendEmail(event.data.email);
  });

  // Human-in-the-loop approval (pauses workflow until approved)
  const approval = await humanInTheLoop(step, {
    stepId: 'approve',
    event: 'approval/response',
    timeout: '24h',
  });

  // AI-powered step (calls LLM inside a durable step)
  const summary = await aiStep(step, {
    stepId: 'summarize-signup',
    prompt: `Summarize signup for ${event.data.email}`,
  });
});

const handler = await serve({ client: workflow, functions: [emailJob] });
// Export handler.GET, handler.POST, handler.PUT in your API route
```

## Database — Vector Search & Migrations

```typescript
import { createDatabase, vectorSearch, vectorSearchRaw, migrate, getVectorColumn } from '@jamaalbuilds/ai-toolkit/database';

const db = await createDatabase({ connectionString: process.env.DATABASE_URL });

// Vector similarity search (raw SQL — string table/column)
const results = await vectorSearchRaw(db, {
  table: 'documents',
  column: 'embedding',
  queryVector: [0.1, 0.2, 0.3],
  limit: 10,
});

// Raw vector search (untyped — for custom column selection)
const raw = await vectorSearchRaw(db, { table: 'documents', column: 'embedding', queryVector: [0.1, 0.2, 0.3] });

// Get a pgvector column definition for Drizzle schemas
const vectorCol = await getVectorColumn();
// Use in Drizzle schema: vectorCol('embedding', { dimensions: 1536 })

// Run migrations
await migrate({ migrationsFolder: './drizzle' });
```

## Security — PII Detection, Guardrails, Rate Limiting

```typescript
import {
  detectPII, sanitizeForLLM, createGuardrails, checkOutput,
  createRateLimiter, createAuditLogger,
} from '@jamaalbuilds/ai-toolkit/security';
import { createCache } from '@jamaalbuilds/ai-toolkit/cache';

// Detect PII in text
const findings = detectPII('Contact john@example.com or call 555-1234');
// [{ type: 'EMAIL', match: 'john@example.com' }, { type: 'PHONE', match: '555-1234' }]

// Sanitize text before sending to LLM (replaces PII with placeholders)
const safe = sanitizeForLLM('Email john@example.com for details');

// Input guardrails — takes an array of rules with { id, description, test }
const guardrails = createGuardrails([
  { id: 'no-pii', description: 'Block PII in output', test: /\d{3}-\d{2}-\d{4}/ },
]);
const result = guardrails.check('LLM response text'); // synchronous
if (!result.allowed) console.log(result.violations, result.reasons);

// Output guardrails (standalone function)
const outputResult = checkOutput('LLM response', [
  { id: 'no-hedging', description: 'No uncertain language', test: /I think|maybe/i },
]);

// Rate limiting — requires a CacheClient
const cache = createCache();
const limiter = createRateLimiter(cache, { max: 100, windowSeconds: 60 });
const allowed = await limiter.check('user-123');

// Audit logging (structured JSON to stdout)
const audit = createAuditLogger('my-service');
audit.log('query_executed', { userId: 'u_123', resource: 'rag-search' });
```

## Testing — Zero API Calls

```typescript
import { mockAI, mockChain, mockAgents, mockKnowledge, mockWorkflow, mockDatabase } from '@jamaalbuilds/ai-toolkit/testing';

test('AI pipeline', async () => {
  const ai = mockAI({ texts: ['Generated response'] });
  const db = mockDatabase([{ id: 1, content: 'doc' }]);
  const knowledge = mockKnowledge({ searchResults: [{ chunk: { content: 'relevant', metadata: {} }, similarity: 0.9 }] });

  // Use in your code — identical interfaces, zero API calls
  const result = await ai.generate('test');
  expect(result.text).toBe('Generated response');
  expect(ai._tracker.callCount).toBe(1);
});
```

All v5 mocks: `mockAI`, `mockChain`, `mockAgents`, `mockKnowledge`, `mockMonitor`, `mockWorkflow`.
Legacy mocks: `mockCache`, `mockLLM`, `mockDb`, `mockDatabase`.

## Config — Environment Validation

No peer deps required.

```typescript
import { initToolkit, parseConfig } from '@jamaalbuilds/ai-toolkit/config';

// Validate all env vars at startup — throws on missing/invalid
const toolkit = initToolkit();
console.log(toolkit.config.NODE_ENV, toolkit.config.LOG_LEVEL);

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
import { createApiKeyGuard, requireApiKey, getTenantContext, getOrgId, getUserId } from '@jamaalbuilds/ai-toolkit/auth';

// Express/Next.js middleware — validates X-API-Key header
const guard = createApiKeyGuard(process.env.API_KEY!);

// Or one-shot validation
requireApiKey(request); // throws AuthError if invalid

// Multi-tenant context from headers
const tenant = getTenantContext(request); // { orgId, userId }

// Direct header extraction
const orgId = getOrgId(request);   // reads X-Org-Id header
const userId = getUserId(request); // reads X-User-Id header
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
validateFile(file, { maxSizeMB: 10, allowedTypes: ['application/pdf'] });

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

const report = await check(); // { status: 'healthy', checks: { database: { status: 'pass' }, redis: { status: 'pass' } } }
```

## Data — Shared API Types

No peer deps required. Types only — no runtime code.

```typescript
import type { PaginatedResponse, ErrorResponse, ApiResult } from '@jamaalbuilds/ai-toolkit/data';

function listUsers(): PaginatedResponse<User> {
  return {
    data: users,
    pagination: { total: 100, page: 1, pageSize: 20, totalPages: 5, hasMore: true },
  };
}
```

## API — HTTP Client with Retry

No peer deps required.

```typescript
import { createApiClient } from '@jamaalbuilds/ai-toolkit/api';

const api = createApiClient({ baseUrl: 'https://api.example.com', maxRetries: 3 });
const users = await api.get('/users');
const created = await api.post('/users', { name: 'Alice' });
```

## MCP — Model Context Protocol Servers

```typescript
import { McpServerBuilder } from '@jamaalbuilds/ai-toolkit/mcp';
import { z } from 'zod';

const server = new McpServerBuilder({ name: 'my-tools', version: '1.0.0' });

server.defineTool({
  name: 'get-weather',
  description: 'Get current weather',
  schema: { city: z.string() },
  handler: async ({ city }) => ({ temperature: 72, city }),
});

server.defineResource({
  uri: 'config://settings',
  name: 'App Settings',
  handler: async () => ({ theme: 'dark', language: 'en' }),
});
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
