import { afterEach, describe, expect, it, vi } from "vitest";
import { createCache, MemoryCacheAdapter } from "../client.js";

describe("MemoryCacheAdapter", () => {
	it("creates with createCache when no redisUrl", () => {
		const cache = createCache();
		expect(cache).toBeInstanceOf(MemoryCacheAdapter);
	});

	it("set and get round-trip correctly", async () => {
		const cache = new MemoryCacheAdapter();
		await cache.set("key1", { name: "Danilo" });
		const result = await cache.get<{ name: string }>("key1");
		expect(result).toEqual({ name: "Danilo" });
	});

	it("get returns null for missing key", async () => {
		const cache = new MemoryCacheAdapter();
		const result = await cache.get("nonexistent");
		expect(result).toBeNull();
	});

	it("invalidate removes key", async () => {
		const cache = new MemoryCacheAdapter();
		await cache.set("key1", "value");
		await cache.invalidate("key1");
		const result = await cache.get("key1");
		expect(result).toBeNull();
	});

	it("expires entries after TTL", async () => {
		vi.useFakeTimers();
		try {
			const cache = new MemoryCacheAdapter();
			await cache.set("key1", "value", { ttl: 1 });

			const before = await cache.get("key1");
			expect(before).toBe("value");

			vi.advanceTimersByTime(1500);

			const after = await cache.get("key1");
			expect(after).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("invalidatePrefix removes matching keys", async () => {
		const cache = new MemoryCacheAdapter();
		await cache.set("user:1", "a");
		await cache.set("user:2", "b");
		await cache.set("post:1", "c");
		await cache.invalidatePrefix("user:");
		expect(await cache.get("user:1")).toBeNull();
		expect(await cache.get("user:2")).toBeNull();
		expect(await cache.get("post:1")).toBe("c");
	});
});
