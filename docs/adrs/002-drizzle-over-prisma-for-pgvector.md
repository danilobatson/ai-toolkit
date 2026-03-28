# ADR-002: Drizzle ORM over Prisma for pgvector

**Status:** Accepted
**Date:** 2026-03-27
**Decision:** Use Drizzle ORM as the database layer for the `database/` module instead of Prisma, primarily for native pgvector support and SQL transparency.

## Context

The `database/` module replaces the v4 `neon/` module (raw pg pool wrapper) with a typed ORM that supports vector similarity search via pgvector. We evaluated two ORMs:

1. **Prisma** — the most popular Node.js ORM, with a custom query language and schema DSL.
2. **Drizzle ORM** — a lightweight, SQL-first TypeScript ORM with native pgvector column types.

## Decision

Use Drizzle ORM v0.45.2 (`drizzle-orm`) with the `postgres` driver as the default, and optional `@neondatabase/serverless` for edge environments.

## Reasons

1. **Native pgvector support.** Drizzle has a built-in `vector()` column type in `drizzle-orm/pg-core` since v0.31.0, plus `cosineDistance()`, `l2Distance()`, and `innerProduct()` functions exported directly from `drizzle-orm`. Prisma requires raw SQL (`$queryRaw`) or the `pgvector` extension with manual column definitions — no first-class type safety for vector operations.

2. **SQL transparency.** Drizzle generates SQL that maps 1:1 to what you write. Developers can reason about query performance without guessing what the ORM is doing. This matters for vector similarity queries where index usage depends on operator choice (`<=>` vs `<->` vs `<#>`).

3. **No code generation step.** Prisma requires `prisma generate` after every schema change, producing a client in `node_modules/.prisma`. Drizzle schemas are plain TypeScript — no generation step, no hidden output directory, no stale client bugs.

4. **Multi-driver support.** Drizzle provides separate import paths for each driver (`drizzle-orm/postgres-js`, `drizzle-orm/neon-http`, `drizzle-orm/neon-serverless`), making it trivial to support Neon serverless, Supabase, AWS RDS, and local Docker from the same schema. Prisma's driver adapters exist but are less mature for edge runtimes.

5. **Bundle size.** Drizzle ORM is ~50KB gzipped. Prisma's engine binary is ~15MB, which is hostile to serverless cold starts and edge deployments.

6. **Programmatic migrations.** Drizzle's `migrate()` function runs from application code with a single connection — ideal for deploy scripts. Prisma requires `prisma migrate deploy` as a CLI step.

## Tradeoffs

- **Prisma has better DX for beginners.** Its schema DSL is more approachable than Drizzle's TypeScript-first schema definitions. However, our toolkit wraps the ORM behind an adapter, so end users never write Drizzle schemas directly.

- **Prisma has a larger ecosystem** — Prisma Studio, Prisma Accelerate, Prisma Pulse. We don't need any of these for the toolkit's scope.

- **Drizzle is younger.** Prisma has been stable since 2021; Drizzle hit v1.0 patterns in 2024. The risk is mitigated by pinning to exact version `0.45.2` and wrapping behind our adapter.

## Consequences

- The `database/` module uses `drizzle-orm` and `postgres` as peer dependencies.
- Vector search uses Drizzle's `cosineDistance()` for the typed API and raw `<=>` operator for the SQL API.
- Schema definitions use `drizzle-orm/pg-core` types (`pgTable`, `vector`, `serial`, `text`).
- Migrations use `drizzle-kit` (dev dependency) for generation and `drizzle-orm/postgres-js/migrator` for programmatic application.
