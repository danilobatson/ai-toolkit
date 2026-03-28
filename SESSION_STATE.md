# AI Toolkit — Session State
> Last updated: 2026-03-28
> Last session: Fix deferred code quality issues

## Current Phase
Phase 2 — Integration, polish, remaining modules.

## What Was Just Completed

### Session 21: Code Quality Refactoring
1. **ai/ai-client.ts** — extracted `wrapStreamWithCallback` helper, stream method now under 50 lines
2. **database/vector.ts** — extracted `loadDrizzleHelpers` and `getDistanceExpression`, vectorSearch reduced from 117 to ~50 lines
3. **monitor/monitor.ts** — extracted `recordTraceCost`, `scoreLangfuse`, `addToBucket` helpers; trace reduced from 88 to ~40 lines, getCostReport from 66 to ~45 lines
4. **agents/types.ts** — replaced `z.record(z.unknown())` with proper `GraphAgentNodeSchema` and `GraphEdgeSchema`; removed duplicate manual validation in agents.ts
5. **database/database.ts** — `defaultDriver()` now uses provider param: neon → neon-http, others → postgres-js
6. **workflow/workflow.ts** — `aiStep` accepts optional `pricing` config (`inputCostPerMillionTokens`, `outputCostPerMillionTokens`), defaults to $3/$15

Commits:
- `fe002fb refactor(ai): extract wrapStreamWithCallback to reduce stream method length`
- `43723b9 refactor(database): extract vectorSearch helpers to reduce function length`
- `e5802ac refactor(monitor): extract trace and cost report helpers to reduce function length`
- `b1d20e6 refactor(agents): tighten Zod schemas with proper shapes, remove duplicate validation`
- `bcee839 fix(database): use provider param in defaultDriver for neon auto-detection`
- `761142d feat(workflow): make aiStep cost estimates configurable via pricing option`

### Session 20: CI & Infrastructure Setup
1. **biome.json** — explicit lint rules: noExplicitAny (error), noUnusedImports (error), useConst (error), noConsole (warn with overrides for monitor/observability/CLI/rate-limiter), organizeImports (on)
2. **CI pipeline** — added bundle size check (du -sh + artifact upload) and license audit (MIT/Apache-2.0/BSD/ISC/0BSD only)
3. **PR template** — `.github/PULL_REQUEST_TEMPLATE.md` with quality checklist (tests, no any, JSDoc, no raw Error, etc.)
4. **CONTRIBUTING.md** — full contributor guide: setup, dev commands, coding standards, test framework, commit conventions, PR process, Claude Code skills reference
5. **SECURITY.md** — vulnerability reporting process, supported versions, security features documentation
6. **LICENSE** — MIT license file (was missing from repo root)
7. **Peer dep docs** — documented version strategy in CLAUDE.md (exact pins for wrapped libs, >= for user-installed libs)

Commits:
- `28d04ae chore(lint): add biome.json with explicit lint rules`
- `85084a1 ci: add bundle size check and license audit to CI pipeline`
- `91115e2 chore(github): add pull request template with quality checklist`
- `b9e9fc4 docs: add CONTRIBUTING.md with setup, standards, and PR process`
- `d685d41 docs: add SECURITY.md with vulnerability reporting and security features`
- `d3d1956 chore: add MIT LICENSE file`
- `d742499 docs(toolkit): document peer dep version strategy (exact pins vs >= ranges)`

## What's Next (Exact Next Step)

Phase 2 continues:
- mcp module update (add MCP client support)
- realtime module (Pusher / SSE wrapper)
- api module rewrite (GraphQL Yoga + tRPC)
- database module enhancements (migrations CLI)
- Cross-module integration tests
- Documentation site (Fumadocs)

## Blockers / Issues Found
- None

## Test Baseline
- Total tests: 588 passing, 0 todo (30 test files)
- Build: PASS (typecheck clean)
- Lint: PASS (biome clean with biome.json, 91 files checked)
- Semantic checks: 5/5 passing

