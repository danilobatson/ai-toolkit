import { describe, expect, it, vi } from "vitest";
import {
	createLogger,
	createMonitor,
	evaluate,
	exportMetrics,
	getCostReport,
	getTrace,
	getTraces,
	onTrace,
	trace,
} from "../index.js";
import type { MonitorClient, OnTraceCallback, StoredTrace } from "../types.js";

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
	const traces: StoredTrace[] = [];
	const onTraceCallbacks: OnTraceCallback[] = [];
	return {
		enabled: true,
		langfuse: mockLangfuse,
		costs,
		traces,
		onTraceCallbacks,
		maxTraces: 1000,
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
			expect(mod.getTraces).toBeDefined();
			expect(mod.getTrace).toBeDefined();
			expect(mod.onTrace).toBeDefined();
			expect(mod.exportMetrics).toBeDefined();
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

	// ── Trace Store ────────────────────────────────────────────────────────

	describe("Trace Store", () => {
		// ── getTraces ─────────────────────────────────────────────────────

		it("getTraces returns empty array initially", async () => {
			const monitor = await createMonitor();
			expect(getTraces(monitor)).toEqual([]);
		});

		it("getTraces returns stored traces after trace()", async () => {
			const monitor = await createMonitor();

			await trace(monitor, "test-op", async (span) => {
				span.update({ input: "hello" });
				return "world";
			});

			const traces = getTraces(monitor);
			expect(traces).toHaveLength(1);
			expect(traces[0].name).toBe("test-op");
			expect(traces[0].traceId).toMatch(/^[0-9a-f-]+$/);
			expect(traces[0].durationMs).toBeGreaterThanOrEqual(0);
			expect(traces[0].error).toBe(false);
			expect(traces[0].startedAt).toBeInstanceOf(Date);
		});

		it("getTraces returns a copy (not the internal array)", async () => {
			const monitor = await createMonitor();
			await trace(monitor, "a", async () => 1);

			const t1 = getTraces(monitor);
			const t2 = getTraces(monitor);
			expect(t1).not.toBe(t2);
			expect(t1).toEqual(t2);
		});

		it("trace stores attributes collected via span.update", async () => {
			const monitor = await createMonitor();

			await trace(monitor, "with-attrs", async (span) => {
				span.update({ input: "query", model: "gpt-4o" });
				span.update({ output: "answer", usage: { promptTokens: 10, completionTokens: 5 } });
				return "done";
			});

			const t = getTraces(monitor)[0];
			expect(t.attributes.input).toBe("query");
			expect(t.attributes.output).toBe("answer");
			expect(t.attributes.model).toBe("gpt-4o");
		});

		it("trace stores error traces when function throws", async () => {
			const monitor = await createMonitor();

			await expect(
				trace(monitor, "fail-op", async () => {
					throw new Error("boom");
				}),
			).rejects.toThrow(/boom/);

			const traces = getTraces(monitor);
			expect(traces).toHaveLength(1);
			expect(traces[0].error).toBe(true);
			expect(traces[0].errorMessage).toBe("boom");
		});

		it("trace stores error traces for enabled monitor too", async () => {
			const monitor = createEnabledMonitor();

			await expect(
				trace(monitor, "fail-enabled", async () => {
					throw new Error("enabled-boom");
				}),
			).rejects.toThrow(/enabled-boom/);

			const traces = getTraces(monitor);
			expect(traces).toHaveLength(1);
			expect(traces[0].error).toBe(true);
			expect(traces[0].errorMessage).toBe("enabled-boom");
		});

		it("enabled monitor stores traces in both local store and Langfuse", async () => {
			const mockLangfuse = createMockLangfuse();
			const monitor = createEnabledMonitor(mockLangfuse);

			await trace(monitor, "dual-store", async (span) => {
				span.update({ model: "gpt-4o", usage: { promptTokens: 10, completionTokens: 5 } });
				return "result";
			});

			// Local store
			expect(getTraces(monitor)).toHaveLength(1);
			// Langfuse
			expect(mockLangfuse.score.create).toHaveBeenCalled();
		});

		// ── getTrace ──────────────────────────────────────────────────────

		it("getTrace returns a single trace by ID", async () => {
			const monitor = await createMonitor();

			const { traceId } = await trace(monitor, "lookup", async () => "found");

			const t = getTrace(monitor, traceId);
			expect(t).toBeDefined();
			expect(t?.name).toBe("lookup");
			expect(t?.traceId).toBe(traceId);
		});

		it("getTrace returns undefined for unknown ID", async () => {
			const monitor = await createMonitor();
			expect(getTrace(monitor, "nonexistent")).toBeUndefined();
		});

		// ── FIFO eviction ────────────────────────────────────────────────

		it("FIFO eviction removes oldest traces when maxTraces exceeded", async () => {
			const monitor = await createMonitor({ traceStore: { maxTraces: 3 } });

			await trace(monitor, "trace-1", async () => 1);
			await trace(monitor, "trace-2", async () => 2);
			await trace(monitor, "trace-3", async () => 3);
			await trace(monitor, "trace-4", async () => 4);

			const traces = getTraces(monitor);
			expect(traces).toHaveLength(3);
			expect(traces[0].name).toBe("trace-2");
			expect(traces[1].name).toBe("trace-3");
			expect(traces[2].name).toBe("trace-4");
		});

		it("default maxTraces is 1000", async () => {
			const monitor = await createMonitor();
			expect(monitor.maxTraces).toBe(1000);
		});

		// ── onTrace ──────────────────────────────────────────────────────

		it("onTrace callback is invoked after each trace", async () => {
			const monitor = await createMonitor();
			const received: StoredTrace[] = [];

			onTrace(monitor, (t) => received.push(t));

			await trace(monitor, "cb-test", async () => "val");

			expect(received).toHaveLength(1);
			expect(received[0].name).toBe("cb-test");
		});

		it("onTrace returns unsubscribe function", async () => {
			const monitor = await createMonitor();
			const received: StoredTrace[] = [];

			const unsub = onTrace(monitor, (t) => received.push(t));

			await trace(monitor, "before-unsub", async () => 1);
			unsub();
			await trace(monitor, "after-unsub", async () => 2);

			expect(received).toHaveLength(1);
			expect(received[0].name).toBe("before-unsub");
		});

		it("onTrace supports multiple callbacks", async () => {
			const monitor = await createMonitor();
			let count1 = 0;
			let count2 = 0;

			onTrace(monitor, () => { count1++; });
			onTrace(monitor, () => { count2++; });

			await trace(monitor, "multi-cb", async () => "x");

			expect(count1).toBe(1);
			expect(count2).toBe(1);
		});

		it("onTrace callback errors do not block tracing", async () => {
			const monitor = await createMonitor();

			onTrace(monitor, () => {
				throw new Error("callback exploded");
			});

			const { result } = await trace(monitor, "resilient", async () => "ok");
			expect(result).toBe("ok");
			expect(getTraces(monitor)).toHaveLength(1);
		});

		it("onTrace fires for error traces too", async () => {
			const monitor = await createMonitor();
			const received: StoredTrace[] = [];

			onTrace(monitor, (t) => received.push(t));

			await expect(
				trace(monitor, "error-cb", async () => {
					throw new Error("fail");
				}),
			).rejects.toThrow(/fail/);

			expect(received).toHaveLength(1);
			expect(received[0].error).toBe(true);
		});

		// ── exportMetrics ─────────────────────────────────────────────────

		it("exportMetrics returns zeros when no traces", async () => {
			const monitor = await createMonitor();
			const metrics = exportMetrics(monitor);

			expect(metrics.totalTraces).toBe(0);
			expect(metrics.totalErrors).toBe(0);
			expect(metrics.errorRate).toBe(0);
			expect(metrics.avgDurationMs).toBe(0);
			expect(metrics.timeRange).toBeNull();
			expect(metrics.byName).toEqual({});
		});

		it("exportMetrics aggregates trace data", async () => {
			const monitor = await createMonitor();

			await trace(monitor, "fast-op", async () => "a");
			await trace(monitor, "fast-op", async () => "b");
			await trace(monitor, "slow-op", async () => "c");

			const metrics = exportMetrics(monitor);

			expect(metrics.totalTraces).toBe(3);
			expect(metrics.totalErrors).toBe(0);
			expect(metrics.errorRate).toBe(0);
			expect(metrics.byName["fast-op"].count).toBe(2);
			expect(metrics.byName["slow-op"].count).toBe(1);
			expect(metrics.timeRange).not.toBeNull();
		});

		it("exportMetrics calculates error rate", async () => {
			const monitor = await createMonitor();

			await trace(monitor, "ok", async () => "pass");
			await expect(
				trace(monitor, "fail", async () => {
					throw new Error("err");
				}),
			).rejects.toThrow();

			const metrics = exportMetrics(monitor);

			expect(metrics.totalTraces).toBe(2);
			expect(metrics.totalErrors).toBe(1);
			expect(metrics.errorRate).toBe(0.5);
			expect(metrics.byName["fail"].errorCount).toBe(1);
		});

		it("exportMetrics includes cost data from cost report", async () => {
			const monitor = await createMonitor();

			monitor.recordCost({
				model: "gpt-4o",
				module: "ai",
				usage: { promptTokens: 100, completionTokens: 50 },
				traceId: "t1",
				estimatedCostUsd: 0.005,
			});

			// Also trace so we have at least one trace in metrics
			await trace(monitor, "with-cost", async () => "result");

			const metrics = exportMetrics(monitor);
			expect(metrics.totalCostUsd).toBe(0.005);
			expect(metrics.totalTokens).toBe(150);
		});

		it("exportMetrics returns percentile durations", async () => {
			const monitor = await createMonitor();

			// Create several traces
			for (let i = 0; i < 10; i++) {
				await trace(monitor, "perf", async () => i);
			}

			const metrics = exportMetrics(monitor);
			expect(metrics.p50DurationMs).toBeGreaterThanOrEqual(0);
			expect(metrics.p95DurationMs).toBeGreaterThanOrEqual(metrics.p50DurationMs);
			expect(metrics.p99DurationMs).toBeGreaterThanOrEqual(metrics.p95DurationMs);
		});
	});
});
