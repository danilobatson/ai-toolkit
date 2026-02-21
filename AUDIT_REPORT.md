# AI Toolkit -- Audit Report
**Generated:** 2026-02-21T22:30:00Z
**Commit:** 1443df745ad3fc3831efe9adac60fb943b8921df

## Summary
- TypeScript SDK: 15/15 tests passed (4 required corrected test scripts — see details)
- Python SDK: 13/14 tests passed
- CLI: PASS
- Total issues found: 12

## Section 1: Repository Structure

| File / Directory | Status | Notes |
|------------------|--------|-------|
| `package.json` (root) | **EXISTS** | Contains `workspaces`: `["packages/toolkit", "packages/cli"]` |
| `tsconfig.base.json` | **EXISTS** | |
| `turbo.json` | **EXISTS** | |
| `yarn.lock` | **EXISTS** | |
| `CLAUDE.md` | **EXISTS** | Comprehensive project docs (in `.gitignore`) |
| `.gitignore` | **EXISTS** | |
| `packages/toolkit/package.json` | **EXISTS** | |
| `packages/toolkit/tsconfig.json` | **EXISTS** | |
| `packages/toolkit-python/pyproject.toml` | **EXISTS** | |
| `packages/cli/package.json` | **EXISTS** | |
| `packages/cli/tsconfig.json` | **EXISTS** | |
| `.github/workflows/` | **EXISTS** | **EMPTY** — no CI/CD workflow files |
| `docs/adrs/` | **EXISTS** | **EMPTY** — no Architecture Decision Records |

**Result:** All 13 expected files/dirs exist. Two directories are empty placeholders.

## Section 2: TypeScript Build

### `npx tsc --noEmit` (type-check only)
- **Exit code:** 0
- **Errors:** None

### `npx tsc` (full build with emit)
- **Exit code:** 0
- **Errors:** None
- **dist/ output:** 15 module directories + root barrel, each with `.js`, `.js.map`, `.d.ts`, `.d.ts.map`

**Result: PASS** — clean build, zero errors.

## Section 3: Package.json Audit

### Identity
| Field | Value |
|-------|-------|
| `name` | `@jamaalbuilds/ai-toolkit` |
| `version` | `0.1.0` |

### Exports Map (15 entries)

| Export Key | `dist/*/index.js` | `dist/*/index.d.ts` |
|------------|:-:|:-:|
| `"."` (root) | FOUND | FOUND |
| `"./config"` | FOUND | FOUND |
| `"./errors"` | FOUND | FOUND |
| `"./llm"` | FOUND | FOUND |
| `"./mcp"` | FOUND | FOUND |
| `"./storage"` | FOUND | FOUND |
| `"./neon"` | FOUND | FOUND |
| `"./auth"` | FOUND | FOUND |
| `"./observability"` | FOUND | FOUND |
| `"./security"` | FOUND | FOUND |
| `"./data"` | FOUND | FOUND |
| `"./cache"` | FOUND | FOUND |
| `"./api"` | FOUND | FOUND |
| `"./health"` | FOUND | FOUND |
| `"./testing"` | FOUND | FOUND |

**Result:** 15/15 exports resolved — 30/30 dist files present.

### Peer Dependencies

| Package | Version Range |
|---------|---------------|
| `@anthropic-ai/sdk` | `>=0.30.0` |
| `@modelcontextprotocol/sdk` | `>=1.0.0` |
| `@vercel/blob` | `>=0.20.0` |
| `@neondatabase/serverless` | `>=0.9.0` |
| `ioredis` | `>=5.0.0` |
| `langfuse` | `>=3.0.0` |

### Peer Dependencies Meta
All 6 peer dependencies are marked `{ "optional": true }` in `peerDependenciesMeta`. 1:1 correspondence confirmed.

## Section 4: TypeScript Module Audit

### Summary Table

