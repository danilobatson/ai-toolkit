# Contributing to AI Toolkit

Thanks for your interest in contributing to `@jamaalbuilds/ai-toolkit`.

## Setup

```bash
git clone https://github.com/danilobatson/ai-toolkit.git
cd ai-toolkit
yarn install
```

**Requirements:** Node.js >= 20, Yarn 1.x

## Development

```bash
yarn test              # run all tests
yarn build             # compile TypeScript
yarn lint              # biome check
yarn typecheck         # tsc --noEmit
yarn verify            # all of the above in sequence
yarn semantic-checks   # run semantic verification
```

## Coding Standards

### Architecture
- **Adapter pattern** — wrap all third-party libraries behind toolkit interfaces
- **No `any`** in public API — use `unknown` + type guards
- **No raw `throw new Error()`** — use `ToolkitError` with context
- **No hardcoded provider URLs** — use `config.getProviderUrl()`
- **No `process.exit()`** in library code
- **Pin exact dependency versions** — no `^` ranges

### Every Export Must Have
1. JSDoc with `@example` block
2. Input validation (Zod schema or type guard)
3. Error handling (catch and wrap in `ToolkitError`)

### Testing
Tests use a tiered framework:
1. **CRASH** — doesn't throw on valid input
2. **BEHAVIOR** — correct output on happy path
3. **DATA QUALITY** — output types and values correct
4. **ENVIRONMENT** — invalid/missing/null inputs handled
5. **PATTERN** — matches conventions across modules
6. **CONTRACT** — API contract honored
7. **PROVIDER FALLBACK** — graceful degradation
8. **CLEANUP** — resources released properly

Additional rules:
- `toThrow()` must use regex, never exact string match
- `vi.useFakeTimers()` must be paired with `try/finally`
- Zero external API calls in tests — use mock providers
- Implementation and tests always in the same commit

### File Structure
```
packages/toolkit/src/[module]/
  index.ts              # public exports
  [feature].ts          # implementation
  types.ts              # type definitions
  adapters/[provider].ts  # provider adapters
  __tests__/[feature].test.ts  # tests
```

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(module): add new feature
fix(module): fix specific bug
chore(deps): update dependency
docs(module): update documentation
test(module): add missing tests
```

One concern per commit. Tests ship with their implementation.

## Pull Request Process

1. Create a feature branch from `main`
2. Implement with tests (same commit)
3. Ensure all checks pass: `yarn test && yarn typecheck && yarn lint`
4. Open a PR using the provided template
5. Fill out the checklist completely

## Claude Code Contributors

If you're using Claude Code to contribute, the following skills are available:

| Skill | Purpose |
|---|---|
| `/preflight` | Run at session start — checks repo state |
| `/writer` | Implement a module or feature end-to-end |
| `/discovery` | Deep exploration before building |
| `/spike` | Research a library before committing |
| `/semantic-checks` | Run pattern-based verification |
| `/report` | Generate session report |
| `/session-state` | Update session state for continuity |

Always run `/preflight` first. Always run `/report` last.
