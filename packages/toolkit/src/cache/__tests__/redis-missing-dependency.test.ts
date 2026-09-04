import { describe, expect, it } from "vitest";
import { CacheError } from "../../errors/types.js";
import { RedisCacheAdapter } from "../client.js";

// No vi.mock("ioredis", ...) here — ioredis is a peer dependency that is
// not installed in this environment, so this exercises the real
// "package genuinely missing" path through await import().
describe("RedisCacheAdapter — ioredis not installed", () => {
	it("CRASH — construction does not throw (loading is deferred)", () => {
		expect(() => new RedisCacheAdapter("redis://localhost:6379")).not.toThrow();
	});

	it("ENVIRONMENT — get reports the missing dependency", async () => {
		const cache = new RedisCacheAdapter("redis://localhost:6379");

		try {
			await cache.get("key1");
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(CacheError);
			expect((err as CacheError).code).toBe("CACHE_MISSING_DEPENDENCY");
			expect((err as CacheError).message).toMatch(/ioredis/i);
		}
	});
});