| Module | Files | Total Lines | index.ts Exports | Stubs | TODOs |
|--------|------:|------------:|-----------------:|:-----:|:-----:|
| api | 2 | 237 | 1 | 0 | 0 |
| auth | 2 | 147 | 2 | 0 | 0 |
| cache | 2 | 199 | 1 | 0 | 0 |
| config | 3 | 136 | 2 | 0 | 0 |
| data | 2 | 48 | 1 | 0 | 0 |
| errors | 3 | 234 | 2 | 0 | 0 |
| health | 2 | 107 | 2 | 0 | 0 |
| llm | 2 | 228 | 2 | 0 | **1** |
| mcp | 2 | 340 | 1 | 0 | 0 |
| neon | 2 | 123 | 2 | 0 | 0 |
| observability | 2 | 121 | 2 | 0 | 0 |
| security | 2 | 140 | 2 | 0 | 0 |
| storage | 2 | 202 | 2 | 0 | 0 |
| testing | 2 | 167 | 2 | 0 | 0 |
| **Root** | 1 | 71 | 25 | 0 | 0 |
| **TOTALS** | **31** | **2,500** | — | **0** | **1** |

### Stubs
None found. All 15 modules contain real implementations.

### TODOs
| File | Line | Content |
|------|-----:|---------|
| `src/llm/client.ts` | 142 | `cost: 0, // TODO: pricing registry` |

## Section 5: TypeScript Functional Tests

| Test | Name | Status | Details |
|------|------|--------|---------|
| 5.1 | config | **PASS** | `parseConfig({})` returns correct defaults: `CACHE_DEFAULT_TTL=300`, `NODE_ENV='development'`, `LOG_LEVEL='info'` |
| 5.2 | errors | **PASS** | All 7 error classes instantiate. `ToolkitError` has `.code`/`.statusCode`. `LLMError` has `.provider`. `RateLimitError` has `.retryable=true`, `.statusCode=429`. |
| 5.3 | cache | **PASS** | `createCache()` memory adapter: `set/get/invalidate/invalidatePrefix` all work correctly |
| 5.4 | auth | **PASS*** | All functions work. *Note: test script had wrong API — `requireApiKey(key)` should be `requireApiKey(request, key)`. `createApiKeyGuard` takes a string, not `{keys:[]}`. Code itself is correct. |
| 5.5 | security | **PASS*** | Rate limiter works correctly. *Note: test script used wrong config keys — `maxRequests`/`windowMs` should be `max`/`windowSeconds`. Code itself is correct. |
| 5.6 | observability | **PASS** | Human and JSON logger modes work. `initLangfuse()` returns `null` without env keys. |
| 5.7 | health | **PASS*** | All 4 scenarios work (healthy/degraded/unhealthy/timeout). *Note: test script had wrong API — `createHealthCheck({db: fn})` should be `createHealthCheck({checks: {db: fn}})`, and returns a function (not object with `.check()`). Code itself is correct. |
| 5.8 | storage | **PASS** | `validateFile` enforces size limits (`STORAGE_FILE_TOO_LARGE`), type restrictions (`STORAGE_INVALID_TYPE`), and custom options |
| 5.9 | llm | **PASS** | `createLLM()` throws with `code: 'LLM_NO_KEY'` when no API keys configured |
| 5.10 | testing | **PASS*** | All mocks work (mockCache, mockLLM, mockDb). *Note: test script had wrong API — `mockDb({rows: [...]})` should be `mockDb([...])`, and `failOnCall` is 0-indexed. Code itself is correct. |
| 5.11 | api | **PASS** | `createApiClient({baseUrl: '...'})` returns truthy client |
| 5.12 | data | **PASS** | Module loads without errors |
| 5.13 | mcp | **PASS** | `McpServerBuilder` is exported and defined |
| 5.14 | neon | **PASS** | `createDb()` throws error matching `/DATABASE_URL/` |
| 5.15 | root barrel | **PASS** | All 32 expected exports verified as `function` or `object` |

**Result: 15/15 PASS** (4 tests required corrected test scripts — API signature mismatches in the original test design, not code bugs)

### API Mismatches Found in Test Design

