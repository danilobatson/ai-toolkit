# ADR-009: Optional Peer Dependency Pattern

## Status
Accepted

## Date
2026-09-04

## Context
Every module that wraps a third-party library (`ai`, `chain`, `agents`, `knowledge`, `monitor`, `workflow`, `mcp`, `database`, `cache`, `storage`) treats that library as an optional peer dependency: installable only if the consumer actually uses the module. How the peer is loaded, versioned, and handled when missing was worked out independently in each module as it was built, then fixed piecemeal by #3 (dynamic import via variable indirection, replacing four bare `require()` calls) and #4 (preserving the underlying load error as `cause` on the thrown `ToolkitError`). The rule was never written down in one place, and `CLAUDE.md` and `docs/CODING_PROCESS_AND_STANDARDS.md` disagreed on the pin policy.

## Decision
Three rules, applied uniformly across every module that loads an optional peer:

1. **Dynamic import, never a literal specifier.** Every `await import(...)` in non-test source passes a variable or property — a local `const` (e.g. `moduleName` in `workflow/workflow.ts`), a module-level constant (`POSTGRES_PATH` and siblings in `database/database.ts`, `database/migrate.ts`, `database/vector.ts`), or a table property (`entry.importPath` in `ai/provider.ts`). Never `await import("some-package")` with the string inline. This is universal, not partial — currently 32 call sites across 15 non-test source files under `packages/toolkit/src` (46 across 23 files repo-wide, including tests). It stops TypeScript from resolving the optional peer at compile time, so the package doesn't need to be installed for `tsc` to succeed.

   The rule isn't peers-only: `knowledge/operations.ts` uses it to lazy-load the toolkit's own `chain/splitter.js`, and `knowledge/parser.ts` uses it for `node:fs/promises`. Same mechanism, applied to internal lazy-loading, not just external peers.

2. **The pin policy.** `packages/toolkit/package.json` declares each peer as either an exact pin (libraries the toolkit wraps directly and tests against — `@langchain/langgraph`, `drizzle-orm`, `ai`, `langfuse`, etc.) or a `>=` minimum (libraries the consumer likely already has for their own reasons — `ioredis`, `openai`, `@vercel/blob`, `postgres`, `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`, `@neondatabase/serverless`). Exact pins guarantee the adapter was tested against that version; `>=` minimums mean the toolkit only needs a minimum API surface and must not force downgrades.

3. **What runs when a peer is absent.** Two behaviors, chosen per module:
   - **Fallback**: `chain/splitter.ts` and `knowledge/operations.ts` degrade to the zero-dependency `internal/split.ts`. The loaders (`tryLoadLangChainSplitter`, `tryLoadLangChainLanguageSplitter` in `chain/splitter.ts`; `tryLoadChainSplitter` in `knowledge/operations.ts`) return `null` on a failed import instead of throwing, and the callers use that `null` to route to `builtInSplit()`.
   - **Throw**: every other module throws a `ToolkitError` (or subclass) with an install command in the message (e.g. `"inngest is required for the workflow module. Install it with: yarn add inngest"`) and the original import error preserved as `cause`, so the underlying reason (syntax error, version mismatch, etc.) isn't lost even though the message is generic.

## Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| **Dynamic import with indirection** (chosen) | Peer stays optional at compile time; consumers who don't use a module never need it installed | Defeats static analysis of the import target; requires the loader/fallback split documented above |
| **Static `import` at the top of the file** | Simple, fully typechecked, tree-shakeable | Forces every consumer to install every peer, even for modules they never use — breaks the "install only what you use" model |
| **`require()` at call time** | Also defers loading | CJS-only; the toolkit is ESM-only (see `overview.mdx`), and this was the exact pattern #3 replaced |
| **Uniform `>=` for all peers** | One rule, simpler `docs/CODING_PROCESS_AND_STANDARDS.md` | Loses the guarantee that libraries the toolkit wraps directly (and tests against) work as tested; a consumer's transitive minimum could resolve to an untested version |

## Consequences
**Positive:**
- A consumer using only `ai` never needs `@langchain/langgraph`, `inngest`, or any other peer installed — `tsc` and `yarn add` both stay minimal.
- The `cause` chain on every "missing dependency" error means a version mismatch or a broken install surfaces its real error, not just the toolkit's generic message.
- The pin policy is now stated once and consistently between `CLAUDE.md` and `docs/CODING_PROCESS_AND_STANDARDS.md` — `package.json` was already correct, only the docs disagreed.

**Negative:**
- The error *codes* for a missing peer aren't consistent (`LLM_MISSING_DEPENDENCY`, `DATABASE_MISSING_DEPENDENCY`, `CACHE_MISSING_DEPENDENCY` vs. `WORKFLOW_IMPORT_FAILED`, `AGENTS_IMPORT_FAILED`). This ADR fixes the loading/versioning rule, not the naming inconsistency — tracked separately in #4's follow-up.
- Dynamic import via indirection means a typo in a module-constant path fails at runtime, not compile time — the tradeoff for keeping the peer optional.
