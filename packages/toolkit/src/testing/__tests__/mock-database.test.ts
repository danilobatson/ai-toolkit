import { describe, expect, it } from "vitest";
import { mockDatabase } from "../mocks.js";

describe("mockDatabase", () => {
	it("CRASH — does not throw on creation with no args", () => {
		expect(() => mockDatabase()).not.toThrow();
	});

	it("CRASH — does not throw on creation with rows", () => {
		expect(() => mockDatabase([{ id: 1 }])).not.toThrow();
	});

	it("BEHAVIOR — query returns provided rows", async () => {
		const rows = [
			{ id: 1, content: "hello" },
			{ id: 2, content: "world" },
		];
		const db = mockDatabase(rows);
		const result = await db.query("SELECT * FROM docs");
		expect(result).toEqual(rows);
	});

	it("BEHAVIOR — query returns empty array when no rows provided", async () => {
		const db = mockDatabase();
		const result = await db.query("SELECT 1");
		expect(result).toEqual([]);
	});

	it("BEHAVIOR — queryOne returns first row", async () => {
		const db = mockDatabase([{ id: 1, name: "Alice" }]);
		const result = await db.queryOne("SELECT * FROM users WHERE id = $1", [1]);
		expect(result).toEqual({ id: 1, name: "Alice" });
	});

	it("BEHAVIOR — queryOne returns null when no rows", async () => {
		const db = mockDatabase();
		const result = await db.queryOne("SELECT * FROM users WHERE id = $1", [99]);
		expect(result).toBeNull();
	});

	it("BEHAVIOR — withTenant scopes query with org_id", async () => {
		const db = mockDatabase([{ id: 1 }]);
		await db.withTenant("org_abc", "SELECT * FROM docs");

		expect(db._queries).toHaveLength(1);
		expect(db._queries[0].sql).toContain("org_id");
		expect(db._queries[0].params).toContain("org_abc");
	});

	it("BEHAVIOR — withTenant appends AND when WHERE exists", async () => {
		const db = mockDatabase([{ id: 1 }]);
		await db.withTenant("org_abc", "SELECT * FROM docs WHERE active = $1", [
			true,
		]);

		expect(db._queries[0].sql).toContain("AND org_id");
		expect(db._queries[0].params).toEqual([true, "org_abc"]);
	});

	it("BEHAVIOR — withTenant appends WHERE when no WHERE clause", async () => {
		const db = mockDatabase([{ id: 1 }]);
		await db.withTenant("org_abc", "SELECT * FROM docs");

		expect(db._queries[0].sql).toContain("WHERE org_id");
	});

	it("BEHAVIOR — tracks all queries across methods", async () => {
		const db = mockDatabase([{ id: 1 }]);

		await db.query("SELECT 1");
		await db.queryOne("SELECT 2");
		await db.withTenant("org_1", "SELECT 3");

		expect(db._queries).toHaveLength(3);
	});

	it("BEHAVIOR — end resolves without error", async () => {
		const db = mockDatabase();
		await expect(db.end()).resolves.toBeUndefined();
	});

	it("DATA QUALITY — exposes db, provider, and driver fields", () => {
		const db = mockDatabase();
		expect(db.db).toBeDefined();
		expect(db.provider).toBe("local");
		expect(db.driver).toBe("postgres-js");
	});

	it("DATA QUALITY — query preserves param types", async () => {
		const db = mockDatabase();
		await db.query("SELECT * FROM users WHERE id = $1 AND active = $2", [
			42,
			true,
		]);

		expect(db._queries[0].params).toEqual([42, true]);
	});

	it("ENVIRONMENT — handles undefined params gracefully", async () => {
		const db = mockDatabase();
		await db.query("SELECT 1");
		expect(db._queries[0].params).toBeUndefined();
	});

	it("ENVIRONMENT — withTenant handles undefined params", async () => {
		const db = mockDatabase([{ id: 1 }]);
		await db.withTenant("org_abc", "SELECT * FROM docs");

		expect(db._queries[0].params).toEqual(["org_abc"]);
	});

	it("CONTRACT — implements DatabaseClient interface shape", () => {
		const db = mockDatabase();

		// All required methods exist
		expect(typeof db.query).toBe("function");
		expect(typeof db.queryOne).toBe("function");
		expect(typeof db.withTenant).toBe("function");
		expect(typeof db.end).toBe("function");

		// Required properties exist
		expect(db).toHaveProperty("db");
		expect(db).toHaveProperty("provider");
		expect(db).toHaveProperty("driver");
		expect(db).toHaveProperty("_queries");
	});
});