| Test | Test Used | Actual API |
|------|-----------|------------|
| 5.4 | `requireApiKey(keyString)` | `requireApiKey(request, expectedKey?)` — first arg is request object |
| 5.4 | `createApiKeyGuard({keys: ['k']})` | `createApiKeyGuard(keyString)` — takes a single string |
| 5.5 | `{maxRequests: 2, windowMs: 60000}` | `{max: 2, windowSeconds: 60}` — different key names |
| 5.5 | `createAuditLogger()` | `createAuditLogger(serviceName)` — requires service name string |
| 5.5 | `logger.log({action, orgId})` | `logger.log(action, {orgId})` — action is first arg, not in object |
| 5.7 | `createHealthCheck({db: fn, cache: fn})` | `createHealthCheck({checks: {db: fn, cache: fn}})` — checks nested under `checks` key |
| 5.7 | `hc.check()` | `hc()` — returns a function directly, no `.check()` method |
| 5.7 | Check functions return `true` | Check functions should return `void` (throw on failure) |
| 5.10 | `mockDb({rows: [...]})` | `mockDb([...])` — takes array directly, not wrapped object |
| 5.10 | `failOnCall: 1` (1-indexed) | `failOnCall: 0` (0-indexed) |

## Section 6: Python Module Audit

### Summary Table

| Module | Files | Total Lines | Stubs | TODOs |
|--------|------:|------------:|:-----:|:-----:|
| auth | 2 | 105 | 0 | 0 |
| cache | 2 | 78 | 0 | 0 |
| config | 3 | 90 | 0 | 0 |
| data | 1 | 1 | **YES** | 0 |
| errors | 3 | 145 | 0 | 0 |
| evaluation | 2 | 346 | 0 | 0 |
| guardrails | 2 | 654 | 0 | 0 |
| health | 1 | 1 | **YES** | 0 |
| ingestion | 4 | 854 | 0 | 0 |
| llm | 6 | 2,149 | 0 | 0 |
| observability | 2 | 141 | 0 | 0 |
| security | 2 | 193 | 0 | 0 |
| testing | 1 | 1 | **YES** | 0 |
| workflow | 2 | 261 | 0 | 0 |
| **Root** | 1 | 3 | — | 0 |
| **TOTALS** | **34** | **5,022** | **3** | **0** |

### Stub Modules

| Module | Content |
|--------|---------|
| `data/` | `"""ai_toolkit.data -- Implemented when first project needs it."""` |
| `health/` | `"""ai_toolkit.health -- Implemented when first project needs it."""` |
| `testing/` | `"""ai_toolkit.testing -- Implemented when first project needs it."""` |

### TODOs
None found across all 34 `.py` files.

### Key Observations
- `llm/` accounts for 42.8% of all Python code (2,149 of 5,022 lines)
- All 11 implemented modules have proper `__all__` exports
- Root `__init__.py` only exports `__version__`, no re-exports (by design)
- 3 stubs match TS SDK modules that ARE implemented (data, health, testing)

## Section 7: Python Functional Tests

| Test | Name | Status | Details |
|------|------|--------|---------|
| 7.1 | root | **PASS** | `__version__ == '0.1.0'` |
| 7.2 | config | **PASS** | `environment='development'`, `log_level='info'` |
| 7.3 | errors | **PASS** | All 7 errors including `StorageError` instantiate correctly |
| 7.4 | cache | **PASS** | `CacheClient` importable |
| 7.5 | llm imports | **FAIL** | 11/12 imports succeeded. `auto_detect_providers` not exported from `ai_toolkit.llm` (exists in `providers.py` but missing from `__init__.py` `__all__`) |
| 7.6 | pricing | **PASS** | `estimate_cost('claude-sonnet-4-20250514', 1000, 500) = 0.0105` |
| 7.7 | ingestion | **PASS** | `extract_text`, `extract_html`, `detect_format`, `chunk_text` all work. 8 chunks produced. |
| 7.8 | guardrails | **PASS** | All 5 sub-tests pass: PII detection (1 violation), PII redaction (`[PHONE REDACTED]`), topic filter (1 violation), prompt injection (1 violation), hallucination scorer (grounded=0, ungrounded=1) |
| 7.9 | evaluation | **PASS** | Single: faithfulness=0.750, relevancy=0.667, context_precision=0.500, context_recall=0.250, overall=0.453. Batch: count=2, avg_overall=0.000 |
| 7.10 | workflow | **PASS** | `WorkflowBudget` tracks cost, raises `BudgetExceededError` when exceeded |
| 7.11 | auth | **PASS** | All 3 dependencies importable |
| 7.12 | security | **PASS** | `AuditLogger.log()` works without error |
| 7.13 | observability | **PASS** | `init_langfuse()` returns `None`, `get_logger()` logs correctly |
| 7.14 | prompts | **PASS** | `PromptManager` template substitution: `'Hello World.'` |

