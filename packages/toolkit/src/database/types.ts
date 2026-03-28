/**
 * Database module types — configuration, client interface, and vector search.
 */

// ─── Provider Config ────────────────────────────────────────────────────────

/**
 * Supported database provider identifiers.
 *
 * @example
 * ```ts
 * const provider: DatabaseProvider = 'neon';
 * ```
 */
export type DatabaseProvider = "neon" | "supabase" | "aws-rds" | "local";

/**
 * Drizzle driver to use for the connection.
 *
 * @example
 * ```ts
 * const driver: DatabaseDriver = 'postgres-js';
 * ```
 */
export type DatabaseDriver = "postgres-js" | "neon-http" | "neon-serverless";

/**
 * Configuration for the database client.
 *
 * @example
 * ```ts
 * const config: DatabaseConfig = {
 *   connectionString: 'postgresql://user:pass@localhost:5432/mydb',
 *   provider: 'local',
 *   ssl: false,
 * };
 * const db = await createDatabase(config);
 * ```
 */
export interface DatabaseConfig {
	/** Postgres connection string. Default: process.env.DATABASE_URL */
	connectionString?: string;
	/** Database provider hint. Default: auto-detected from connection string. */
	provider?: DatabaseProvider;
	/**
	 * Drizzle driver to use.
	 * - "postgres-js" — universal TCP driver (works everywhere). Default.
	 * - "neon-http" — Neon serverless HTTP (single queries, edge-compatible).
	 * - "neon-serverless" — Neon serverless WebSocket (transactions, edge-compatible).
	 */
	driver?: DatabaseDriver;
	/** Enable SSL. Default: true for remote providers, false for local. */
	ssl?: boolean;
	/** Drizzle schema object for typed queries. */
	schema?: Record<string, unknown>;
	/** Enable Drizzle logger. Default: false. */
	logger?: boolean;
}

// ─── Vector Search ──────────────────────────────────────────────────────────

/**
 * Distance metric for vector similarity search.
 *
 * @example
 * ```ts
 * const metric: DistanceMetric = 'cosine';
 * ```
 */
export type DistanceMetric = "cosine" | "l2" | "innerProduct";

/**
 * Options for vector similarity search.
 *
 * @example
 * ```ts
 * const options: VectorSearchOptions = {
 *   queryVector: [0.1, 0.2, 0.3],
 *   threshold: 0.7,
 *   limit: 10,
 *   metric: 'cosine',
 * };
 * ```
 */
export interface VectorSearchOptions {
	/** The embedding vector to search against. */
	queryVector: number[];
	/** Similarity threshold (0-1 for cosine). Results below this are excluded. */
	threshold?: number;
	/** Maximum number of results to return. Default: 10. */
	limit?: number;
	/** Distance metric. Default: "cosine". */
	metric?: DistanceMetric;
}

/**
 * A single vector search result.
 *
 * @example
 * ```ts
 * const results: VectorSearchResult<{ id: number; content: string }>[] = await vectorSearch(db, options);
 * for (const { data, similarity } of results) {
 *   console.log(`${data.content} (score: ${similarity})`);
 * }
 * ```
 */
export interface VectorSearchResult<T = Record<string, unknown>> {
	/** The matched row data. */
	data: T;
	/** Similarity score (higher = more similar, 0-1 for cosine). */
	similarity: number;
}

// ─── Migration ──────────────────────────────────────────────────────────────

/**
 * Options for programmatic migration.
 *
 * @example
 * ```ts
 * const options: MigrateOptions = {
 *   migrationsFolder: './drizzle',
 *   connectionString: process.env.DATABASE_URL,
 * };
 * const result = await migrate(options);
 * ```
 */
export interface MigrateOptions {
	/** Path to the migrations folder. Default: "./drizzle". */
	migrationsFolder?: string;
	/** Postgres connection string. Default: process.env.DATABASE_URL */
	connectionString?: string;
}

/**
 * Result of a migration run.
 *
 * @example
 * ```ts
 * const result: MigrateResult = await migrate();
 * console.log(`Applied ${result.appliedCount} migrations`);
 * ```
 */
export interface MigrateResult {
	/** Whether migrations were applied successfully. */
	success: boolean;
	/** Number of migrations applied (0 if already up to date). */
	appliedCount: number;
}

// ─── Database Client ────────────────────────────────────────────────────────

/**
 * The database client interface returned by createDatabase().
 *
 * @example
 * ```ts
 * const db: DatabaseClient = await createDatabase();
 * const users = await db.query<User>('SELECT * FROM users');
 * await db.end();
 * ```
 */
export interface DatabaseClient {
	/** The underlying Drizzle ORM instance for typed queries. */
	readonly db: unknown;
	/** The detected or configured provider. */
	readonly provider: DatabaseProvider;
	/** The driver in use. */
	readonly driver: DatabaseDriver;

	/**
	 * Run a parameterized SQL query.
	 *
	 * @example
	 * ```ts
	 * const rows = await database.query<User>('SELECT * FROM users WHERE org_id = $1', [orgId]);
	 * ```
	 */
	query<T = Record<string, unknown>>(
		sql: string,
		params?: unknown[],
	): Promise<T[]>;

	/**
	 * Run a query and return the first row, or null.
	 *
	 * @example
	 * ```ts
	 * const user = await database.queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
	 * ```
	 */
	queryOne<T = Record<string, unknown>>(
		sql: string,
		params?: unknown[],
	): Promise<T | null>;

	/**
	 * Execute a query with automatic tenant isolation.
	 * Appends WHERE org_id = $N (or AND org_id = $N) to the query.
	 *
	 * @example
	 * ```ts
	 * const docs = await database.withTenant(orgId, 'SELECT * FROM documents');
	 * ```
	 */
	withTenant<T = Record<string, unknown>>(
		orgId: string,
		sql: string,
		params?: unknown[],
	): Promise<T[]>;

	/** Close the connection pool. */
	end(): Promise<void>;
}
