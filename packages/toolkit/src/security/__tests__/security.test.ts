import { describe, expect, it, vi } from "vitest";
import { MemoryCacheAdapter } from "../../cache/client.js";
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

	it("blocks requests over limit", async () => {
		const cache = new MemoryCacheAdapter();
		const limiter = createRateLimiter(cache, { max: 2 });
		await limiter.check("user:1");
		await limiter.check("user:1");
		const result = await limiter.check("user:1");
		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
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
