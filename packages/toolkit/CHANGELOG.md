# Changelog

All notable changes to `@jamaalbuilds/ai-toolkit` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
