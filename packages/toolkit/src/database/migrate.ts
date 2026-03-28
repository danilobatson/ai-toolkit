/**
 * Migrate — programmatic database migration runner.
 *
 * Runs Drizzle migrations from a folder against the database.
 * Uses a dedicated single-connection client for safety.
 *
 * @example
 * ```ts
 * import { migrate } from '@jamaalbuilds/ai-toolkit/database';
 *
 * const result = await migrate({ migrationsFolder: './drizzle' });
 * console.log(`Applied ${result.appliedCount} migrations`);
 * ```
 */

import { ToolkitError, ValidationError } from "../errors/index.js";
import type { MigrateOptions, MigrateResult } from "./types.js";

// Import paths as variables to prevent TS from resolving peer deps
const POSTGRES_PATH = "postgres";
const DRIZZLE_POSTGRES_JS_PATH = "drizzle-orm/postgres-js";
const DRIZZLE_MIGRATOR_PATH = "drizzle-orm/postgres-js/migrator";

/**
 * Run database migrations programmatically.
 *
 * Creates a dedicated single-connection client, applies all pending
 * migrations from the specified folder, then closes the connection.
 * Returns -1 for appliedCount (Drizzle migrator does not expose count).
 *
 * @example
 * ```ts
 * import { migrate } from '@jamaalbuilds/ai-toolkit/database';
 *
 * // Apply migrations from default folder
 * await migrate();
 *
 * // Custom migration folder and connection
 * await migrate({
 *   migrationsFolder: './db/migrations',
 *   connectionString: process.env.MIGRATION_DATABASE_URL,
 * });
 * ```
 */
export async function migrate(
	options?: MigrateOptions,
): Promise<MigrateResult> {
	const connectionString =
		options?.connectionString ?? process.env.DATABASE_URL;
	const migrationsFolder = options?.migrationsFolder ?? "./drizzle";

	if (!connectionString) {
		throw new ValidationError(
			"DATABASE_URL not set. Provide connectionString or set DATABASE_URL env var.",
			{
				code: "DATABASE_NO_CONNECTION",
				fields: { connectionString: "required" },
			},
		);
	}

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
	let drizzleMigrate: unknown;
	try {
		const dMod = await import(DRIZZLE_POSTGRES_JS_PATH);
		drizzleFactory = dMod.drizzle ?? dMod.default;
		const mMod = await import(DRIZZLE_MIGRATOR_PATH);
		drizzleMigrate = mMod.migrate;
	} catch {
		throw new ToolkitError(
			"drizzle-orm not found. Install: yarn add drizzle-orm",
			{ code: "DATABASE_MISSING_DEPENDENCY", statusCode: 500 },
		);
	}

	const postgres = postgresFactory as (
		url: string,
		opts?: Record<string, unknown>,
	) => { end(): Promise<void> };
	const drizzle = drizzleFactory as (client: unknown) => unknown;
	const runMigrate = drizzleMigrate as (
		db: unknown,
		config: { migrationsFolder: string },
	) => Promise<void>;

	// Single connection for migrations (required by Drizzle)
	const migrationClient = postgres(connectionString, { max: 1 });
	const db = drizzle(migrationClient);

	try {
		await runMigrate(db, { migrationsFolder });
		return { success: true, appliedCount: -1 };
	} catch (err) {
		throw new ToolkitError(
			`Migration failed: ${err instanceof Error ? err.message : String(err)}`,
			{
				code: "DATABASE_MIGRATION_FAILED",
				statusCode: 500,
				cause: err instanceof Error ? err : undefined,
			},
		);
	} finally {
		await migrationClient.end();
	}
}
