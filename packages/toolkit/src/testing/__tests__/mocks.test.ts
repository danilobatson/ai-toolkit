import { describe, expect, it } from "vitest";
import { mockCache, mockDb, mockLLM } from "../mocks.js";

describe("mockLLM", () => {
	it("returns mock that responds with configured response", async () => {
		const llm = mockLLM({ response: "Hello world" });
		const result = await llm.complete("test");
		expect(result.content).toBe("Hello world");
	});

	it("does not make external calls", async () => {
		const llm = mockLLM();
		const result = await llm.complete("test");
		expect(result.provider).toBe("mock");
	});
});

describe("mockCache", () => {
	it("returns functional in-memory cache", async () => {
		const cache = mockCache();
		await cache.set("key", "value");
		const result = await cache.get("key");
		expect(result).toBe("value");
	});

	it("tracks calls", async () => {
		const cache = mockCache();
		await cache.get("foo");
		expect(cache._calls).toHaveLength(1);
		expect(cache._calls[0].method).toBe("get");
	});
});

describe("mockDb", () => {
	it("returns mock with query method", async () => {
		const db = mockDb([{ id: 1, name: "test" }]);
		const rows = await db.query("SELECT * FROM test");
		expect(rows).toEqual([{ id: 1, name: "test" }]);
	});

	it("tracks queries", async () => {
		const db = mockDb();
		await db.query("SELECT 1", [42]);
		expect(db._queries).toHaveLength(1);
		expect(db._queries[0].sql).toBe("SELECT 1");
		expect(db._queries[0].params).toEqual([42]);
	});

	it("does not make external calls", async () => {
		const db = mockDb();
		const rows = await db.query("SELECT 1");
		expect(rows).toEqual([]);
	});
});
