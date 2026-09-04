# ADR-010: Rate Limiter Fails Open on Cache Failure

## Status
Accepted

## Date
2026-09-04

## Context
`createRateLimiter` (`packages/toolkit/src/security/rate-limiter.ts`) tracks
request counts in a `CacheClient` (Redis or in-memory). When the cache call
inside `check()` throws — the store is unreachable, times out, or the key was
evicted — the `catch` block returns `allowed: true, remaining: max` instead of
propagating the error. Rate limiting silently stops enforcing for every caller
until the cache recovers, with no error and no signal to the caller.

This is deliberate, but until now it was recorded only in two comments in the
file itself (the JSDoc on `createRateLimiter` and the inline comment in the
`catch` block) — nowhere a consumer evaluating the module would find it.

## Decision
`check()` fails open: any cache error is treated the same as "under the
limit," and the request is allowed through.

## Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| **Fail open** (chosen) | A cache outage degrades to "no rate limiting," not "every guarded endpoint is down" | Not a hard enforcement guarantee — see Consequences |
| **Fail closed** (reject when the count is unknown) | Rate limits are never silently bypassed | Turns a cache outage into a full outage of every endpoint the limiter guards — availability risk far larger than the abuse risk it prevents |

## Consequences
**Positive:**
- A Redis blip or cold in-memory cache never takes down the endpoints it's meant to protect.
- Matches the toolkit-wide preference for availability over strict enforcement in non-security-critical paths.

**Negative:**
- `createRateLimiter` is not a hard abuse or cost control on its own — during a cache outage it enforces nothing. Anyone relying on it for abuse prevention or cost control needs a second, independently-backed layer (e.g. a provider-side or infrastructure-level limit) that does not share the same cache.
- The bypass is silent: `check()` returns the same shape (`allowed: true`) whether the caller is under the limit or the cache failed, so there is no built-in signal to alert on.
