import { describe, expect, it } from "vitest";
import { ToolkitError } from "../../errors/base.js";
import { ValidationError } from "../../errors/types.js";
import type { DatabaseClient } from "../types.js";
import { vectorSearch, vectorSearchRaw } from "../vector.js";

/** Minimal mock DatabaseClient for vector tests. */
function mockDatabaseClient(
	queryResult: Record<string, unknown>[] = [],
): DatabaseClient {
	return {
		db: {},
		provider: "local",
		driver: "postgres-js",
		async query<T>(_sql: string, _params?: unknown[]): Promise<T[]> {
			return queryResult as T[];
		},
		async queryOne<T>(_sql: string, _params?: unknown[]): Promise<T | null> {
			return (queryResult[0] as T) ?? null;
		},
		async withTenant<T>(
			_orgId: string,
			_sql: string,
			_params?: unknown[],
		): Promise<T[]> {
			return queryResult as T[];
		},
		async end(): Promise<void> {},
	};
}

describe("vectorSearchRaw", () => {
	// ─── LEVEL 1: CRASH ─────────────────────────────────────────────────

	it("throws ValidationError for empty queryVector", async () => {
		const db = mockDatabaseClient();
		await expect(
			vectorSearchRaw(db, {
				table: "documents",
				column: "embedding",
				queryVector: [],
			}),
		).rejects.toThrow(/non-empty/i);

		try {
			await vectorSearchRaw(db, {
				table: "documents",
				column: "embedding",
				queryVector: [],
			});
		} catch (err) {
			expect(err).toBeInstanceOf(ValidationError);
			expect((err as ValidationError).code).toBe("DATABASE_INVALID_VECTOR");
		}
	});

	// ─── LEVEL 2: BEHAVIOR ──────────────────────────────────────────────

	it("returns results with similarity scores", async () => {
		const mockRows = [
			{ id: 1, content: "hello", similarity: 0.95 },
			{ id: 2, content: "world", similarity: 0.82 },
		];
		const db = mockDatabaseClient(mockRows);
		const results = await vectorSearchRaw(db, {
			table: "documents",
			column: "embedding",
			queryVector: [0.1, 0.2, 0.3],
		});

		expect(results).toHaveLength(2);
		expect(results[0].similarity).toBe(0.95);
		expect(results[0].data).toEqual({ id: 1, content: "hello" });
		expect(results[1].similarity).toBe(0.82);
		expect(results[1].data).toEqual({ id: 2, content: "world" });
	});

	it("returns empty array when no matches", async () => {
		const db = mockDatabaseClient([]);
		const results = await vectorSearchRaw(db, {
			table: "documents",
			column: "embedding",
			queryVector: [0.1, 0.2],
		});
		expect(results).toEqual([]);
	});

	// ─── LEVEL 3: DATA QUALITY ──────────────────────────────────────────

	it("separates similarity from data in results", async () => {
		const db = mockDatabaseClient([{ id: 1, name: "test", similarity: 0.9 }]);
		const results = await vectorSearchRaw(db, {
			table: "test_table",
			column: "vec",
			queryVector: [1, 2, 3],
		});

		expect(results[0].data).not.toHaveProperty("similarity");
		expect(results[0].similarity).toBe(0.9);
	});

	it("defaults limit to 10", async () => {
		const queries: { sql: string; params?: unknown[] }[] = [];
		const db: DatabaseClient = {
			...mockDatabaseClient(),
			async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
				queries.push({ sql, params });
				return [] as T[];
			},
		};

		await vectorSearchRaw(db, {
			table: "docs",
			column: "embedding",
			queryVector: [0.1],
		});

		expect(queries[0].params?.[2]).toBe(10);
	});

	it("defaults threshold to 0", async () => {
		const queries: { sql: string; params?: unknown[] }[] = [];
		const db: DatabaseClient = {
			...mockDatabaseClient(),
			async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
				queries.push({ sql, params });
				return [] as T[];
			},
		};

		await vectorSearchRaw(db, {
			table: "docs",
			column: "embedding",
			queryVector: [0.1],
		});

		expect(queries[0].params?.[1]).toBe(0);
	});

	// ─── LEVEL 4: ENVIRONMENT ───────────────────────────────────────────

	it("uses cosine distance operator by default", async () => {
		const queries: { sql: string }[] = [];
		const db: DatabaseClient = {
			...mockDatabaseClient(),
			async query<T>(sql: string, _params?: unknown[]): Promise<T[]> {
				queries.push({ sql });
				return [] as T[];
			},
		};

		await vectorSearchRaw(db, {
			table: "docs",
			column: "embedding",
			queryVector: [0.1],
		});

		expect(queries[0].sql).toContain("<=>");
	});

	it("uses L2 distance operator when metric is l2", async () => {
		const queries: { sql: string }[] = [];
		const db: DatabaseClient = {
			...mockDatabaseClient(),
			async query<T>(sql: string, _params?: unknown[]): Promise<T[]> {
				queries.push({ sql });
				return [] as T[];
			},
		};

		await vectorSearchRaw(db, {
			table: "docs",
			column: "embedding",
			queryVector: [0.1],
			metric: "l2",
		});

		expect(queries[0].sql).toContain("<->");
	});

	it("uses inner product operator when metric is innerProduct", async () => {
		const queries: { sql: string }[] = [];
		const db: DatabaseClient = {
			...mockDatabaseClient(),
			async query<T>(sql: string, _params?: unknown[]): Promise<T[]> {
				queries.push({ sql });
				return [] as T[];
			},
		};

		await vectorSearchRaw(db, {
			table: "docs",
			column: "embedding",
			queryVector: [0.1],
			metric: "innerProduct",
		});

		expect(queries[0].sql).toContain("<#>");
	});

	it("formats vector as pgvector string", async () => {
		const queries: { params?: unknown[] }[] = [];
		const db: DatabaseClient = {
			...mockDatabaseClient(),
			async query<T>(_sql: string, params?: unknown[]): Promise<T[]> {
				queries.push({ params });
				return [] as T[];
			},
		};

		await vectorSearchRaw(db, {
			table: "docs",
			column: "embedding",
			queryVector: [0.1, 0.2, 0.3],
		});

		expect(queries[0].params?.[0]).toBe("[0.1,0.2,0.3]");
	});

	it("respects custom select columns", async () => {
		const queries: { sql: string }[] = [];
		const db: DatabaseClient = {
			...mockDatabaseClient(),
			async query<T>(sql: string, _params?: unknown[]): Promise<T[]> {
				queries.push({ sql });
				return [] as T[];
			},
		};

		await vectorSearchRaw(db, {
			table: "docs",
			column: "embedding",
			queryVector: [0.1],
			select: ["id", "content"],
		});

		expect(queries[0].sql).toContain("id, content");
	});

	// ─── LEVEL 5: PATTERN ───────────────────────────────────────────────

	it("never throws raw Error — always ToolkitError or subclass", async () => {
		const db = mockDatabaseClient();
		try {
			await vectorSearchRaw(db, {
				table: "docs",
				column: "embedding",
				queryVector: [],
			});
		} catch (err) {
			expect(err).toBeInstanceOf(ToolkitError);
		}
	});

	// ─── LEVEL 6: CONTRACT ──────────────────────────────────────────────

	it("vectorSearchRaw is async (returns Promise)", () => {
		const db = mockDatabaseClient();
		const result = vectorSearchRaw(db, {
			table: "docs",
			column: "embedding",
			queryVector: [0.1],
		});
		expect(result).toBeInstanceOf(Promise);
		result.catch(() => {});
	});

	it("accepts custom limit and threshold", async () => {
		const queries: { params?: unknown[] }[] = [];
		const db: DatabaseClient = {
			...mockDatabaseClient(),
			async query<T>(_sql: string, params?: unknown[]): Promise<T[]> {
				queries.push({ params });
				return [] as T[];
			},
		};

		await vectorSearchRaw(db, {
			table: "docs",
			column: "embedding",
			queryVector: [0.1],
			threshold: 0.7,
			limit: 5,
		});

		expect(queries[0].params?.[1]).toBe(0.7);
		expect(queries[0].params?.[2]).toBe(5);
	});

	// ─── SQL Injection Prevention ──────────────────────────────────────

	it("rejects table name with SQL injection", async () => {
		const db = mockDatabaseClient();
		await expect(
			vectorSearchRaw(db, {
				table: "documents; DROP TABLE users",
				column: "embedding",
				queryVector: [0.1],
			}),
		).rejects.toThrow(/invalid table/i);
	});

	it("rejects column name with spaces", async () => {
		const db = mockDatabaseClient();
		await expect(
			vectorSearchRaw(db, {
				table: "documents",
				column: "embedding col",
				queryVector: [0.1],
			}),
		).rejects.toThrow(/invalid column/i);
	});

	it("rejects select field with injection", async () => {
		const db = mockDatabaseClient();
		await expect(
			vectorSearchRaw(db, {
				table: "documents",
				column: "embedding",
				queryVector: [0.1],
				select: ["id", "1; DROP TABLE users"],
			}),
		).rejects.toThrow(/invalid select field/i);
	});

	it("allows valid identifiers", async () => {
		const db = mockDatabaseClient();
		const results = await vectorSearchRaw(db, {
			table: "my_documents",
			column: "embedding_col",
			queryVector: [0.1],
			select: ["id", "content", "_meta"],
		});
		expect(results).toEqual([]);
	});
});