**Result: 13/14 PASS, 1 FAIL**

### Failure Detail

**7.5 llm imports**: `auto_detect_providers` exists in `ai_toolkit/llm/providers.py` as a function but is not listed in `ai_toolkit/llm/__init__.py`'s `__all__` and is not imported there. It can only be accessed via `from ai_toolkit.llm.providers import auto_detect_providers`.

### Notes on Test Script Corrections

- **7.3**: `LLMError` requires `provider` keyword argument: `LLMError('msg', provider='test')` not `LLMError('msg')`
- **7.9**: `context` must be `list[str]` not `str`, `contexts` must be `list[list[str]]` not `list[str]`

## Section 8: CLI Audit

### TypeScript Build
- `npx tsc --noEmit`: **Exit code 0** — clean type-check, no errors

### Package Metadata

| Field | Value |
|-------|-------|
| `name` | `@jamaalbuilds/aitk` |
| `version` | `0.1.0` |
| `bin` | `{ "aitk": "./dist/index.js" }` |
| `type` | `module` (ESM) |

### Dependencies
- `commander ^13.0.0`
- `chalk ^5.4.0`
- `ora ^8.2.0`

### Source Files

| File | Lines |
|------|------:|
| `src/index.ts` | 18 |
| `src/commands/doctor.ts` | 66 |
| `src/commands/init.ts` | 135 |
| `src/lib/checks.ts` | 206 |
| `src/lib/templates.ts` | 539 |
| **Total** | **964** |

### README.md
**EXISTS** — 40 lines, included in `"files"` array for npm publish.

**Result: PASS**

## Section 9: Cross-Cutting Checks

### 9.1 TODO/FIXME Scan

| # | File | Line | Content |
|---|------|-----:|---------|
| 1 | `packages/toolkit/src/llm/client.ts` | 142 | `cost: 0, // TODO: pricing registry` |

**Total: 1 TODO, 0 FIXME, 0 HACK, 0 XXX** across all 3 packages.

### 9.2 Line Counts

| Package | Lines |
|---------|------:|
| TypeScript SDK (`packages/toolkit/src/`) | 2,500 |
| Python SDK (`packages/toolkit-python/ai_toolkit/`) | 5,022 |
| CLI (`packages/cli/src/`) | 964 |
| **Grand Total** | **8,486** |

### 9.3 README Check

| File | Exists? | Lines |
|------|:-------:|------:|
| `packages/toolkit/README.md` | **MISSING** | — |
| `packages/toolkit-python/README.md` | Yes | 70 |
| `packages/cli/README.md` | Yes | 40 |

### 9.4 .gitignore Coverage

| Required Pattern | Covered? | Matching Entry |
|-----------------|:--------:|----------------|
| `node_modules` | **YES** | `node_modules/` |
| `dist` | **YES** | `dist/` |
| `__pycache__` | **YES** | `__pycache__/` |
| `.venv` | **YES** | `.venv/` |
| `.env` | **YES** | `.env` + `.env.local` + `.env.*.local` |
| `.turbo` | **YES** | `.turbo/` |
| `.DS_Store` | **YES** | `.DS_Store` |

**Result:** All 7 required patterns covered. Additional entries: `.yarn/cache`, `*.pyc`, `*.tsbuildinfo`, IDE dirs, test caches.

## Issues Found

### CRITICAL
1. **Missing TypeScript SDK README** — `packages/toolkit/README.md` does not exist. This is the npm-published package (`@jamaalbuilds/ai-toolkit`); npm renders README as primary documentation. Without it, the npm page will be blank.

