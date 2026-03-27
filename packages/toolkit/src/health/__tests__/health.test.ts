import { describe, expect, it, vi } from "vitest";
import { createHealthCheck } from "../check.js";

describe("createHealthCheck", () => {
	it("returns a check function", () => {
		const check = createHealthCheck({ checks: {} });
		expect(typeof check).toBe("function");
	});

	it("reports healthy when all checks pass", async () => {
		const check = createHealthCheck({
			checks: {
				db: async () => {},
				cache: async () => {},
			},
		});
		const report = await check();
		expect(report.status).toBe("healthy");
		expect(report.checks.db.status).toBe("pass");
		expect(report.checks.cache.status).toBe("pass");
	});

	it("reports degraded when one check fails", async () => {
		const check = createHealthCheck({
			checks: {
				db: async () => {},
				cache: async () => {
					throw new Error("connection refused");
				},
			},
		});
		const report = await check();
		expect(report.status).toBe("degraded");
		expect(report.checks.db.status).toBe("pass");
		expect(report.checks.cache.status).toBe("fail");
	});

	it("respects timeout", async () => {
		vi.useFakeTimers();
		try {
			const check = createHealthCheck({
				checks: {
					slow: () => new Promise(() => {}), // never resolves
				},
				timeoutMs: 100,
			});

			const promise = check();
			vi.advanceTimersByTime(200);
			const report = await promise;
			expect(report.checks.slow.status).toBe("fail");
			expect(report.checks.slow.message).toMatch(/timeout/i);
		} finally {
			vi.useRealTimers();
		}
	});
});
