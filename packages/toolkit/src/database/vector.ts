/**
 * Vector search — pgvector similarity search powered by Drizzle ORM.
 *
 * Provides cosine, L2, and inner-product distance functions
 * for semantic search over embedding columns.
 *
 * Requires drizzle-orm and pgvector extension enabled in Postgres.
 *
 * @example
 * ```ts
 * import { createDatabase, vectorSearch } from '@jamaalbuilds/ai-toolkit/database';
 * import { documents } from './schema';
 *
 * const database = await createDatabase();
 * const results = await vectorSearch(database, {
 *   table: documents,
 *   column: documents.embedding,
 *   queryVector: [0.1, 0.2, ...],
 *   threshold: 0.7,
 *   limit: 5,
 * });
 * // → [{ data: { id: 1, content: '...' }, similarity: 0.92 }, ...]
 * ```
 */

import { ToolkitError, ValidationError } from "../errors/index.js";
import type {
	DatabaseClient,
	DistanceMetric,
	VectorSearchResult,
} from "./types.js";

// ─── Identifier Validation ────────────────────────────────────────────────

function validateIdentifier(name: string, label: string): void {
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
		throw new ValidationError(
			`Invalid ${label}: must be alphanumeric/underscore`,
			{
				code: "DATABASE_INVALID_IDENTIFIER",
				fields: { [label]: "must match /^[a-zA-Z_][a-zA-Z0-9_]*$/" },
			},
		);
	}
}

// Import paths as variables to prevent TS from resolving peer deps
const DRIZZLE_PG_CORE_PATH = "drizzle-orm/pg-core";
const DRIZZLE_ORM_PATH = "drizzle-orm";

// ─── Vector Column Helper ──────────────────────────────────────────────────

/**
 * Re-exports Drizzle's vector column type for use in schema definitions.
 *
 * @example
 * ```ts
 * import { getVectorColumn } from '@jamaalbuilds/ai-toolkit/database';
 * import { pgTable, serial, text } from 'drizzle-orm/pg-core';
 *
 * const vector = await getVectorColumn();
 * export const documents = pgTable('documents', {
 *   id: serial('id').primaryKey(),
 *   content: text('content').notNull(),
 *   embedding: vector('embedding', { dimensions: 1536 }),
 * });
 * ```
 */
export async function getVectorColumn(): Promise<
	(name: string, config: { dimensions: number }) => unknown
> {
	try {
		const mod = await import(DRIZZLE_PG_CORE_PATH);
		return mod.vector as (
			name: string,
			config: { dimensions: number },
		) => unknown;
	} catch {
		throw new ToolkitError(
			"drizzle-orm not found. Install: yarn add drizzle-orm",
			{ code: "DATABASE_MISSING_DEPENDENCY", statusCode: 500 },
		);
	}
}

// ─── Distance Functions ────────────────────────────────────────────────────

interface DistanceFunctions {
	cosineDistance: (column: unknown, vector: number[]) => unknown;
	l2Distance: (column: unknown, vector: number[]) => unknown;
	innerProduct: (column: unknown, vector: number[]) => unknown;
}

async function loadDistanceFunctions(): Promise<DistanceFunctions> {
	try {
		const mod = await import(DRIZZLE_ORM_PATH);
		return {
			cosineDistance: mod.cosineDistance as DistanceFunctions["cosineDistance"],
			l2Distance: mod.l2Distance as DistanceFunctions["l2Distance"],
			innerProduct: mod.innerProduct as DistanceFunctions["innerProduct"],
		};
	} catch {
		throw new ToolkitError(
			"drizzle-orm not found. Install: yarn add drizzle-orm",
			{ code: "DATABASE_MISSING_DEPENDENCY", statusCode: 500 },
		);
	}
}

// ─── Drizzle Helpers ──────────────────────────────────────────────────────

interface DrizzleHelpers {
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => unknown;
	desc: (column: unknown) => unknown;
	gt: (column: unknown, value: unknown) => unknown;
}