### MODERATE
2. **`auto_detect_providers` not exported from Python `llm/`** — The function exists in `ai_toolkit/llm/providers.py` but is missing from `ai_toolkit/llm/__init__.py`'s `__all__` and imports. Users must use the internal path `from ai_toolkit.llm.providers import auto_detect_providers` instead of the public API.
3. **TypeScript LLM cost hardcoded to 0** — `packages/toolkit/src/llm/client.ts:142` has `cost: 0, // TODO: pricing registry`. The Python SDK already has a full `_PRICING` dict with `estimate_cost()`, but this hasn't been ported to TypeScript.
4. **Empty `.github/workflows/`** — No CI/CD pipeline exists. Tests, linting, and publishing are not automated.
5. **3 Python stub modules** — `data/`, `health/`, and `testing/` are single-line docstring stubs with no implementation. The TypeScript SDK has these fully implemented, creating a feature gap.
6. **API surface inconsistencies between test expectations and actual signatures** — 10 API mismatches found in the Section 5 test design (see table in Section 5). While the code is correct, this indicates the public API documentation or examples may be misleading or incomplete.

### LOW
7. **Empty `docs/adrs/`** — No Architecture Decision Records yet.
8. **`LLMError` Python constructor requires `provider` kwarg** — `LLMError('msg')` raises `TypeError`; must use `LLMError('msg', provider='test')`. This differs from the TypeScript SDK where `provider` is in an options bag.
9. **Python `evaluate_batch` `avg_overall` returns 0.000 for trivial inputs** — When question/answer/context have no meaningful overlap (e.g., `Q1/A1/C1`), all metrics return 0. This is technically correct (token overlap is 0) but may surprise users expecting a default/fallback score.
10. **TypeScript `createAuditLogger` requires `serviceName` string** — Calling with no args produces an `undefined` service name in audit entries. No validation or error thrown.
11. **Python `LLMError` vs TypeScript `LLMError` signature mismatch** — Python: `LLMError(message, *, provider, model=None, code='LLM_ERROR', ...)`. TypeScript: `LLMError(message, {provider?, ...})`. The `provider` is required in Python but optional in TypeScript.
12. **Peer dependency `openai` missing from TypeScript SDK** — The LLM client auto-detects OpenAI but `openai` is not listed in `peerDependencies`. Users may not get a clear install hint.

## Recommended Fixes

1. **Create `packages/toolkit/README.md`** — Add install instructions, module list, quick start examples (mirror the Python SDK README structure). This unblocks the npm package page.
2. **Add `auto_detect_providers` to `ai_toolkit/llm/__init__.py`** — Add to both `__all__` list and imports in `packages/toolkit-python/ai_toolkit/llm/__init__.py`.
3. **Port pricing registry to TypeScript SDK** — Copy the `_PRICING` dict pattern from `packages/toolkit-python/ai_toolkit/llm/providers.py` to `packages/toolkit/src/llm/client.ts`. Remove the TODO at line 142.
4. **Add GitHub Actions CI** — Create `.github/workflows/ci.yml` with: TypeScript build + tests, Python tests (via `uv run`), lint checks. Wire to push/PR events.
5. **Implement Python stub modules or document as planned** — Either implement `data/`, `health/`, `testing/` in Python (matching TypeScript SDK) or explicitly document them as "planned" in the Python README.
6. **Update CLAUDE.md / docs with actual API signatures** — Correct the documented signatures for `requireApiKey`, `createRateLimiter`, `createHealthCheck`, `createAuditLogger`, and `mockDb` to match the actual implementations.
7. **Start `docs/adrs/`** — Create at least an ADR template and ADR-001 covering the monorepo structure decision.
8. **Consider making Python `LLMError.provider` optional** — Align with TypeScript where `provider` is optional, or document the intentional difference.
9. **Add `openai` to TypeScript SDK `peerDependencies`** — At `packages/toolkit/package.json`, add `"openai": ">=4.0.0"` to `peerDependencies` and `peerDependenciesMeta`.
10. **Add input validation to `createAuditLogger`** — Throw if `serviceName` is undefined/empty to prevent malformed audit entries.
