## What

<!-- Brief description of the change -->

## Why

<!-- Why is this change needed? Link to issue if applicable -->

## Checklist

- [ ] Tests added or updated (same commit as implementation)
- [ ] No `any` in exported types (`unknown` + type guard if needed)
- [ ] All exports have JSDoc with `@example` block
- [ ] No raw `throw new Error()` — uses `ToolkitError`
- [ ] No hardcoded provider URLs
- [ ] No `process.exit()` in library code
- [ ] No `^` in dependency versions (pin exact)
- [ ] Input validation via Zod or type guard
- [ ] `yarn test` — all passing
- [ ] `yarn typecheck` — clean
- [ ] `yarn lint` — no new warnings
- [ ] Conventional commit messages used

## Test Plan

<!-- How did you verify this works? -->
