import { describe, expect, it } from "vitest";
import { CacheError } from "../../errors/types.js";
import { RedisCacheAdapter } from "../client.js";

// ioredis is not installed in this workspace — exercises the real
// "peer dependency missing" path with no mocking involved.
describe("RedisCacheAdapter — ioredis not installed", () => {
	it("ENVIRONMENT — reports missing dependency instead of throwing ReferenceError", async () => {
		const cache = new RedisCacheAdapter("redis://localhost:6379");

		try {
			await cache.get("key1");
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(CacheError);
			expect((err as CacheError).code).toBe("CACHE_MISSING_DEPENDENCY");
			expect((err as CacheError).message).toMatch(/ioredis/);
		}
	});
});
