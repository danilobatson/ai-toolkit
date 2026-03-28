import Module from "node:module";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { CacheError } from "../../errors/types.js";

// Mock ioredis via Module._load since cache/client.ts uses require() (CJS)
// and vi.mock doesn't intercept native require() in ESM mode.
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockKeys = vi.fn();
const mockQuit = vi.fn();

const MockRedis = vi.fn().mockImplementation(() => ({
	get: mockGet,
	set: mockSet,
	del: mockDel,
	keys: mockKeys,
	quit: mockQuit,
}));

const originalLoad = Module._load;

beforeAll(() => {
	// @ts-expect-error — overriding internal API for test mocking
	Module._load = function (request: string, parent: unknown, isMain: boolean) {
		if (request === "ioredis") {
			return MockRedis;
		}
		return originalLoad.call(this, request, parent, isMain);
	};
});

afterAll(() => {
	Module._load = originalLoad;
});

beforeEach(() => {
	vi.clearAllMocks();
});

const { RedisCacheAdapter } = await import("../client.js");

describe("RedisCacheAdapter", () => {
	it("CRASH — does not throw on construction", () => {
		expect(() => new RedisCacheAdapter("redis://localhost:6379")).not.toThrow();
	});

	it("BEHAVIOR — get returns parsed JSON value", async () => {
		mockGet.mockResolvedValueOnce(JSON.stringify({ name: "Danilo" }));

		const cache = new RedisCacheAdapter("redis://localhost:6379");
		const result = await cache.get<{ name: string }>("user:1");

		expect(result).toEqual({ name: "Danilo" });
		expect(mockGet).toHaveBeenCalledWith("user:1");
	});

	it("BEHAVIOR — get returns null for missing key", async () => {
		mockGet.mockResolvedValueOnce(null);

		const cache = new RedisCacheAdapter("redis://localhost:6379");
		const result = await cache.get("nonexistent");

		expect(result).toBeNull();
	});

	it("BEHAVIOR — set serializes value and sets with TTL", async () => {
		mockSet.mockResolvedValueOnce("OK");

		const cache = new RedisCacheAdapter("redis://localhost:6379");
		await cache.set("key1", { data: "test" }, { ttl: 60 });

		expect(mockSet).toHaveBeenCalledWith(
			"key1",
			JSON.stringify({ data: "test" }),
			"EX",
			60,
		);
	});

	it("BEHAVIOR — set uses default TTL when not specified", async () => {
		mockSet.mockResolvedValueOnce("OK");

		const cache = new RedisCacheAdapter("redis://localhost:6379", {
			defaultTtl: 600,
		});
		await cache.set("key1", "value");

		expect(mockSet).toHaveBeenCalledWith("key1", '"value"', "EX", 600);
	});

	it("BEHAVIOR — invalidate deletes the key", async () => {
		mockDel.mockResolvedValueOnce(1);

		const cache = new RedisCacheAdapter("redis://localhost:6379");
		await cache.invalidate("key1");

		expect(mockDel).toHaveBeenCalledWith("key1");
	});

	it("BEHAVIOR — invalidatePrefix finds and deletes matching keys", async () => {
		mockKeys.mockResolvedValueOnce(["user:1", "user:2"]);
		mockDel.mockResolvedValueOnce(2);

		const cache = new RedisCacheAdapter("redis://localhost:6379");
		await cache.invalidatePrefix("user:");

		expect(mockKeys).toHaveBeenCalledWith("user:*");
		expect(mockDel).toHaveBeenCalledWith("user:1", "user:2");
	});

	it("BEHAVIOR — invalidatePrefix does not call del when no keys match", async () => {
		mockKeys.mockResolvedValueOnce([]);

		const cache = new RedisCacheAdapter("redis://localhost:6379");
		await cache.invalidatePrefix("nonexistent:");

		expect(mockKeys).toHaveBeenCalledWith("nonexistent:*");
		expect(mockDel).not.toHaveBeenCalled();
	});

	it("BEHAVIOR — disconnect calls quit", async () => {
		mockQuit.mockResolvedValueOnce("OK");

		const cache = new RedisCacheAdapter("redis://localhost:6379");
		await cache.disconnect();

		expect(mockQuit).toHaveBeenCalled();
	});

	it("ENVIRONMENT — get wraps Redis errors as CacheError", async () => {
		mockGet.mockRejectedValueOnce(new Error("ECONNREFUSED"));

		const cache = new RedisCacheAdapter("redis://localhost:6379");

		try {
			await cache.get("key1");
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(CacheError);
			expect((err as CacheError).code).toBe("CACHE_GET_FAILED");
			expect((err as CacheError).message).toMatch(/key1/);
		}
	});

	it("ENVIRONMENT — set wraps Redis errors as CacheError", async () => {
		mockSet.mockRejectedValueOnce(new Error("READONLY"));

		const cache = new RedisCacheAdapter("redis://localhost:6379");

		try {
			await cache.set("key1", "value");
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(CacheError);
			expect((err as CacheError).code).toBe("CACHE_SET_FAILED");
		}
	});

	it("ENVIRONMENT — invalidate wraps Redis errors as CacheError", async () => {
		mockDel.mockRejectedValueOnce(new Error("timeout"));

		const cache = new RedisCacheAdapter("redis://localhost:6379");

		try {
			await cache.invalidate("key1");
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(CacheError);
			expect((err as CacheError).code).toBe("CACHE_INVALIDATE_FAILED");
		}
	});

	it("ENVIRONMENT — invalidatePrefix wraps Redis errors as CacheError", async () => {
		mockKeys.mockRejectedValueOnce(new Error("cluster error"));

		const cache = new RedisCacheAdapter("redis://localhost:6379");

		try {
			await cache.invalidatePrefix("user:");
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(CacheError);
			expect((err as CacheError).code).toBe("CACHE_INVALIDATE_PREFIX_FAILED");
		}
	});

	it("DATA QUALITY — get preserves complex nested objects", async () => {
		const complex = { users: [{ id: 1, tags: ["admin"] }], count: 1 };
		mockGet.mockResolvedValueOnce(JSON.stringify(complex));

		const cache = new RedisCacheAdapter("redis://localhost:6379");
		const result = await cache.get("complex-key");

		expect(result).toEqual(complex);
	});
});
