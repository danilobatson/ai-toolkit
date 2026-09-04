import { afterEach, describe, expect, it, vi } from "vitest";
import { CacheError } from "../../errors/types.js";
import { RedisCacheAdapter } from "../client.js";

// Simulates the two ways loading `ioredis` can fail: the package genuinely
// cannot be resolved, vs. it resolves but throws while loading (e.g. a
// broken native binding). vi.mock("ioredis") in redis.test.ts only covers
// the "loads fine" path, so this file exercises both failure branches
// directly with vi.doMock.
//
// The factory itself must not throw — Vitest swallows a thrown factory and
// reports its own hoisting-related diagnostic instead of the thrown error,
// so failures are simulated via a `default` export whose constructor
// throws, which happens inside the same try block as the `import()` call.
afterEach(() => {
	vi.doUnmock("ioredis");
});

describe("RedisCacheAdapter — optional peer load failure", () => {
	it("ENVIRONMENT — reports CACHE_MISSING_DEPENDENCY when ioredis cannot be resolved", async () => {
		vi.doMock("ioredis", () => ({
			default: class {
				constructor() {
					const error = new Error(
						"Cannot find package 'ioredis' imported from client.js",
					) as Error & { code: string };
					error.code = "ERR_MODULE_NOT_FOUND";
					throw error;
				}
			},
		}));

		const cache = new RedisCacheAdapter("redis://localhost:6379");

		try {
			await cache.get("key1");
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(CacheError);
			expect((err as CacheError).code).toBe("CACHE_MISSING_DEPENDENCY");
			expect((err as CacheError).message).toMatch(/requires ioredis/i);
			expect((err as CacheError).cause).toBeInstanceOf(Error);
		}
	});

	it("ENVIRONMENT — preserves cause and skips install wording for an unrelated load failure", async () => {
		vi.doMock("ioredis", () => ({
			default: class {
				constructor() {
					throw new Error("segmentation fault in native binding");
				}
			},
		}));

		const cache = new RedisCacheAdapter("redis://localhost:6379");

		try {
			await cache.get("key1");
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(CacheError);
			expect((err as CacheError).code).toBe("CACHE_LOAD_FAILED");
			expect((err as CacheError).message).not.toMatch(/install/i);
			expect((err as CacheError).cause).toBeInstanceOf(Error);
			expect((err as CacheError).cause?.message).toMatch(
				/segmentation fault/i,
			);
		}
	});
});