## Module Status
| Module | Status | Tests | Notes |
|---|---|---|---|
| **agents** | ✅ Working (v5) | 39 | createAgent, createGraph, route — reducer fixed |
| **workflow** | ✅ Working (v5) | 38 | createWorkflow, defineJob, humanInTheLoop, aiStep, serve |
| **knowledge** | ✅ Working (v5) | 68 | parseDocument, chunk, ingest, search, createKnowledge |
| **chain** | ✅ Working (v5) | 84 | prompt, parse, createChain, rag, createSplitter, createLanguageSplitter |
| **monitor** | ✅ Working (v5) | 40 | createMonitor (async), trace, evaluate, getCostReport, createLogger |
| **database** | ✅ Working (v5) | 52 | createDatabase, vectorSearch, migrate + SQL injection prevention |
| **ai** | ✅ Working (v5) | 32 | createAI, generate, stream, structured, fallback + legacy createLLM |
| **security** | ✅ Working (v5) | 51 | rate limiter, audit logger, PII, guardrails |
| config | ✅ Working | 7 | All exports covered |
| errors | ✅ Working | 17 | All error classes covered |
| health | ✅ Working | 4 | All scenarios covered |
| testing | ✅ Working | 76 | mockCache, mockLLM, mockDb, mockDatabase + v5: mockAI, mockMonitor, mockKnowledge, mockChain, mockWorkflow, mockAgents |
| mcp | ✅ Working | 16 | defineTool, defineResource, readResource, test harness |
| auth | ✅ Working | 17 | Timing-safe comparison, createApiKeyGuard |
| cache | ✅ Working | 20 | MemoryCacheAdapter + RedisCacheAdapter |
| storage | ✅ Working | 20 | validateFile, uploadDocument, deleteDocument, listDocuments |
| **internal** | ✅ New | — | builtInSplit shared utility |
| api | ❌ Untested | 0 | HTTP client with retry |
| observability | 🔄 Deprecated | 0 | Re-exports from monitor/ |
| data | ✅ Types only | 0 | No runtime code |
| __verification__ | ✅ Working | 5 | All semantic checks pass |

## Infrastructure Status
| Item | Status |
|---|---|
| biome.json | ✅ Explicit rules configured |
| CI (ci.yml) | ✅ typecheck, lint, test:coverage, semantic-checks, build, bundle size, license audit |
| CI (codeql.yml) | ✅ Security scanning on PRs to main |
| CI (scheduled.yml) | ✅ Nightly test + build |
| PR template | ✅ Quality checklist |
| CONTRIBUTING.md | ✅ Full contributor guide |
| SECURITY.md | ✅ Vulnerability reporting + features |
| LICENSE | ✅ MIT |
| Renovate | ✅ Pin strategy, weekly schedule |
| Husky hooks | ✅ pre-commit (lint-staged), pre-push (test + build) |

## Published Versions
| Package | Version | Date |
|---|---|---|
| @jamaalbuilds/ai-toolkit | 0.1.0 | 2026-03-28 |

## Spikes Completed
| Library | Version | Decision | Module |
|---|---|---|---|
| ai (Vercel AI SDK) | 6.0.141 | ✅ USE | ai |
| @ai-sdk/groq | 3.0.31 | ✅ USE | ai |
| @openrouter/ai-sdk-provider | 2.3.3 | ✅ USE | ai |
| drizzle-orm | 0.45.2 | ✅ USE | database |
| langfuse | 3.38.6 | ✅ USE | monitor |
| inngest | 4.1.0 | ✅ USE (peer dep) | workflow |
| @langchain/core | 1.1.36 | ✅ USE | chain |
| @langchain/textsplitters | 1.0.1 | ✅ USE | chain |
| @langchain/langgraph | 1.2.6 | ✅ USE (peer dep) | agents |
| @llamaindex/liteparse | 1.4.0 | ✅ USE | knowledge |

## ADRs
- ADR-001 through ADR-008 (see docs/adrs/)

## Key Decisions
- @vitest/coverage-v8 must match vitest version exactly (3.2.4), not latest (4.1.2)
- createMonitor() is now async — breaking change from sync in session 13
- builtInSplit extracted to internal/split.ts — shared by chain and knowledge modules
- Variable indirection pattern for optional peer dep imports (prevents TS resolution in CI)
- CallTracker pattern for v5 mocks: shared tracker with callCount/lastArgs/allArgs
- ESM-only package — no CJS require() support, use import syntax
- Peer dep strategy: exact pins for wrapped libs, >= for user-installed libs
