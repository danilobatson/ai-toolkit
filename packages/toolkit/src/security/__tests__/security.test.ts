import { describe, expect, it, vi } from "vitest";
import { MemoryCacheAdapter } from "../../cache/client.js";
import { ValidationError } from "../../errors/types.js";
import { createAuditLogger, createRateLimiter } from "../rate-limiter.js";

describe("createRateLimiter", () => {
	it("returns limiter object with check and reset", () => {
		const cache = new MemoryCacheAdapter();
		const limiter = createRateLimiter(cache);
		expect(typeof limiter.check).toBe("function");
		expect(typeof limiter.reset).toBe("function");
	});

	it("allows requests under limit", async () => {
		const cache = new MemoryCacheAdapter();
		const limiter = createRateLimiter(cache, { max: 5 });
		const result = await limiter.check("user:1");
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(4);
	});

	it("throws ValidationError when cache is null/undefined", () => {
		expect(() => createRateLimiter(null as never)).toThrow(
			/cache is required/i,
		);
		expect(() => createRateLimiter(undefined as never)).toThrow(
			/cache is required/i,
		);
	});

	it("throws ValidationError instance when cache missing", () => {
		expect.assertions(1);
		try {
			createRateLimiter(null as never);
		} catch (err) {
			expect(err).toBeInstanceOf(ValidationError);
		}
	});

	it("blocks requests over limit", async () => {
		const cache = new MemoryCacheAdapter();
		const limiter = createRateLimiter(cache, { max: 2 });
		await limiter.check("user:1");
		await limiter.check("user:1");
		const result = await limiter.check("user:1");
		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
	});

	it("handles rapid sequential requests up to the limit", async () => {
		const cache = new MemoryCacheAdapter();
		const limiter = createRateLimiter(cache, { max: 3 });
		const results: Awaited<ReturnType<typeof limiter.check>>[] = [];
		for (let i = 0; i < 5; i++) {
			results.push(await limiter.check("burst:1"));
		}
		const allowed = results.filter((r) => r.allowed).length;
		const blocked = results.filter((r) => !r.allowed).length;
		expect(allowed).toBe(3);
		expect(blocked).toBe(2);
	});

	it("allows exactly 1 request when max=1", async () => {
		const cache = new MemoryCacheAdapter();
		const limiter = createRateLimiter(cache, { max: 1 });
		const first = await limiter.check("edge:1");
		const second = await limiter.check("edge:1");
		expect(first.allowed).toBe(true);
		expect(first.remaining).toBe(0);
		expect(second.allowed).toBe(false);
	});

	it("reset clears the counter so requests are allowed again", async () => {
		const cache = new MemoryCacheAdapter();
		const limiter = createRateLimiter(cache, { max: 1 });
		await limiter.check("reset:1");
		const blocked = await limiter.check("reset:1");
		expect(blocked.allowed).toBe(false);

		await limiter.reset("reset:1");
		const afterReset = await limiter.check("reset:1");
		expect(afterReset.allowed).toBe(true);
	});

	it("tracks separate counters per identifier", async () => {
		const cache = new MemoryCacheAdapter();
		const limiter = createRateLimiter(cache, { max: 1 });
		const a = await limiter.check("user:a");
		const b = await limiter.check("user:b");
		expect(a.allowed).toBe(true);
		expect(b.allowed).toBe(true);
	});

	it("returns resetAt in the future", async () => {
		const cache = new MemoryCacheAdapter();
		const limiter = createRateLimiter(cache, {
			max: 5,
			windowSeconds: 60,
		});
		const now = Date.now();
		const result = await limiter.check("time:1");
		expect(result.resetAt).toBeGreaterThan(now);
	});
});

describe("createAuditLogger", () => {
	it("returns logger with log method", () => {
		const logger = createAuditLogger("test-service");
		expect(typeof logger.log).toBe("function");
	});

	it("records entries with correct shape", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			const logger = createAuditLogger("test-service");
			logger.log("query_executed", {
				orgId: "org_1",
				userId: "user_1",
				resource: "docs",
			});
			expect(spy).toHaveBeenCalledOnce();
			const entry = JSON.parse(spy.mock.calls[0][0] as string);
			expect(entry.service).toBe("test-service");
			expect(entry.action).toBe("query_executed");
			expect(entry.timestamp).toBeDefined();
			expect(entry.orgId).toBe("org_1");
		} finally {
			spy.mockRestore();
		}
	});
});