async function loadDrizzleHelpers(): Promise<DrizzleHelpers> {
	try {
		const mod = await import(DRIZZLE_ORM_PATH);
		return {
			sql: mod.sql as DrizzleHelpers["sql"],
			desc: mod.desc as DrizzleHelpers["desc"],
			gt: mod.gt as DrizzleHelpers["gt"],
		};
	} catch {
		throw new ToolkitError(
			"drizzle-orm not found. Install: yarn add drizzle-orm",
			{ code: "DATABASE_MISSING_DEPENDENCY", statusCode: 500 },
		);
	}
}

function getDistanceExpression(
	distanceFns: DistanceFunctions,
	metric: DistanceMetric,
	column: unknown,
	queryVector: number[],
): unknown {
	switch (metric) {
		case "l2":
			return distanceFns.l2Distance(column, queryVector);
		case "innerProduct":
			return distanceFns.innerProduct(column, queryVector);
		default:
			return distanceFns.cosineDistance(column, queryVector);
	}
}

// ─── Vector Search Options ─────────────────────────────────────────────────

/**
 * Full options for vectorSearch including table/column references.
 *
 * @example
 * ```ts
 * const opts: VectorSearchTableOptions = {
 *   table: documents,
 *   column: documents.embedding,
 *   queryVector: [0.1, 0.2, 0.3],
 *   threshold: 0.7,
 *   limit: 5,
 * };
 * ```
 */
export interface VectorSearchTableOptions {
	/** The Drizzle table reference. */
	table: unknown;
	/** The vector column to search against. */
	column: unknown;
	/** The embedding vector to search for. */
	queryVector: number[];
	/** Similarity threshold (0-1 for cosine). Default: 0. */
	threshold?: number;
	/** Maximum number of results. Default: 10. */
	limit?: number;
	/** Distance metric. Default: "cosine". */
	metric?: DistanceMetric;
	/** Additional select columns. If omitted, selects all columns. */
	select?: Record<string, unknown>;
}

// ─── Vector Search ─────────────────────────────────────────────────────────

/**
 * Perform a vector similarity search using pgvector.
 *
 * Uses Drizzle's built-in distance functions for cosine, L2, or inner-product
 * similarity. Requires pgvector extension enabled in your Postgres database.
 *
 * @example
 * ```ts
 * import { createDatabase, vectorSearch } from '@jamaalbuilds/ai-toolkit/database';
 * import { documents } from './schema';
 *
 * const database = await createDatabase();
 * const results = await vectorSearch(database, {
 *   table: documents,
 *   column: documents.embedding,
 *   queryVector: queryEmbedding,
 *   threshold: 0.7,
 *   limit: 5,
 * });
 *
 * for (const { data, similarity } of results) {
 *   console.log(`${data.content} (score: ${similarity})`);
 * }
 * ```
 */
