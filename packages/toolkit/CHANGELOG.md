# Changelog

All notable changes to `@jamaalbuilds/ai-toolkit` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-03-28

### Fixed
- README: 4 code examples that wouldn't compile (chain `await`, knowledge params, testing mock API, monitor trace)
- README: MCP section used nonexistent standalone `defineTool`/`defineResource` imports
- README: Security section had wrong method signatures (`createGuardrails` params, sync `.check()`, `createRateLimiter` args)
- LLMS.md: 7 wrong function signatures (MCP, Security, Knowledge)
- CLAUDE.md: module table missing `data`/`observability`, listed nonexistent `realtime` without annotation
- Root barrel missing v5 mock exports (`mockAI`, `mockChain`, `mockAgents`, `mockKnowledge`, `mockMonitor`, `mockWorkflow`)
- Root barrel missing monitor exports (`exportMetrics`, `getTraces`, `getTrace`, `onTrace`) and types
- 12 silent-pass database tests now use `expect.assertions()`

### Added
- api module: 23 tests (was zero coverage) — HTTP methods, retry, error wrapping, rate limit detection
- health module: 3 new edge case tests
- workflow/serve: happy-path test
- `@example` JSDoc on 10 previously undocumented exports
- README: 25+ previously undocumented exports now documented (monitor, security, database, auth, chain, workflow)

## [0.2.0] - 2026-03-28

### Added
- monitor: `getTraces()`, `getTrace()`, `onTrace()`, `exportMetrics()` — self-contained observability without Langfuse
- In-memory trace store with configurable max (default 1000, FIFO eviction)
- 7 cross-module integration tests (AI+Security, Knowledge+DB, RAG, Workflow, Agents, Monitor, MCP)
- 34 security penetration tests (PII bypass, SQL injection, guardrail bypass, rate limiter abuse)
- JSDoc `@example` on all 92+ exported types across 9 modules
- SELF_HOSTED.md — Ollama, Langfuse, Postgres, Redis self-hosted deployment guide
- README expanded with per-module sections for all 17 modules
- CONTRIBUTING.md, SECURITY.md, LICENSE
- biome.json with explicit lint rules
- CodeQL security scanning in CI
- Coverage thresholds (60% lines/functions)
- Bundle size tracking in CI
- License audit in CI
- Renovate dependency management
- PR template with quality checklist

### Fixed
- SQL injection prevention in `vectorSearchRaw` (`validateIdentifier`)
- Agent message reducer accumulates instead of overwrites
- Stream rate limit checked before model loading
- Trace IDs use `crypto.randomUUID` (no cold start collisions)
- All `require()` converted to `import()` for ESM consistency
- `mockLLM` throws `LLMError` instead of raw `Error`
- Rate limiter validates cache parameter
- All error messages include `yarn add` not `npm install`

### Changed
- `createAI` factory refactored (140 lines to 25 lines)
- `tokensToday` renamed to `tokensInWindow` (accurate naming)
- `defaultDriver` uses provider param (`neon` to `neon-http`)
- `aiStep` accepts configurable pricing
- Extracted `builtInSplit` to shared `internal/` utility

## [0.1.0] - 2026-03-28

### Added

#### Core Modules (v5)
- **ai** module: Vercel AI SDK wrapper with `createAI`, `generate`, `stream`, `structured`, provider fallback, and cost tracking
- **chain** module: LangChain.js composition with `prompt`, `parse`, `createChain`, `rag`, `createSplitter`, `createLanguageSplitter`
- **agents** module: LangGraph.js multi-agent orchestration with `createAgent`, `createGraph`, `route`, state reducers, HITL
- **knowledge** module: Document ingestion pipeline with `parseDocument`, `chunk`, `ingest`, `search`, `createKnowledge`
- **database** module: Drizzle ORM + pgvector with `createDatabase`, `vectorSearch`, `migrate`, SQL injection prevention
- **monitor** module: Langfuse observability with `createMonitor`, `trace`, `evaluate`, `getCostReport`, `createLogger`
- **workflow** module: Inngest durable jobs with `createWorkflow`, `defineJob`, `humanInTheLoop`, `aiStep`, `serve`
- **security** module: PII detection, sanitization, guardrails, audit logging, rate limiting

#### Existing Modules (carried from v4, updated)
- **config** module: Zod schema validation with `initToolkit`, `parseConfig`
- **errors** module: Typed error hierarchy — `ToolkitError`, `LLMError`, `ValidationError`, `AuthError`, and more
- **mcp** module: MCP server builder with `McpServerBuilder`, `McpTestHarness`, Zod tool schemas
- **auth** module: API key validation with timing-safe comparison, RBAC, multi-tenant context
- **cache** module: Redis + in-memory adapters with TTL, `createCache`
- **storage** module: Vercel Blob wrapper with file validation, upload, delete, list
- **health** module: Self-diagnostics with `createHealthCheck`
- **api** module: HTTP client with retry logic
- **testing** module: Mock factories for all v5 modules — `mockAI`, `mockDatabase`, `mockMonitor`, `mockChain`, `mockKnowledge`, `mockWorkflow`, `mockAgents`, plus legacy `mockLLM`, `mockDb`, `mockCache`

#### Infrastructure
- 8 Architecture Decision Records (ADR-001 through ADR-008)
- CI pipeline: GitHub Actions with typecheck, lint, test, coverage, build, bundle size, license audit
- CodeQL security scanning on PRs
- Nightly scheduled test + build
- Semantic verification checks (5 automated pattern checks)
- Biome linter with explicit rules (noExplicitAny, noUnusedImports, useConst)
- Husky pre-commit and pre-push hooks
- Renovate dependency monitoring (weekly, pinned strategy)
- PR template with quality checklist
- CONTRIBUTING.md, SECURITY.md, LICENSE (MIT)
- LLMS.md for AI-assisted development context

#### Architecture
- Adapter pattern for all third-party library wrappers
- ESM-only package (no CJS)
- All peer dependencies optional — install only what you use
- Exact version pins for wrapped libraries, `>=` ranges for user-installed libraries
- 608 tests across 30 test files, zero external API calls
- Zod input validation on all public exports
- ToolkitError hierarchy — no raw `throw new Error()`
