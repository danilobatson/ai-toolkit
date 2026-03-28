/**
 * Database — provider-agnostic Postgres client powered by Drizzle ORM.
 *
 * Wraps drizzle-orm behind the toolkit's DatabaseClient interface.
 * Supports Neon, Supabase, AWS RDS, and local Docker Postgres.
 *
 * Requires drizzle-orm and a Postgres driver as peer dependencies.
 *
 * @example
 * ```ts
 * import { createDatabase } from '@jamaalbuilds/ai-toolkit/database';
 *
 * const database = createDatabase();  // reads DATABASE_URL from env
 * const rows = await database.query('SELECT * FROM users');
 *
 * // With tenant isolation:
 * const docs = await database.withTenant(orgId, 'SELECT * FROM documents');
 *
 * // Access Drizzle directly for typed queries:
 * const db = database.db;
 * ```
 */

import { ToolkitError, ValidationError } from "../errors/index.js";
import type {
	DatabaseClient,
	DatabaseConfig,
	DatabaseDriver,
	DatabaseProvider,
} from "./types.js";

// ─── Import Paths (variables prevent TS from resolving peer deps) ──────

const POSTGRES_PATH = "postgres";
const DRIZZLE_POSTGRES_JS_PATH = "drizzle-orm/postgres-js";
const NEON_SERVERLESS_PATH = "@neondatabase/serverless";
const DRIZZLE_NEON_HTTP_PATH = "drizzle-orm/neon-http";
const DRIZZLE_NEON_SERVERLESS_PATH = "drizzle-orm/neon-serverless";

// ─── Provider Detection ────────────────────────────────────────────────────

/**
 * Detect the database provider from a connection string.
 *
 * @example
 * ```ts
 * detectProvider('postgresql://user@ep-cool-dawn.us-east-2.aws.neon.tech/db');
 * // → 'neon'
 * ```
 */
export function detectProvider(connectionString: string): DatabaseProvider {
	const lower = connectionString.toLowerCase();
	if (lower.includes("neon.tech") || lower.includes("neon.")) return "neon";
	if (lower.includes("supabase.com") || lower.includes("supabase.co"))
		return "supabase";
	if (lower.includes("rds.amazonaws.com")) return "aws-rds";
	if (lower.includes("localhost") || lower.includes("127.0.0.1"))
		return "local";
	return "local";
}

/**
 * Determine whether SSL should be enabled based on provider.
 */
function defaultSsl(provider: DatabaseProvider): boolean {
	return provider !== "local";
}

/**
 * Determine the default driver for a provider.
 */
function defaultDriver(provider: DatabaseProvider): DatabaseDriver {
	if (provider === "neon") return "neon-http";
	return "postgres-js";
}

// ─── Driver Loading ────────────────────────────────────────────────────────

interface DriverResult {
	db: unknown;
	driver: DatabaseDriver;
	end: () => Promise<void>;
	rawQuery: (
		sql: string,
		params?: unknown[],
	) => Promise<Record<string, unknown>[]>;
}