export async function vectorSearch<T = Record<string, unknown>>(
	database: DatabaseClient,
	options: VectorSearchTableOptions,
): Promise<VectorSearchResult<T>[]> {
	if (!options.queryVector || options.queryVector.length === 0) {
		throw new ValidationError("queryVector must be a non-empty number array", {
			code: "DATABASE_INVALID_VECTOR",
			fields: { queryVector: "required, non-empty number[]" },
		});
	}

	if (options.limit !== undefined && options.limit < 1) {
		throw new ValidationError("limit must be >= 1", {
			code: "DATABASE_INVALID_LIMIT",
			fields: { limit: "must be >= 1" },
		});
	}

	const metric = options.metric ?? "cosine";
	const threshold = options.threshold ?? 0;
	const limit = options.limit ?? 10;

	const distanceFns = await loadDistanceFunctions();
	const drizzleHelpers = await loadDrizzleHelpers();

	const distanceExpr = getDistanceExpression(
		distanceFns,
		metric,
		options.column,
		options.queryVector,
	);

	// For cosine distance: similarity = 1 - distance
	// For L2/innerProduct: negate for ordering (lower distance = more similar)
	const similarityExpr =
		metric === "cosine"
			? drizzleHelpers.sql`1 - (${distanceExpr as never})`
			: drizzleHelpers.sql`-(${distanceExpr as never})`;

	try {
		const db = database.db as {
			select(columns: Record<string, unknown>): {
				from(table: unknown): {
					where(condition: unknown): {
						orderBy(order: unknown): {
							limit(n: number): Promise<Record<string, unknown>[]>;
						};
					};
				};
			};
		};

		const selectColumns = {
			...(options.select ?? {}),
			similarity: similarityExpr,
		};

		const rows = await db
			.select(selectColumns)
			.from(options.table)
			.where(drizzleHelpers.gt(similarityExpr, threshold))
			.orderBy(drizzleHelpers.desc(similarityExpr))
			.limit(limit);

		return rows.map((row) => {
			const { similarity: sim, ...data } = row;
			return {
				data: data as T,
				similarity: Number(sim),
			};
		});
	} catch (err) {
		if (err instanceof ToolkitError) throw err;
		throw new ToolkitError(
			`Vector search failed: ${err instanceof Error ? err.message : String(err)}`,
			{
				code: "DATABASE_VECTOR_SEARCH_FAILED",
				statusCode: 500,
				retryable: true,
				cause: err instanceof Error ? err : undefined,
			},
		);
	}
}

// ─── Raw Vector Search (SQL) ───────────────────────────────────────────────

/**
 * Perform a raw SQL vector similarity search.
 *
 * For cases where you want to search without a Drizzle table definition.
 * Uses cosine distance by default.
 *
 * @example
 * ```ts
 * import { createDatabase, vectorSearchRaw } from '@jamaalbuilds/ai-toolkit/database';
 *
 * const database = await createDatabase();
 * const results = await vectorSearchRaw(database, {
 *   table: 'documents',
 *   column: 'embedding',
 *   queryVector: [0.1, 0.2, ...],
 *   select: ['id', 'content'],
 *   threshold: 0.7,
 *   limit: 5,
 * });
 * ```
 */
export async function vectorSearchRaw<T = Record<string, unknown>>(
	database: DatabaseClient,
	options: {
		table: string;
		column: string;
		queryVector: number[];
		select?: string[];
		threshold?: number;
		limit?: number;
		metric?: DistanceMetric;
	},
): Promise<VectorSearchResult<T>[]> {
	if (!options.queryVector || options.queryVector.length === 0) {
		throw new ValidationError("queryVector must be a non-empty number array", {
			code: "DATABASE_INVALID_VECTOR",
			fields: { queryVector: "required, non-empty number[]" },
		});
	}

	// Validate identifiers to prevent SQL injection
	validateIdentifier(options.table, "table");
	validateIdentifier(options.column, "column");
	if (options.select) {
		for (const field of options.select) {
			validateIdentifier(field, "select field");
		}
	}

	const metric = options.metric ?? "cosine";
	const threshold = options.threshold ?? 0;
	const limit = options.limit ?? 10;
	const selectCols = options.select?.join(", ") ?? "*";

	const distanceOp =
		metric === "cosine" ? "<=>" : metric === "l2" ? "<->" : "<#>";

	const similarityExpr =
		metric === "cosine"
			? `1 - (${options.column} <=> $1::vector)`
			: `-(${options.column} ${distanceOp} $1::vector)`;

	const sql = `
		SELECT ${selectCols}, ${similarityExpr} AS similarity
		FROM ${options.table}
		WHERE ${similarityExpr} > $2
		ORDER BY ${similarityExpr} DESC
		LIMIT $3
	`;

	const vectorStr = `[${options.queryVector.join(",")}]`;
	const rows = await database.query<Record<string, unknown>>(sql, [
		vectorStr,
		threshold,
		limit,
	]);

	return rows.map((row) => {
		const { similarity: sim, ...data } = row;
		return {
			data: data as T,
			similarity: Number(sim),
		};
	});
}
