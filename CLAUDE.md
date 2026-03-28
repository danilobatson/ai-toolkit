# AI Toolkit — Claude Code Context

## What This Is

@jamaalbuilds/ai-toolkit is a unified AI development toolkit for TypeScript.
It wraps LangChain.js, LangGraph.js, LlamaIndex.js, Langfuse, Inngest, MCP SDK,
and other AI tools behind a consistent, beginner-friendly API with clear naming.

One import. Clear names. Consistent API. Provider-agnostic. Auto-cleanup. Built-in security.

## Monorepo Structure

```
ai-toolkit/
├── packages/
│   ├── toolkit/          — @jamaalbuilds/ai-toolkit (npm package)
│   ├── toolkit-python/   — DEPRECATED — removing in v5
│   └── cli/              — @jamaalbuilds/aitk (npm CLI)
├── docs/                 — Fumadocs documentation site (to be added)
├── scripts/              — Build and test scripts
├── turbo.json            — Turborepo config
└── package.json          — Root workspace (yarn workspaces)
```

## Package Manager

**ALWAYS use yarn. Never npm.**

## Module Naming Convention (v5)

These are the PUBLIC names developers import. Map them to the underlying libraries:

| Import Name | Wraps                    | What It Does                                               |
| ----------- | ------------------------ | ---------------------------------------------------------- |
| `ai`        | Vercel AI SDK            | Call AI models — generate, stream, structured output       |
| `chain`     | LangChain.js             | Multi-step AI reasoning — prompt templates, output parsing |
| `agents`    | LangGraph.js             | Multi-agent orchestration — AI routing, state, HITL        |
| `knowledge` | LlamaIndex.js + pgvector | Document ingestion, chunking, embedding, semantic search   |
| `monitor`   | Langfuse                 | Trace every LLM call, evaluate quality, cost tracking      |
| `workflow`  | Inngest                  | Durable background jobs — cron, retry, pause/resume        |
| `mcp`       | MCP SDK                  | Build MCP servers, connect MCP clients                     |
| `security`  | Custom                   | PII detection, audit logging, RBAC, guardrails             |
| `database`  | Drizzle ORM + pgvector   | Typed queries, vector search, migrations                   |
| `api`       | GraphQL Yoga + tRPC      | Type-safe APIs with subscriptions                          |
| `realtime`  | Pusher / SSE             | Subscribe, broadcast, auto-cleanup (planned v2)            |
| `auth`      | NextAuth.js / Clerk      | Sessions, RBAC, API keys, multi-tenant                     |
| `storage`   | Vercel Blob / S3         | File upload with validation                                |
| `cache`     | Redis / in-memory        | Get/set/invalidate with TTL                                |
| `config`    | Zod                      | Validate env vars, typed config                            |
| `errors`    | Custom                   | Typed errors, retry logic                                  |
| `health`    | Custom                   | Self-diagnostics, per-service status                       |
| `testing`   | Custom                   | Mock AI, MCP, DB, workflows — zero API calls               |
| `data`      | —                        | Shared API types (PaginatedResponse, ErrorResponse)        |
| `observability` | Re-exports from monitor | Deprecated — use `monitor` instead                     |

## Architecture Rules

1. **Adapter pattern** — every third-party library wrapped behind toolkit's own interface.
   Never expose raw LangChain/LlamaIndex/etc APIs to the developer.
   If the underlying library changes, only the adapter file changes.

2. **Every export has JSDoc** with @example block.

3. **Every export validates inputs** — Zod schema or type guard. No unchecked parameters.

4. **Errors are always ToolkitError** — never raw `throw new Error()`.
   Catch underlying library errors → wrap in ToolkitError with context.

5. **Modules with subscriptions/connections MUST register cleanup** on process exit.
   Use the cleanup manager (to be built) for automatic disposal.

6. **No hardcoded provider URLs** — use config.getProviderUrl().

7. **No process.exit** in library code — throw ToolkitError instead.

8. **No `any`** in public API. Use `unknown` + type guards if type is truly unknown.

9. **No `^` in dependency versions** — pin exact versions for stability.
   **Peer dep strategy:** Libraries we wrap directly get exact pins (tested version).
   Libraries users likely already have (`ioredis`, `openai`, `@vercel/blob`, etc.)
   use `>=` minimum — we only need a minimum API surface and must not force downgrades.

10. **Tests use mock providers** — zero external API calls in tests.

11. **Same commit** — implementation and tests always in the same commit.

