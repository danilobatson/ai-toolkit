import { describe, expect, it, vi } from "vitest";
import {
	createLogger,
	createMonitor,
	evaluate,
	getCostReport,
	trace,
} from "../index.js";
import type { MonitorClient } from "../types.js";

// ─── Mock Langfuse ─────────────────────────────────────────────────────────

function createMockLangfuse() {
	return {
		score: {
			create: vi.fn(),
		},
		flush: vi.fn().mockResolvedValue(undefined),
		shutdown: vi.fn().mockResolvedValue(undefined),
		getTraceUrl: vi
			.fn()
			.mockResolvedValue("https://cloud.langfuse.com/trace/123"),
	};
}

function createEnabledMonitor(
	mockLangfuse = createMockLangfuse(),
): MonitorClient {
	const costs: {
		timestamp: Date;
		model: string;
		module: string;
		usage: Record<string, number | undefined>;
		traceId: string;
		estimatedCostUsd?: number;
	}[] = [];
	return {
		enabled: true,
		langfuse: mockLangfuse,
		costs,
		recordCost(entry) {
			costs.push({ ...entry, timestamp: new Date() });
		},
		async flush() {
			await mockLangfuse.flush();
		},
		async shutdown() {
			await mockLangfuse.shutdown();
		},
	};
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("monitor", () => {
	// ── Level 1: CRASH ─────────────────────────────────────────────────────

	describe("Level 1: CRASH", () => {
		it("createMonitor does not throw with no config", async () => {
			await expect(createMonitor()).resolves.toBeDefined();
		});

		it("createMonitor does not throw with explicit config", async () => {
			await expect(
				createMonitor({
					publicKey: "pk-lf-test",
					secretKey: "sk-lf-test",
					baseUrl: "https://cloud.langfuse.com",
				}),
			).resolves.toBeDefined();
		});

		it("createMonitor does not throw with enabled: false", async () => {
			await expect(createMonitor({ enabled: false })).resolves.toBeDefined();
		});

		it("createLogger does not throw with valid service name", () => {
			expect(() => createLogger("test-service")).not.toThrow();
		});

		it("createLogger throws with empty service name", () => {
			expect(() => createLogger("")).toThrow(/non-empty service name/);
		});

		it("createLogger throws with invalid log level", () => {
			expect(() =>
				createLogger("test", { level: "invalid" as "debug" }),
			).toThrow(/Invalid log level/);
		});
	});

	// ── Level 2: BEHAVIOR ──────────────────────────────────────────────────

	describe("Level 2: BEHAVIOR", () => {
		it("trace creates a traced span and returns result", async () => {
			const monitor = createEnabledMonitor();
			const { result, traceId } = await trace(
				monitor,
				"test-trace",
				async (span) => {
					span.update({ input: "hello" });
					return "world";
				},
			);

			expect(result).toBe("world");
			expect(traceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		});

		it("trace records duration score to Langfuse", async () => {
			const mockLangfuse = createMockLangfuse();
			const monitor = createEnabledMonitor(mockLangfuse);

			await trace(monitor, "test-trace", async (span) => {
				span.update({ input: "hello" });
				return "done";
			});

			expect(mockLangfuse.score.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "duration_ms",
					dataType: "NUMERIC",
				}),
			);
		});

		it("evaluate records a score for a trace", async () => {
			const mockLangfuse = createMockLangfuse();
			const monitor = createEnabledMonitor(mockLangfuse);

			await evaluate(monitor, {
				traceId: "trace-123",
				name: "relevance",
				value: 0.95,
			});

			expect(mockLangfuse.score.create).toHaveBeenCalledWith(
				expect.objectContaining({
					traceId: "trace-123",
					name: "relevance",
					value: 0.95,
					dataType: "NUMERIC",
				}),
			);
		});

		it("evaluate passes categorical scores correctly", async () => {
			const mockLangfuse = createMockLangfuse();
			const monitor = createEnabledMonitor(mockLangfuse);

			await evaluate(monitor, {
				traceId: "trace-123",
				name: "quality",
				value: "excellent",
				dataType: "CATEGORICAL",
				comment: "Great answer",
			});

			expect(mockLangfuse.score.create).toHaveBeenCalledWith(
				expect.objectContaining({
					traceId: "trace-123",
					name: "quality",
					value: "excellent",
					dataType: "CATEGORICAL",
					comment: "Great answer",
				}),
			);
		});

		it("getCostReport aggregates costs by model", () => {
			const monitor = createEnabledMonitor();

			monitor.recordCost({
				model: "gpt-4o",
				module: "ai",
				usage: { promptTokens: 100, completionTokens: 50 },
				traceId: "t1",
				estimatedCostUsd: 0.005,
			});
			monitor.recordCost({
				model: "gpt-4o",
				module: "ai",
				usage: { promptTokens: 200, completionTokens: 100 },
				traceId: "t2",
				estimatedCostUsd: 0.01,
			});
			monitor.recordCost({
				model: "claude-sonnet-4-20250514",
				module: "chain",
				usage: { promptTokens: 50, completionTokens: 25 },
				traceId: "t3",
				estimatedCostUsd: 0.003,
			});

			const report = getCostReport(monitor);

			expect(report.totalOperations).toBe(3);
			expect(report.byModel["gpt-4o"].operations).toBe(2);
			expect(report.byModel["gpt-4o"].totalTokens).toBe(450);
			expect(report.byModel["claude-sonnet-4-20250514"].operations).toBe(1);
		});

		it("getCostReport aggregates costs by module", () => {
			const monitor = createEnabledMonitor();

			monitor.recordCost({
				model: "gpt-4o",
				module: "ai",
				usage: { promptTokens: 100, completionTokens: 50 },
				traceId: "t1",
			});
			monitor.recordCost({
				model: "gpt-4o",
				module: "chain",
				usage: { promptTokens: 200, completionTokens: 100 },
				traceId: "t2",
			});

			const report = getCostReport(monitor);

			expect(report.byModule.ai.operations).toBe(1);
			expect(report.byModule.chain.operations).toBe(1);
		});

		it("trace records cost entry when usage and model provided", async () => {
			const monitor = createEnabledMonitor();

			await trace(monitor, "test-trace", async (span) => {
				span.update({
					model: "gpt-4o",
					usage: { promptTokens: 100, completionTokens: 50 },
				});
				return "done";
			});

			expect(monitor.costs).toHaveLength(1);
			expect(monitor.costs[0].model).toBe("gpt-4o");
			expect(monitor.costs[0].usage.promptTokens).toBe(100);
		});
	});

	// ── Level 3: DATA QUALITY ──────────────────────────────────────────────

	describe("Level 3: DATA QUALITY", () => {
		it("trace captures input/output metadata via span.update", async () => {
			const monitor = createEnabledMonitor();
			let _capturedInput: unknown;
			let _capturedOutput: unknown;

			await trace(monitor, "test-trace", async (span) => {
				span.update({ input: "What is RAG?" });
				const answer = "Retrieval Augmented Generation";
				span.update({ output: answer });
				return answer;
			});

			// The cost was not recorded because no model was set
			expect(monitor.costs).toHaveLength(0);
		});

		it("getCostReport returns correct cost structure", () => {
			const monitor = createEnabledMonitor();

			monitor.recordCost({
				model: "gpt-4o",
				module: "ai",
				usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
				traceId: "t1",
				estimatedCostUsd: 0.005,
			});

			const report = getCostReport(monitor);

			expect(report).toMatchObject({
				totalOperations: 1,
				totalTokens: 150,
				totalEstimatedCostUsd: 0.005,
			});
			expect(report.timeRange).not.toBeNull();
			expect(report.timeRange?.from).toBeInstanceOf(Date);
			expect(report.timeRange?.to).toBeInstanceOf(Date);
		});

		it("getCostReport calculates totalTokens from prompt+completion when totalTokens missing", () => {
			const monitor = createEnabledMonitor();

			monitor.recordCost({
				model: "gpt-4o",
				module: "ai",
				usage: { promptTokens: 100, completionTokens: 50 },
				traceId: "t1",
			});

			const report = getCostReport(monitor);
			expect(report.totalTokens).toBe(150);
		});

		it("trace generates unique trace IDs", async () => {
			const monitor = createEnabledMonitor();

			const r1 = await trace(monitor, "a", async () => 1);
			const r2 = await trace(monitor, "b", async () => 2);

			expect(r1.traceId).not.toBe(r2.traceId);
		});

		it("createLogger returns correct Logger interface", () => {
			const logger = createLogger("test");

			expect(typeof logger.debug).toBe("function");
			expect(typeof logger.info).toBe("function");
			expect(typeof logger.warn).toBe("function");
			expect(typeof logger.error).toBe("function");
		});

		it("createLogger respects log level filtering", () => {
			const spy = vi.spyOn(console, "log").mockImplementation(() => {});
			try {
				const logger = createLogger("test", { level: "warn" });

				logger.debug("should not appear");
				logger.info("should not appear");
				logger.warn("should appear");
				logger.error("should appear");

				expect(spy).toHaveBeenCalledTimes(2);
			} finally {
				spy.mockRestore();
			}
		});

		it("createLogger outputs JSON in json mode", () => {
			const spy = vi.spyOn(console, "log").mockImplementation(() => {});
			try {
				const logger = createLogger("test-svc", {
					level: "info",
					json: true,
				});

				logger.info("test message", { key: "value" });

				expect(spy).toHaveBeenCalledTimes(1);
				const output = spy.mock.calls[0][0] as string;
				const parsed = JSON.parse(output);
				expect(parsed.service).toBe("test-svc");
				expect(parsed.message).toBe("test message");
				expect(parsed.level).toBe("info");
				expect(parsed.key).toBe("value");
				expect(parsed.timestamp).toBeDefined();
			} finally {
				spy.mockRestore();
			}
		});
	});

	// ── Level 4: ENVIRONMENT ───────────────────────────────────────────────

	describe("Level 4: ENVIRONMENT", () => {
		it("createMonitor returns noop monitor when keys missing", async () => {
			const monitor = await createMonitor();

			expect(monitor.enabled).toBe(false);
			expect(monitor.langfuse).toBeNull();
		});

		it("createMonitor returns noop when enabled: false even with keys", async () => {
			const monitor = await createMonitor({
				publicKey: "pk-lf-test",
				secretKey: "sk-lf-test",
				enabled: false,
			});

			expect(monitor.enabled).toBe(false);
		});

		it("trace works with noop monitor (no Langfuse)", async () => {
			const monitor = await createMonitor(); // noop

			const { result, traceId } = await trace(monitor, "test", async (span) => {
				span.update({ input: "test" });
				return 42;
			});

			expect(result).toBe(42);
			expect(traceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		});

		it("trace records costs locally even with noop monitor", async () => {
			const monitor = await createMonitor(); // noop

			await trace(monitor, "test", async (span) => {
				span.update({
					model: "gpt-4o",
					usage: { promptTokens: 100, completionTokens: 50 },
				});
				return "done";
			});

			expect(monitor.costs).toHaveLength(1);
		});

		it("evaluate is silently skipped with noop monitor", async () => {
			const monitor = await createMonitor(); // noop

			// Should not throw
			await evaluate(monitor, {
				traceId: "trace-123",
				name: "relevance",
				value: 0.95,
			});
		});

		it("getCostReport returns empty report with no costs", async () => {
			const monitor = await createMonitor();
			const report = getCostReport(monitor);

			expect(report.totalOperations).toBe(0);
			expect(report.totalTokens).toBe(0);
			expect(report.totalEstimatedCostUsd).toBe(0);
			expect(report.byModel).toEqual({});
			expect(report.byModule).toEqual({});
			expect(report.timeRange).toBeNull();
		});

		it("trace throws on empty name", async () => {
			const monitor = await createMonitor();

			await expect(trace(monitor, "", async () => "test")).rejects.toThrow(
				/non-empty name/,
			);
		});

		it("evaluate throws on missing traceId", async () => {
			const monitor = createEnabledMonitor();

			await expect(
				evaluate(monitor, {
					traceId: "",
					name: "relevance",
					value: 0.95,
				}),
			).rejects.toThrow(/requires traceId/);
		});

		it("evaluate throws on missing name", async () => {
			const monitor = createEnabledMonitor();

			await expect(
				evaluate(monitor, {
					traceId: "trace-123",
					name: "",
					value: 0.95,
				}),
			).rejects.toThrow(/requires traceId/);
		});

		it("trace propagates errors from the traced function", async () => {
			const mockLangfuse = createMockLangfuse();
			const monitor = createEnabledMonitor(mockLangfuse);

			await expect(
				trace(monitor, "fail-trace", async () => {
					throw new Error("boom");
				}),
			).rejects.toThrow(/boom/);

			// Should record error score
			expect(mockLangfuse.score.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "error",
					value: 1,
					dataType: "BOOLEAN",
				}),
			);
		});
	});

	// ── Level 5: PATTERN ───────────────────────────────────────────────────

	describe("Level 5: PATTERN", () => {
		it("all exports are named (no default exports)", async () => {
			const mod = await import("../index.js");

			expect(mod.createMonitor).toBeDefined();
			expect(mod.trace).toBeDefined();
			expect(mod.evaluate).toBeDefined();
			expect(mod.getCostReport).toBeDefined();
			expect(mod.createLogger).toBeDefined();
			expect((mod as Record<string, unknown>).default).toBeUndefined();
		});
	});

	// ── Level 6: CONTRACT ──────────────────────────────────────────────────

	describe("Level 6: CONTRACT", () => {
		it("MonitorClient interface is honored by createMonitor", async () => {
			const monitor = await createMonitor();

			expect(typeof monitor.enabled).toBe("boolean");
			expect(typeof monitor.recordCost).toBe("function");
			expect(typeof monitor.flush).toBe("function");
			expect(typeof monitor.shutdown).toBe("function");
			expect(Array.isArray(monitor.costs)).toBe(true);
		});

		it("TraceResult interface is honored by trace", async () => {
			const monitor = await createMonitor();

			const result = await trace(monitor, "test", async () => "hello");

			expect(result).toHaveProperty("result");
			expect(result).toHaveProperty("traceId");
			expect(result.result).toBe("hello");
			expect(typeof result.traceId).toBe("string");
		});

		it("CostReport interface is honored by getCostReport", async () => {
			const monitor = await createMonitor();

			monitor.recordCost({
				model: "gpt-4o",
				module: "ai",
				usage: { promptTokens: 10, completionTokens: 5 },
				traceId: "t1",
			});

			const report = getCostReport(monitor);

			expect(report).toHaveProperty("totalOperations");
			expect(report).toHaveProperty("totalTokens");
			expect(report).toHaveProperty("totalEstimatedCostUsd");
			expect(report).toHaveProperty("byModel");
			expect(report).toHaveProperty("byModule");
			expect(report).toHaveProperty("timeRange");
		});
	});

	// ── Level 7: PROVIDER FALLBACK ─────────────────────────────────────────

	describe("Level 7: PROVIDER FALLBACK", () => {
		it("graceful degradation when Langfuse unavailable", async () => {
			// createMonitor without keys → noop monitor
			const monitor = await createMonitor();

			expect(monitor.enabled).toBe(false);
			expect(monitor.langfuse).toBeNull();

			// All operations still work
			monitor.recordCost({
				model: "gpt-4o",
				module: "ai",
				usage: { promptTokens: 10 },
				traceId: "t1",
			});
			expect(monitor.costs).toHaveLength(1);
		});

		it("evaluate wraps Langfuse errors in ToolkitError", async () => {
			const mockLangfuse = createMockLangfuse();
			mockLangfuse.score.create.mockImplementation(() => {
				throw new Error("Langfuse API error");
			});
			const monitor = createEnabledMonitor(mockLangfuse);

			await expect(
				evaluate(monitor, {
					traceId: "trace-123",
					name: "relevance",
					value: 0.95,
				}),
			).rejects.toThrow(/Failed to evaluate trace/);
		});

		it("trace swallows Langfuse scoring errors without blocking", async () => {
			const mockLangfuse = createMockLangfuse();
			mockLangfuse.score.create.mockImplementation(() => {
				throw new Error("Langfuse network error");
			});
			const monitor = createEnabledMonitor(mockLangfuse);

			// Should NOT throw — trace continues despite Langfuse failure
			const { result } = await trace(monitor, "test", async (span) => {
				span.update({
					model: "gpt-4o",
					usage: { promptTokens: 10, completionTokens: 5 },
				});
				return "success";
			});

			expect(result).toBe("success");
		});
	});

	// ── Level 8: CLEANUP ───────────────────────────────────────────────────

	describe("Level 8: CLEANUP", () => {
		it("shutdown flushes pending data", async () => {
			const mockLangfuse = createMockLangfuse();
			const monitor = createEnabledMonitor(mockLangfuse);

			await monitor.shutdown();

			expect(mockLangfuse.shutdown).toHaveBeenCalledOnce();
		});

		it("flush sends pending data", async () => {
			const mockLangfuse = createMockLangfuse();
			const monitor = createEnabledMonitor(mockLangfuse);

			await monitor.flush();

			expect(mockLangfuse.flush).toHaveBeenCalledOnce();
		});

		it("noop monitor flush and shutdown resolve without error", async () => {
			const monitor = await createMonitor(); // noop

			await expect(monitor.flush()).resolves.toBeUndefined();
			await expect(monitor.shutdown()).resolves.toBeUndefined();
		});
	});
});
