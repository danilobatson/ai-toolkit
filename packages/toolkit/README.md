# @jamaalbuilds/ai-toolkit

TypeScript SDK for building AI-powered full-stack applications. Provider-agnostic LLM client, MCP server builder, caching, auth, observability, and more.

## Install

```bash
yarn add @jamaalbuilds/ai-toolkit
```

## Modules

Every module is available as a subpath import:

```typescript
import { createCache } from '@jamaalbuilds/ai-toolkit/cache';
import { createLLM } from '@jamaalbuilds/ai-toolkit/llm';
import { getOrgId } from '@jamaalbuilds/ai-toolkit/auth';
import { McpServerBuilder } from '@jamaalbuilds/ai-toolkit/mcp';
```

| Module | What | Peer Deps |
|--------|------|-----------|
| `config/` | Zod env validation, `initToolkit()` | — |
| `errors/` | Typed error hierarchy (7 subtypes) | — |
| `cache/` | Redis + in-memory cache | `ioredis` |
| `api/` | Typed HTTP client with retry | — |
| `data/` | Shared API types (PaginatedResponse, ErrorResponse) | — |
| `auth/` | Multi-tenant auth middleware, NestJS guard | — |
| `security/` | Rate limiter (Redis-backed), audit logger (JSON) | — |
| `llm/` | Anthropic + OpenAI, auto-detect from env | `@anthropic-ai/sdk`, `openai` |
| `mcp/` | MCP server builder + test harness | `@modelcontextprotocol/sdk` |
| `storage/` | Vercel Blob upload/delete/list + validation | `@vercel/blob` |
| `neon/` | Serverless Postgres + `withTenant()` helper | `@neondatabase/serverless` |
| `observability/` | Langfuse tracing, structured logger | `langfuse` |
| `health/` | Health check endpoint factory (healthy/degraded/unhealthy) | — |
| `testing/` | Mock factories: mockCache, mockLLM, mockDb | — |

All peer dependencies are optional — install only what you use.

## Quick Start

```typescript
import { initToolkit, createCache, createLLM } from '@jamaalbuilds/ai-toolkit';

// Validate env vars at startup
const config = initToolkit();

// Auto-detects Redis vs in-memory
const cache = createCache();

// Auto-detects Anthropic vs OpenAI from env vars
const llm = createLLM();
const response = await llm.complete('Summarize this document.', {
  system: 'You are a helpful assistant.',
});
console.log(response.content);
```

## Auth

```typescript
import { getOrgId, createApiKeyGuard } from '@jamaalbuilds/ai-toolkit/auth';

// Next.js API route
export async function GET(request: Request) {
  const orgId = getOrgId(request); // throws 401 if X-Org-Id missing
  return Response.json(await getDocuments(orgId));
}

// NestJS guard
const ApiKeyGuard = createApiKeyGuard(process.env.API_KEY!);
@UseGuards(ApiKeyGuard)
```

## Health Checks

```typescript
import { createHealthCheck } from '@jamaalbuilds/ai-toolkit/health';

const check = createHealthCheck({
  checks: {
    database: async () => { await db.query('SELECT 1'); },
    cache: async () => { await cache.set('health', 'ok', { ttl: 10 }); },
  },
  timeoutMs: 3000,
});

export async function GET() {
  const report = await check();
  // report.status: 'healthy' | 'degraded' | 'unhealthy'
  return Response.json(report, { status: report.status === 'healthy' ? 200 : 503 });
}
```

## Testing

```typescript
import { mockCache, mockLLM, mockDb } from '@jamaalbuilds/ai-toolkit/testing';

test('processes query', async () => {
  const cache = mockCache();
  const llm = mockLLM({ responses: ['Metformin is recommended.'] });
  const db = mockDb([{ id: 1, content: 'Metformin treats diabetes.' }]);

  const result = await processQuery('treatment', { cache, llm, db });
  expect(result).toContain('Metformin');
  expect(llm._callCount).toBe(1);
});
```

## Part of [ai-toolkit](https://github.com/danilobatson/ai-toolkit)

MIT License