describe("vectorSearch (Drizzle-based)", () => {
	// ─── LEVEL 1: CRASH ─────────────────────────────────────────────────

	it("throws ValidationError for empty queryVector", async () => {
		const db = mockDatabaseClient();
		await expect(
			vectorSearch(db, {
				table: {},
				column: {},
				queryVector: [],
			}),
		).rejects.toThrow(/non-empty/i);

		try {
			await vectorSearch(db, {
				table: {},
				column: {},
				queryVector: [],
			});
		} catch (err) {
			expect(err).toBeInstanceOf(ValidationError);
			expect((err as ValidationError).code).toBe("DATABASE_INVALID_VECTOR");
		}
	});

	it("throws ValidationError for limit < 1", async () => {
		const db = mockDatabaseClient();
		await expect(
			vectorSearch(db, {
				table: {},
				column: {},
				queryVector: [0.1],
				limit: 0,
			}),
		).rejects.toThrow(/limit must be >= 1/i);
	});

	it("throws ToolkitError when drizzle-orm not installed", async () => {
		const db = mockDatabaseClient();
		// drizzle-orm is not installed in dev, so this will throw
		try {
			await vectorSearch(db, {
				table: {},
				column: {},
				queryVector: [0.1, 0.2],
			});
		} catch (err) {
			expect(err).toBeInstanceOf(ToolkitError);
			expect((err as ToolkitError).code).toBe("DATABASE_MISSING_DEPENDENCY");
		}
	});

	// ─── LEVEL 5: PATTERN ───────────────────────────────────────────────

	it("never throws raw Error", async () => {
		const db = mockDatabaseClient();
		try {
			await vectorSearch(db, {
				table: {},
				column: {},
				queryVector: [],
			});
		} catch (err) {
			expect(err).toBeInstanceOf(ToolkitError);
		}
	});
});
