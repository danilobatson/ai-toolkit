import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockEval } from "../../../__mocks__/ioredis.js";

// Uses packages/toolkit/__mocks__/ioredis.ts — ioredis is an optional peer
// dependency and may not be installed, so it can't be resolved for mocking.
vi.mock("ioredis");

beforeEach(() => {
	vi.clearAllMocks();
});

const { RedisCacheAdapter } = await import("../../cache/client.js");
const { createRateLimiter } = await import("../rate-limiter.js");

describe("createRateLimiter with RedisCacheAdapter", () => {
	it("BEHAVIOR — ten concurrent check() calls allow exactly max, backed by atomic Redis incr", async () => {
		// Simulates Redis running the INCR+EXPIRE script atomically —
		// each call increments a shared counter with no read-then-write gap.
		const counters = new Map<string, number>();
		mockEval.mockImplementation(async (_script: string, _numKeys: number, key: string) => {
			const next = (counters.get(key) ?? 0) + 1;
			counters.set(key, next);
			return next;
		});

		const cache = new RedisCacheAdapter("redis://localhost:6379");
		const limiter = createRateLimiter(cache, { max: 5, windowSeconds: 60 });

		const results = await Promise.all(
			Array.from({ length: 10 }, () => limiter.check("rapid:1")),
		);

		const allowed = results.filter((r) => r.allowed).length;
		expect(allowed).toBe(5);
		expect(mockEval).toHaveBeenCalledTimes(10);
	});
});
