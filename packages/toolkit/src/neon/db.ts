/**
 * Neon — serverless Postgres driver wrapper.
 *
 * Wraps @neondatabase/serverless with connection pooling,
 * query helpers, and multi-tenant WHERE clause enforcement.
 *
 * Requires @neondatabase/serverless as a peer dependency.
 *
 * @example
 * ```ts
 * import { createDb, withTenant } from '@jamaalbuilds/ai-toolkit/neon';
 *
 * const db = createDb();  // reads DATABASE_URL from env
 * const rows = await db.query('SELECT * FROM documents WHERE org_id = $1', [orgId]);
 *
 * // Or with the tenant helper:
 * const docs = await withTenant(db, orgId, 'SELECT * FROM documents');
 * // → automatically appends WHERE org_id = $1
 * ```
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DbClient {
  /** Run a parameterized query. */
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;

  /** Run a query and return the first row, or null. */
  queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | null>;

  /** Close the connection pool. */
  end(): Promise<void>;
}

export interface DbConfig {
  /** Postgres connection string. Default: process.env.DATABASE_URL */
  connectionString?: string;
  /** Enable SSL. Default: true */
  ssl?: boolean;
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Create a Neon serverless database client.
 *
 * Uses @neondatabase/serverless for edge-compatible connections.
 * Falls back to pg if available (for local development).
 */
export function createDb(config?: DbConfig): DbClient {
  const connectionString =
    config?.connectionString ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL not set. Provide connectionString or set DATABASE_URL env var.");
  }

  // Try @neondatabase/serverless first, then pg
  let pool: any;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("@neondatabase/serverless");
    pool = new Pool({ connectionString, ssl: config?.ssl ?? true });
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require("pg");
      pool = new Pool({ connectionString, ssl: config?.ssl !== false });
    } catch {
      throw new Error(
        "No Postgres driver found. Install: yarn add @neondatabase/serverless (or pg for local dev)",
      );
    }
  }

  return {
    async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
      const result = await pool.query(sql, params);
      return result.rows as T[];
    },

    async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
      const result = await pool.query(sql, params);
      return (result.rows[0] as T) ?? null;
    },

    async end(): Promise<void> {
      await pool.end();
    },
  };
}

/**
 * Execute a query with automatic tenant isolation.
 *
 * Appends `WHERE org_id = $N` to the query. Use for simple
 * queries where you want guaranteed tenant scoping.
 */
export async function withTenant<T = Record<string, unknown>>(
  db: DbClient,
  orgId: string,
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const allParams = [...(params ?? []), orgId];
  const paramIndex = allParams.length;

  // Append WHERE clause (or AND if WHERE exists)
  const upperSql = sql.toUpperCase();
  const separator = upperSql.includes("WHERE") ? " AND" : " WHERE";
  const scopedSql = `${sql}${separator} org_id = $${paramIndex}`;

  return db.query<T>(scopedSql, allParams);
}
