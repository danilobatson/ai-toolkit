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

	it("reports healthy when checks config is empty", async () => {
		const check = createHealthCheck({ checks: {} });
		const report = await check();
		expect(report.status).toBe("healthy");
		expect(Object.keys(report.checks)).toHaveLength(0);
		expect(report.timestamp).toBeDefined();
		expect(typeof report.uptime).toBe("number");
	});

	it("reports unhealthy when all checks fail", async () => {
		const check = createHealthCheck({
			checks: {
				db: async () => {
					throw new Error("connection refused");
				},
				cache: async () => {
					throw new Error("timeout");
				},
				api: async () => {
					throw new Error("503 service unavailable");
				},
			},
		});
		const report = await check();
		expect(report.status).toBe("unhealthy");
		expect(report.checks.db.status).toBe("fail");
		expect(report.checks.cache.status).toBe("fail");
		expect(report.checks.api.status).toBe("fail");
	});

	it("failed checks include error message", async () => {
		const check = createHealthCheck({
			checks: {
				db: async () => {
					throw new Error("ECONNREFUSED 127.0.0.1:5432");
				},
			},
		});
		const report = await check();
		expect(report.checks.db.status).toBe("fail");
		expect(report.checks.db.message).toMatch(/ECONNREFUSED/);
		expect(typeof report.checks.db.latencyMs).toBe("number");
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
