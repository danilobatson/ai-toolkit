# Coding Process & Standards

> Universal standards for all TypeScript projects.
> Applies to: ai-toolkit, Boulder Care, portfolio projects, any future work.
> These are non-negotiable unless a project explicitly overrides them.

---

## 1. The Process (Every Feature/Module/Fix)

```
DISCOVER → PLAN → READ → IMPLEMENT → TEST → VERIFY → REVIEW → SHIP
```

| Phase         | What Happens                                                                             | Skill                     |
| ------------- | ---------------------------------------------------------------------------------------- | ------------------------- |
| **DISCOVER**  | Read all related code. Understand what exists. Identify patterns.                        | `/discovery` `/preflight` |
| **PLAN**      | If using a new library: spike it first. Check 8 sources. Document decision.              | `/spike` `/adr`           |
| **READ**      | Read EVERY file you'll touch AND every file that imports from it. Read the library docs. | Built into `/writer`      |
| **IMPLEMENT** | Follow existing patterns exactly. JSDoc first. Input validation. Error handling.         | `/writer`                 |
| **TEST**      | Same commit. Test real behavior, not shapes. Cover error paths.                          | Built into `/writer`      |
| **VERIFY**    | typecheck + lint + test + build. All must pass. No new warnings.                         | `yarn verify`             |
| **REVIEW**    | Separate session reads all changes. Checks patterns, security, test quality.             | `/auditor`                |
| **SHIP**      | Push. CI validates. Manual spot-check.                                                   | `git push`                |

**Never skip a phase.** The order matters. Discovery before planning. Planning before implementing. Testing before reviewing.

---

## 2. Code Standards

### TypeScript
- `strict: true` always
- No `any` in exported types — use `unknown` + type guards
- No non-null assertions (`!`) — check for null explicitly
- `import type` for type-only imports
- Named exports only — no default exports
- Explicit return types on public functions

### Error Handling
- Use project-specific error classes (ToolkitError, etc.) — never raw `throw new Error()`
- Every catch block either handles the error or wraps it with context
- Never swallow errors silently (empty catch blocks)
- Error messages should tell the developer what went wrong AND how to fix it

```typescript
// BAD
throw new Error("failed");

// GOOD
throw new ValidationError("GROQ_API_KEY is required. Get your free key at https://console.groq.com", {
  code: "MISSING_API_KEY",
  fields: { GROQ_API_KEY: "required" },
});
```

### Input Validation
- Validate ALL inputs to public functions (Zod schemas or type guards)
- Validate at the boundary — don't trust callers
- Reject bad input early, before any side effects

### Security
- Constant-time comparison for secrets (crypto.timingSafeEqual)
- Never log secrets, tokens, or PII
- Never hardcode URLs, keys, or credentials
- Use environment variables for all configuration
- No `process.exit()` in library code (only in CLI entry points)

### Documentation
- JSDoc with `@example` on every exported function
- Module-level JSDoc on every index.ts barrel file
- ADR for every major technical decision
- README for every package

---

## 3. Testing Standards

### What to Test
Every exported function needs at minimum:
1. **Happy path** — correct input → correct output
2. **Error path** — bad input → correct error (type, message, code)
3. **Edge cases** — null, undefined, empty string, boundary values

Additional levels when applicable:
4. **Provider fallback** — primary fails → secondary responds (ai module)
5. **Cleanup** — subscriptions/connections disposed on close (realtime, database)

### Test Quality Rules (Non-Negotiable)
- `toThrow()` → always regex: `.toThrow(/pattern/)`
- `vi.useFakeTimers()` → always wrapped in `try/finally` with `vi.useRealTimers()` in finally
- Zero external API calls — use mocks
- No `readFileSync` on production source files (test behavior, not text)
- Tests must fail if the implementation is deleted — no `expect(fn).toBeDefined()` alone
- Tests and implementation in the same commit

### Test Coverage Targets
- Core modules: 80%+ line coverage
- Utility modules: 60%+ line coverage
- Types-only modules: no tests needed

---

## 4. Git Standards

### Commits
- Conventional commits: `type(scope): description`
- Types: `feat`, `fix`, `test`, `chore`, `refactor`, `docs`, `ci`
- Scope: module name or omit for cross-cutting
- Lowercase, no period, imperative mood, under 72 characters
- One concern per commit
- Tests ship in the same commit as implementation
- **NEVER** include Co-Authored-By trailers

