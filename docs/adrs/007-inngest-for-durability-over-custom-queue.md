# ADR-007: Inngest for Durability Over Custom Queue

## Status
Accepted

## Date
2026-03-27

## Context
The toolkit needs durable background job execution for AI workflows — retries on failure, cron scheduling, human-in-the-loop approval flows, and long-running multi-step pipelines. AI workloads are particularly prone to transient failures (rate limits, timeouts, model outages), making durability essential rather than optional.

Options ranged from building a custom queue system (BullMQ/Redis) to adopting a purpose-built durable execution platform.

## Decision
Use **Inngest** (v4) as the workflow engine, wrapped behind the toolkit's adapter pattern as an optional peer dependency.

Key design choices:
- Inngest is a **peer dependency** — not bundled, installed only when the workflow module is used
- The adapter wraps Inngest's v4 2-arg `createFunction` API behind toolkit's `defineJob()` interface
- `humanInTheLoop()` wraps `step.waitForEvent()` for approval flows
- `aiStep()` integrates with the ai module for durable AI generation with fallback
- `serve()` wraps `inngest/next` for Next.js route handlers

## Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| **Inngest (chosen)** | Built-in step durability, waitForEvent for HITL, TypeScript-native, managed infrastructure, v4 actively maintained | Vendor dependency, requires Inngest cloud or self-hosted dev server |
| **BullMQ + Redis** | Full control, widely adopted, no vendor lock-in | No built-in step functions, manual retry/state management, requires Redis infrastructure |
| **Temporal** | Enterprise-grade durability, deterministic replay | Heavy runtime, complex setup, Java-centric ecosystem, steep learning curve |
| **Custom queue (pg-based)** | Zero external deps, full control | Massive implementation effort, reinventing durability primitives, maintenance burden |

## Consequences
**Positive:**
- Step-level durability out of the box — each `step.run()` is automatically retried and memoized
- `step.waitForEvent()` provides native human-in-the-loop without custom polling/webhook infrastructure
- Framework adapters (Next.js, Express, etc.) via sub-path imports
- Pairs well with the ai module — `aiStep()` adds fallback + cost tracking to durable AI calls
- Minimal toolkit code — the adapter is thin because Inngest handles the hard parts

**Negative:**
- Requires Inngest dev server for local development (`npx inngest-cli@latest dev`)
- Production requires Inngest Cloud account or self-hosted setup
- Vendor coupling (mitigated by adapter pattern — swap to Temporal/BullMQ by changing adapter only)

## Interview Answer (2 sentences)
We chose Inngest over BullMQ or a custom queue because AI workflows need step-level durability with automatic retry and memoization — Inngest provides this natively with `step.run()` and `step.waitForEvent()` for human-in-the-loop, while BullMQ would require building all of that from scratch. The adapter pattern means we can swap to Temporal or another engine later without changing the developer-facing API.