## Git Rules
- NEVER add Co-Authored-By trailers to commits. NEVER.
- Do not use --trailer flag
- Do not append any lines after the commit message
- Commit command: git commit -m "message" (nothing else)
- Use conventional commits: type(scope): description

## Testing Rules

8-level test framework:

1. CRASH — doesn't throw on valid input
2. BEHAVIOR — correct output on happy path
3. DATA QUALITY — output types and values correct
4. ENVIRONMENT — invalid/missing/null inputs handled
5. PATTERN — matches conventions across modules
6. CONTRACT — API contract honored
7. PROVIDER FALLBACK — graceful degradation when primary fails
8. CLEANUP — resources released properly

Additional rules:
- `toThrow()` MUST use regex, never exact string
- `vi.useFakeTimers()` MUST be paired with try/finally
- No `readFileSync` on production source files in tests
- Loop tests MUST cover the failure path

## File Conventions

- Source: `packages/toolkit/src/[module]/index.ts`
- Implementation: `packages/toolkit/src/[module]/[feature].ts`
- Adapters: `packages/toolkit/src/[module]/adapters/[provider].ts`
- Types: `packages/toolkit/src/[module]/types.ts`
- Tests: `packages/toolkit/src/[module]/__tests__/[feature].test.ts`
- Semantic checks: `packages/toolkit/src/__verification__/toolkit-agent.test.ts`

## Commands

```bash
yarn test              # run all tests
yarn build             # compile TypeScript
yarn lint              # biome check
yarn typecheck         # tsc --noEmit
yarn test:semantic     # run toolkit-agent semantic checks
```

## Current State (v4 → v5 Migration)

### What EXISTS and works:
- config/ — Zod schema validation, initToolkit()
- errors/ — ToolkitError, typed error classes
- llm/ — multi-provider LLM client (needs Vercel AI SDK update)
- mcp/ — server builder with Zod schemas (keep, update)
- storage/ — Vercel Blob wrapper (keep)
- neon/ — Neon-specific DB module (replace with generic database/)
- auth/ — API key validation, RBAC (keep, update)
- observability/ — logger (add Langfuse)
- security/ — rate limiter (add PII detection, audit guard, guardrails)
- cache/ — Redis + in-memory (keep)
- api/ — HTTP client (replace with GraphQL Yoga + tRPC)
- health/ — health check (keep, enhance with recommendations)
- data/ — API types (keep)
- testing/ — mocks (keep, expand)

### What needs to be ADDED (v5 new modules):
- chain/ — LangChain.js wrapper
- agents/ — LangGraph.js wrapper
- knowledge/ — LlamaIndex.js + pgvector wrapper
- database/ — Drizzle + pgvector (replaces neon/)
- realtime/ — Pusher / SSE wrapper
- api/ — GraphQL Yoga + tRPC (replaces HTTP client)
- monitor/ — Langfuse wrapper (absorbs observability/langfuse)

### What needs to be REMOVED:
- packages/toolkit-python/ — entire directory (v5 is TypeScript-only)
- packages/toolkit/src/neon/ — replaced by database/ module

## Development Workflow

### Before writing ANY new module:
1. Run discovery prompt (see project docs)
2. Read the underlying library's docs
3. Read the nearest sibling module for patterns
4. grep for existing helpers — never re-implement

### Implementation order (per exported function):
1. JSDoc with @example
2. Input validation (Zod or type guard)
3. Provider selection (from config)
4. Core logic (wrapping underlying library)
5. Error handling (catch → ToolkitError)
6. Cleanup registration (if applicable)
7. Observability hook (Langfuse trace if monitor enabled)

### After each function:
- yarn test --run — green
- yarn typecheck — clean
- yarn lint — clean
- Commit: feat(module): description

## CI Pipeline

```
Pre-commit: biome lint + tsc --noEmit
Pre-push: yarn test --run + yarn build + semantic checks
GitHub Actions: all above + coverage + Semgrep + bundle size + license check
```

## Key Decisions

- TypeScript only (no Python) — see ADR-002
- Pinned dependencies (no ^) — see future-proofing section in spec
- Adapter pattern for all third-party wraps
- Fumadocs for documentation (Next.js based, Vercel deployed)
- Groq + OpenRouter for free AI in demos
- Neon for default database (supports Supabase, AWS RDS, local Docker too)
- GraphQL preferred over REST. MCP preferred over both.
- Renovate for dependency monitoring

## Commit Rules
- Use conventional commits: type(scope): description
- NEVER include Co-Authored-By trailers in commits
- ONE concern per commit — never bundle unrelated changes
- Tests ship in the same commit as the implementation they cover
