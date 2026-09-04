import { describe, expect, it, vi } from "vitest";
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

	describe("incr", () => {
		it("BEHAVIOR — starts at 1 and increments sequentially", async () => {
			const cache = new MemoryCacheAdapter();
			expect(await cache.incr("counter")).toBe(1);
			expect(await cache.incr("counter")).toBe(2);
			expect(await cache.incr("counter")).toBe(3);
		});

		it("BEHAVIOR — ten concurrent increments produce exactly 1..10, no lost updates", async () => {
			const cache = new MemoryCacheAdapter();
			const results = await Promise.all(
				Array.from({ length: 10 }, () => cache.incr("concurrent")),
			);
			expect(results.sort((a, b) => a - b)).toEqual([
				1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
			]);
		});

		it("ENVIRONMENT — resets to 1 after TTL expires", async () => {
			vi.useFakeTimers();
			try {
				const cache = new MemoryCacheAdapter();
				await cache.incr("expiring", { ttl: 1 });
				vi.advanceTimersByTime(1500);
				expect(await cache.incr("expiring", { ttl: 1 })).toBe(1);
			} finally {
				vi.useRealTimers();
			}
		});

		it("CONTRACT — later increments do not extend the original TTL", async () => {
			vi.useFakeTimers();
			try {
				const cache = new MemoryCacheAdapter();
				await cache.incr("fixed-window", { ttl: 10 });
				vi.advanceTimersByTime(5000);
				await cache.incr("fixed-window", { ttl: 10 });
				vi.advanceTimersByTime(5500);
				// Original 10s window has elapsed — counter should have reset.
				expect(await cache.incr("fixed-window", { ttl: 10 })).toBe(1);
			} finally {
				vi.useRealTimers();
			}
		});
	});
});