### Branches
- `main` — always deployable
- `feat/[name]` — feature work
- `fix/[name]` — bug fixes
- Push frequently. Don't let unpushed commits pile up.

---

## 5. CI/CD Standards

### Every Push (Automated)
```
typecheck → lint → test → build
```
All must pass. No exceptions.

### Scheduled (Daily Cron)
```
test → build
```
Catches dependency rot and environment changes.

### Pre-Commit (Local, Fast)
```
lint-staged (changed files only)
```

### Pre-Push (Local, Thorough)
```
test → build
```

---

## 6. Dependency Standards

### Versioning
- Pin exact versions for direct and dev dependencies (no `^`, no `~`)
- Peer dependencies use `>=` ranges (convention)
- Dependabot for automated dependency monitoring (`.github/dependabot.yml`)
- Optional peers load with `await import()`, never `require()` — the package ships as ESM, where `require` is undefined

### Adding Dependencies
1. Check npm: version, last publish date, weekly downloads
2. Check GitHub: activity, open issues, recent commits
3. Check official website and docs
4. Install with exact version
5. Verify build + test after install

### Choosing Libraries
- Prefer battle-tested packages over custom code for security, parsing, validation
- Prefer packages with TypeScript types included
- Prefer packages with active maintenance (published within 90 days)
- Check for HIPAA/compliance compatibility if handling sensitive data
- Always have a fallback plan if a dependency becomes unmaintained

---

## 7. Code Review Checklist

Every change should be checked for:

### Correctness
- [ ] Does each function do what its name says?
- [ ] Are null/undefined cases handled?
- [ ] Are error paths handled with proper error types?

### Security
- [ ] No hardcoded secrets or URLs
- [ ] Constant-time comparison for secrets
- [ ] No PII in logs
- [ ] Input validated before processing

### Types
- [ ] No `any` in exports
- [ ] No unnecessary type assertions (`as`)
- [ ] Return types explicit on public functions

### Tests
- [ ] Tests exist for new/changed code
- [ ] Tests verify behavior, not just shapes
- [ ] Error paths tested
- [ ] toThrow uses regex
- [ ] Fake timers have try/finally

### Patterns
- [ ] Follows existing module conventions
- [ ] Uses project error classes
- [ ] JSDoc on exports with @example
- [ ] No unused imports

---

## 8. Session Management

### Start of Every Session
- Read CLAUDE.md (or project context file)
- Read SESSION_STATE.md (previous session context)
- Run preflight checks (repo, branch, clean state, baseline tests)

### End of Every Session
- Update SESSION_STATE.md with: what was done, what's next, test baseline
- Ensure all work is committed (no uncommitted changes)
- Push if approved

### Between Sessions
- SESSION_STATE.md preserves context
- Each step is independently verifiable
- Anyone (human or AI) can pick up where the last session left off

---

## 9. Architecture Principles

### Adapter Pattern
- Every third-party library wrapped behind project's own interface
- If the library changes, only the adapter changes — callers unaffected
- Pin library versions to prevent surprise breaks

### Defensive Programming
- Validate inputs at boundaries
- Handle errors at every level
- Never trust external data
- Log errors with context (what, where, why)
- Graceful degradation over crashes

### Module Design
- Single responsibility per module
- Barrel exports (index.ts) expose only the public API
- Internal implementation details are NOT exported
- Factory functions (`createX()`) as primary API pattern
- Types co-located with implementation

---

## 10. Security Principles

### Data Handling
- Never log PII, PHI, secrets, or tokens
- Encrypt sensitive data at rest and in transit
- Use environment variables for credentials
- Multi-tenant: filter data by tenant at every query
- Audit log every access to sensitive data (who, what, when, why)

### API Security
- Validate all inputs (Zod schemas at API boundaries)
- Rate limit all endpoints
- Constant-time comparison for authentication tokens
- Never expose internal error details to clients

### AI-Specific Security
- PII detection before sending data to cloud AI providers
- Guardrails on AI outputs (hallucination detection, topic filtering)
- Audit trail for every AI decision
- Provider abstraction for switching to self-hosted models (compliance)
- Cost tracking and budget enforcement per AI call

### Compliance Readiness
- Architecture supports HIPAA, FedRAMP, SOX, PCI patterns
- Self-hosted AI option documented (Ollama)
- Self-hosted observability option documented (Langfuse)
- Data isolation via multi-tenant architecture
- All patterns mapped to compliance standards in documentation

---

*Coding Process & Standards — Universal Reference*
*Applies to all TypeScript projects*