async function loadPostgresJs(
	connectionString: string,
	ssl: boolean,
	schema?: Record<string, unknown>,
	logger?: boolean,
): Promise<DriverResult> {
	let postgresFactory: unknown;
	try {
		const mod = await import(POSTGRES_PATH);
		postgresFactory = mod.default ?? mod;
	} catch {
		throw new ToolkitError(
			"Postgres driver not found. Install: yarn add postgres",
			{ code: "DATABASE_MISSING_DEPENDENCY", statusCode: 500 },
		);
	}

	let drizzleFactory: unknown;
	try {
		const mod = await import(DRIZZLE_POSTGRES_JS_PATH);
		drizzleFactory = mod.drizzle ?? mod.default;
	} catch {
		throw new ToolkitError(
			"drizzle-orm not found. Install: yarn add drizzle-orm",
			{ code: "DATABASE_MISSING_DEPENDENCY", statusCode: 500 },
		);
	}

	const createClient = postgresFactory as (
		url: string,
		opts?: Record<string, unknown>,
	) => {
		unsafe(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
		end(): Promise<void>;
	};
	const drizzle = drizzleFactory as (
		client: unknown,
		config?: Record<string, unknown>,
	) => unknown;

	const client = createClient(connectionString, {
		ssl: ssl ? "require" : false,
		max: 10,
	});

	const db = drizzle(client, {
		...(schema ? { schema } : {}),
		...(logger ? { logger: true } : {}),
	});

	return {
		db,
		driver: "postgres-js",
		end: () => client.end(),
		rawQuery: (sql: string, params?: unknown[]) =>
			client.unsafe(sql, params as unknown[]),
	};
}

async function loadNeonHttp(
	connectionString: string,
	schema?: Record<string, unknown>,
	logger?: boolean,
): Promise<DriverResult> {
	let neonFactory: unknown;
	try {
		const mod = await import(NEON_SERVERLESS_PATH);
		neonFactory = mod.neon;
	} catch {
		throw new ToolkitError(
			"@neondatabase/serverless not found. Install: yarn add @neondatabase/serverless",
			{ code: "DATABASE_MISSING_DEPENDENCY", statusCode: 500 },
		);
	}

	let drizzleFactory: unknown;
	try {
		const mod = await import(DRIZZLE_NEON_HTTP_PATH);
		drizzleFactory = mod.drizzle ?? mod.default;
	} catch {
		throw new ToolkitError(
			"drizzle-orm not found. Install: yarn add drizzle-orm",
			{ code: "DATABASE_MISSING_DEPENDENCY", statusCode: 500 },
		);
	}

	const neon = neonFactory as (
		url: string,
	) => (...args: unknown[]) => Promise<unknown>;
	const drizzle = drizzleFactory as (
		client: unknown,
		config?: Record<string, unknown>,
	) => unknown;

	const sql = neon(connectionString);
	const db = drizzle(sql, {
		...(schema ? { schema } : {}),
		...(logger ? { logger: true } : {}),
	});

	return {
		db,
		driver: "neon-http",
		end: async () => {
			/* neon-http is stateless */
		},
		rawQuery: async (sqlStr: string, params?: unknown[]) => {
			const result = (await sql(sqlStr, params as never)) as Record<
				string,
				unknown
			>[];
			return result;
		},
	};
}

async function loadNeonServerless(
	connectionString: string,
	schema?: Record<string, unknown>,
	logger?: boolean,
): Promise<DriverResult> {
	let PoolClass: unknown;
	try {
		const mod = await import(NEON_SERVERLESS_PATH);
		PoolClass = mod.Pool;
	} catch {
		throw new ToolkitError(
			"@neondatabase/serverless not found. Install: yarn add @neondatabase/serverless",
			{ code: "DATABASE_MISSING_DEPENDENCY", statusCode: 500 },
		);
	}

	let drizzleFactory: unknown;
	try {
		const mod = await import(DRIZZLE_NEON_SERVERLESS_PATH);
		drizzleFactory = mod.drizzle ?? mod.default;
	} catch {
		throw new ToolkitError(
			"drizzle-orm not found. Install: yarn add drizzle-orm",
			{ code: "DATABASE_MISSING_DEPENDENCY", statusCode: 500 },
		);
	}

	const Pool = PoolClass as new (config: {
		connectionString: string;
	}) => {
		query(
			sql: string,
			params?: unknown[],
		): Promise<{ rows: Record<string, unknown>[] }>;
		end(): Promise<void>;
	};
	const drizzle = drizzleFactory as (
		config: Record<string, unknown>,
	) => unknown;

	const pool = new Pool({ connectionString });
	const db = drizzle({
		client: pool,
		...(schema ? { schema } : {}),
		...(logger ? { logger: true } : {}),
	});

	return {
		db,
		driver: "neon-serverless",
		end: () => pool.end(),
		rawQuery: async (sqlStr: string, params?: unknown[]) => {
			const result = await pool.query(sqlStr, params);
			return result.rows;
		},
	};
}

// ─── Factory ───────────────────────────────────────────────────────────────

/**
 * Create a provider-agnostic database client powered by Drizzle ORM.
 *
 * Supports Neon, Supabase, AWS RDS, and local Docker Postgres.
 * Auto-detects provider from the connection string.
 *
 * @example
 * ```ts
 * import { createDatabase } from '@jamaalbuilds/ai-toolkit/database';
 *
 * // Auto-detect provider from DATABASE_URL
 * const database = createDatabase();
 *
 * // Explicit Neon serverless for edge environments
 * const database = createDatabase({ driver: 'neon-http' });
 *
 * // Local Docker with SSL disabled
 * const database = createDatabase({
 *   connectionString: 'postgresql://postgres:password@localhost:5432/mydb',
 *   ssl: false,
 * });
 * ```
 */
export async function createDatabase(
	config?: DatabaseConfig,
): Promise<DatabaseClient> {
	const connectionString = config?.connectionString ?? process.env.DATABASE_URL;

	if (!connectionString) {
		throw new ValidationError(
			"DATABASE_URL not set. Provide connectionString or set DATABASE_URL env var.",
			{
				code: "DATABASE_NO_CONNECTION",
				fields: { connectionString: "required" },
			},
		);
	}

	const provider = config?.provider ?? detectProvider(connectionString);
	const ssl = config?.ssl ?? defaultSsl(provider);
	const driver = config?.driver ?? defaultDriver(provider);

	let result: DriverResult;

	try {
		switch (driver) {
			case "neon-http":
				result = await loadNeonHttp(
					connectionString,
					config?.schema,
					config?.logger,
				);
				break;
			case "neon-serverless":
				result = await loadNeonServerless(
					connectionString,
					config?.schema,
					config?.logger,
				);
				break;
			default:
				result = await loadPostgresJs(
					connectionString,
					ssl,
					config?.schema,
					config?.logger,
				);
				break;
		}
	} catch (err) {
		if (err instanceof ToolkitError) throw err;
		throw new ToolkitError(
			`Failed to initialize database: ${err instanceof Error ? err.message : String(err)}`,
			{
				code: "DATABASE_INIT_FAILED",
				statusCode: 500,
				cause: err instanceof Error ? err : undefined,
			},
		);
	}

	return {
		db: result.db,
		provider,
		driver: result.driver,

		async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
			try {
				const rows = await result.rawQuery(sql, params);
				return rows as T[];
			} catch (err) {
				throw new ToolkitError(
					`Query failed: ${err instanceof Error ? err.message : String(err)}`,
					{
						code: "DATABASE_QUERY_FAILED",
						statusCode: 500,
						retryable: true,
						cause: err instanceof Error ? err : undefined,
					},
				);
			}
		},

		async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
			try {
				const rows = await result.rawQuery(sql, params);
				return (rows[0] as T) ?? null;
			} catch (err) {
				throw new ToolkitError(
					`Query failed: ${err instanceof Error ? err.message : String(err)}`,
					{
						code: "DATABASE_QUERY_FAILED",
						statusCode: 500,
						retryable: true,
						cause: err instanceof Error ? err : undefined,
					},
				);
			}
		},

		async withTenant<T>(
			orgId: string,
			sql: string,
			params?: unknown[],
		): Promise<T[]> {
			const allParams = [...(params ?? []), orgId];
			const paramIndex = allParams.length;

			const upperSql = sql.toUpperCase();
			const separator = upperSql.includes("WHERE") ? " AND" : " WHERE";
			const scopedSql = `${sql}${separator} org_id = $${paramIndex}`;

			try {
				const rows = await result.rawQuery(scopedSql, allParams);
				return rows as T[];
			} catch (err) {
				throw new ToolkitError(
					`Query failed: ${err instanceof Error ? err.message : String(err)}`,
					{
						code: "DATABASE_QUERY_FAILED",
						statusCode: 500,
						retryable: true,
						cause: err instanceof Error ? err : undefined,
					},
				);
			}
		},

		async end(): Promise<void> {
			try {
				await result.end();
			} catch (err) {
				throw new ToolkitError(
					`Failed to close database connection: ${err instanceof Error ? err.message : String(err)}`,
					{
						code: "DATABASE_CLOSE_FAILED",
						statusCode: 500,
						cause: err instanceof Error ? err : undefined,
					},
				);
			}
		},
	};
}
