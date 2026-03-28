/**
 * Monitor — Langfuse-backed AI observability.
 *
 * createMonitor() wraps the Langfuse client. If Langfuse is not installed
 * or keys are missing, returns a noop monitor that silently discards data.
 *
 * @example
 * ```ts
 * import { createMonitor } from '@jamaalbuilds/ai-toolkit/monitor';
 *
 * const monitor = createMonitor(); // reads LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY
 * // or
 * const monitor = createMonitor({
 *   publicKey: 'pk-lf-...',
 *   secretKey: 'sk-lf-...',
 *   baseUrl: 'https://cloud.langfuse.com',
 * });
 * ```
 */

import { ToolkitError } from "../errors/index.js";
import type {
	CostEntry,
	CostReport,
	EvaluateOptions,
	MetricsExport,
	ModelCostSummary,
	MonitorClient,
	MonitorConfig,
	OnTraceCallback,
	StoredTrace,
	TraceAttributes,
	TraceResult,
	TraceSpan,
} from "./types.js";

/** Well-known default URL for Langfuse Cloud. */
const LANGFUSE_DEFAULT_URL = "https://cloud.langfuse.com";

// ─── Langfuse Dynamic Import ──────────────────────────────────────────────

interface LangfuseClientLike {
	score: {
		create(opts: Record<string, unknown>): void;
	};
	flush(): Promise<void>;
	shutdown(): Promise<void>;
	getTraceUrl(traceId: string): Promise<string>;
}

async function tryLoadLangfuse(config: {
	publicKey: string;
	secretKey: string;
	baseUrl: string;
}): Promise<LangfuseClientLike | null> {
	try {
		const moduleName = "langfuse";
		const { LangfuseClient } = await import(moduleName);
		return new LangfuseClient({
			publicKey: config.publicKey,
			secretKey: config.secretKey,
			baseUrl: config.baseUrl,
		}) as LangfuseClientLike;
	} catch {
		return null;
	}
}

// ─── Noop Monitor ──────────────────────────────────────────────────────────

const DEFAULT_MAX_TRACES = 1000;

function createNoopMonitor(maxTraces = DEFAULT_MAX_TRACES): MonitorClient {
	const costs: CostEntry[] = [];
	const traces: StoredTrace[] = [];
	const onTraceCallbacks: OnTraceCallback[] = [];
	return {
		enabled: false,
		langfuse: null,
		costs,
		traces,
		onTraceCallbacks,
		maxTraces,
		recordCost(entry) {
			costs.push({ ...entry, timestamp: new Date() });
		},
		async flush() {},
		async shutdown() {},
	};
}

// ─── Create Monitor ────────────────────────────────────────────────────────

/**
 * Create a monitor client for AI observability.
 *
 * Connects to Langfuse if keys are available. Returns a noop monitor otherwise.
 * All functions in this module accept a MonitorClient, so code works
 * identically with or without Langfuse configured.
 *
 * @param config - Optional Langfuse connection config. Falls back to env vars.
 * @returns A MonitorClient instance.
 *
 * @example
 * ```ts
 * const monitor = createMonitor();
 * console.log(monitor.enabled); // true if Langfuse keys found
 * ```
 */
export async function createMonitor(
	config?: MonitorConfig,
): Promise<MonitorClient> {
	const maxTraces = config?.traceStore?.maxTraces ?? DEFAULT_MAX_TRACES;

	if (config?.enabled === false) {
		return createNoopMonitor(maxTraces);
	}

	const publicKey = config?.publicKey ?? process.env.LANGFUSE_PUBLIC_KEY;
	const secretKey = config?.secretKey ?? process.env.LANGFUSE_SECRET_KEY;
	const baseUrl =
		config?.baseUrl ?? process.env.LANGFUSE_BASE_URL ?? LANGFUSE_DEFAULT_URL;

	if (!publicKey || !secretKey) {
		return createNoopMonitor(maxTraces);
	}

	const langfuse = await tryLoadLangfuse({ publicKey, secretKey, baseUrl });

	if (!langfuse) {
		return createNoopMonitor(maxTraces);
	}

	const costs: CostEntry[] = [];
	const traces: StoredTrace[] = [];
	const onTraceCallbacks: OnTraceCallback[] = [];

	return {
		enabled: true,
		langfuse,
		costs,
		traces,
		onTraceCallbacks,
		maxTraces,
		recordCost(entry) {
			costs.push({ ...entry, timestamp: new Date() });
		},
		async flush() {
			await langfuse.flush();
		},
		async shutdown() {
			await langfuse.shutdown();
		},
	};
}

// ─── Trace Store Helpers ──────────────────────────────────────────────────

function storeTrace(monitor: MonitorClient, stored: StoredTrace): void {
	if (monitor.traces.length >= monitor.maxTraces) {
		monitor.traces.shift();
	}
	monitor.traces.push(stored);
	for (const cb of monitor.onTraceCallbacks) {
		try {
			cb(stored);
		} catch {
			// Callbacks should never block tracing
		}
	}
}

// ─── Trace Helpers ────────────────────────────────────────────────────────

function recordTraceCost(
	monitor: MonitorClient,
	traceName: string,
	attrs: TraceAttributes,
	traceId: string,
): void {
	if (attrs.usage && attrs.model) {
		monitor.recordCost({
			model: attrs.model,
			module: traceName.split("/")[0] ?? traceName,
			usage: attrs.usage,
			traceId,
		});
	}
}

function scoreLangfuse(
	langfuse: LangfuseClientLike,
	traceId: string,
	name: string,
	value: unknown,
	dataType: string,
	comment?: string,
): void {
	try {
		langfuse.score.create({
			traceId,
			name,
			value,
			dataType,
			...(comment ? { comment } : {}),
		});
	} catch {
		// Tracing failure should never block the operation
	}
}

function buildStoredTrace(
	traceId: string,
	name: string,
	startTime: number,
	attrs: TraceAttributes,
	error: boolean,
	errorMessage?: string,
): StoredTrace {
	return {
		traceId,
		name,
		startedAt: new Date(startTime),
		durationMs: Date.now() - startTime,
		attributes: { ...attrs },
		error,
		...(errorMessage ? { errorMessage } : {}),
	};
}

function scoreOnError(
	monitor: MonitorClient,
	traceId: string,
	errorMessage: string,
): void {
	if (monitor.enabled && monitor.langfuse) {
		scoreLangfuse(
			monitor.langfuse as LangfuseClientLike,
			traceId,
			"error",
			1,
			"BOOLEAN",
			errorMessage,
		);
	}
}

function scoreOnSuccess(
	monitor: MonitorClient,
	traceId: string,
	durationMs: number,
): void {
	if (monitor.enabled && monitor.langfuse) {
		scoreLangfuse(
			monitor.langfuse as LangfuseClientLike,
			traceId,
			"duration_ms",
			durationMs,
			"NUMERIC",
		);
	}
}

// ─── Trace ─────────────────────────────────────────────────────────────────

/**
 * Trace an operation with Langfuse.
 *
 * Wraps a function in a traced span, recording input/output and timing.
 * If the monitor is noop, the function executes normally without tracing.
 *
 * @param monitor - The monitor client.
 * @param name - Name for this trace (e.g. "rag-query", "chat-completion").
 * @param fn - Async function to trace. Receives a TraceSpan for updating metadata.
 * @returns TraceResult with the function's return value and the trace ID.
 *
 * @example
 * ```ts
 * const { result, traceId } = await trace(monitor, 'rag-query', async (span) => {
 *   span.update({ input: query, model: 'gpt-4o' });
 *   const answer = await generateAnswer(query);
 *   span.update({ output: answer, usage: { promptTokens: 100, completionTokens: 50 } });
 *   return answer;
 * });
 * ```
 */
export async function trace<T>(
	monitor: MonitorClient,
	name: string,
	fn: (span: TraceSpan) => Promise<T>,
): Promise<TraceResult<T>> {
	if (!name || typeof name !== "string") {
		throw new ToolkitError("trace() requires a non-empty name", {
			code: "MONITOR_INVALID_NAME",
		});
	}

	const traceId = crypto.randomUUID();
	const attrs: TraceAttributes = {};
	const span: TraceSpan = {
		update(newAttrs) { Object.assign(attrs, newAttrs); },
	};

	const startTime = Date.now();

	try {
		const result = await fn(span);
		const durationMs = Date.now() - startTime;
		recordTraceCost(monitor, name, attrs, traceId);
		scoreOnSuccess(monitor, traceId, durationMs);
		storeTrace(monitor, buildStoredTrace(traceId, name, startTime, attrs, false));
		return { result, traceId };
	} catch (error) {
		const durationMs = Date.now() - startTime;
		const errorMessage = error instanceof Error ? error.message : String(error);
		scoreOnError(monitor, traceId, errorMessage);
		storeTrace(monitor, buildStoredTrace(traceId, name, startTime, attrs, true, errorMessage));
		throw error;
	}
}

// ─── Evaluate ──────────────────────────────────────────────────────────────

/**
 * Score a trace for quality evaluation.
 *
 * Records a score against a trace ID in Langfuse. Silently skipped
 * if the monitor is noop.
 *
 * @param monitor - The monitor client.
 * @param options - Score options including traceId, name, value, and dataType.
 *
 * @example
 * ```ts
 * await evaluate(monitor, {
 *   traceId: 'trace-123',
 *   name: 'relevance',
 *   value: 0.95,
 *   dataType: 'NUMERIC',
 *   comment: 'Highly relevant answer',
 * });
 * ```
 */
export async function evaluate(
	monitor: MonitorClient,
	options: EvaluateOptions,
): Promise<void> {
	if (!options.traceId || !options.name) {
		throw new ToolkitError("evaluate() requires traceId and name", {
			code: "MONITOR_INVALID_EVALUATE",
		});
	}

	if (!monitor.enabled || !monitor.langfuse) {
		return;
	}

	const langfuse = monitor.langfuse as LangfuseClientLike;

	try {
		langfuse.score.create({
			traceId: options.traceId,
			name: options.name,
			value: options.value,
			dataType: options.dataType ?? "NUMERIC",
			...(options.observationId && {
				observationId: options.observationId,
			}),
			...(options.comment && { comment: options.comment }),
		});
	} catch (error) {
		throw new ToolkitError("Failed to evaluate trace", {
			code: "MONITOR_EVALUATE_FAILED",
			cause: error instanceof Error ? error : undefined,
		});
	}
}

// ─── Cost Report Helpers ──────────────────────────────────────────────────

function addToBucket(
	buckets: Record<string, ModelCostSummary>,
	key: string,
	tokens: number,
	cost: number,
): void {
	if (!buckets[key]) {
		buckets[key] = { operations: 0, totalTokens: 0, estimatedCostUsd: 0 };
	}
	buckets[key].operations += 1;
	buckets[key].totalTokens += tokens;
	buckets[key].estimatedCostUsd += cost;
}

// ─── Cost Report ───────────────────────────────────────────────────────────

/**
 * Get a cost report aggregated from locally tracked operations.
 *
 * Summarizes token usage and estimated costs by model and module.
 * Works regardless of whether Langfuse is connected.
 *
 * @param monitor - The monitor client.
 * @returns CostReport with breakdowns by model and module.
 *
 * @example
 * ```ts
 * const report = getCostReport(monitor);
 * console.log(`Total cost: $${report.totalEstimatedCostUsd.toFixed(4)}`);
 * console.log(`By model:`, report.byModel);
 * ```
 */
export function getCostReport(monitor: MonitorClient): CostReport {
	const costs = monitor.costs;

	if (costs.length === 0) {
		return {
			totalOperations: 0,
			totalTokens: 0,
			totalEstimatedCostUsd: 0,
			byModel: {},
			byModule: {},
			timeRange: null,
		};
	}

	const byModel: Record<string, ModelCostSummary> = {};
	const byModule: Record<string, ModelCostSummary> = {};
	let totalTokens = 0;
	let totalCost = 0;

	for (const entry of costs) {
		const tokens =
			entry.usage.totalTokens ??
			(entry.usage.promptTokens ?? 0) + (entry.usage.completionTokens ?? 0);
		const cost = entry.estimatedCostUsd ?? 0;

		totalTokens += tokens;
		totalCost += cost;

		addToBucket(byModel, entry.model, tokens, cost);
		addToBucket(byModule, entry.module, tokens, cost);
	}

	const timestamps = costs.map((c) => c.timestamp.getTime());

	return {
		totalOperations: costs.length,
		totalTokens,
		totalEstimatedCostUsd: totalCost,
		byModel,
		byModule,
		timeRange: {
			from: new Date(Math.min(...timestamps)),
			to: new Date(Math.max(...timestamps)),
		},
	};
}

// ─── Trace Store Access ──────────────────────────────────────────────────

/**
 * Get all stored traces.
 *
 * Returns traces from the in-memory store, ordered oldest-first.
 * Works without Langfuse — traces are always stored locally.
 *
 * @param monitor - The monitor client.
 * @returns Array of stored traces.
 *
 * @example
 * ```ts
 * const traces = getTraces(monitor);
 * for (const t of traces) {
 *   console.log(`${t.name}: ${t.durationMs}ms`);
 * }
 * ```
 */
export function getTraces(monitor: MonitorClient): StoredTrace[] {
	return [...monitor.traces];
}

/**
 * Get a single trace by ID.
 *
 * @param monitor - The monitor client.
 * @param traceId - The trace ID to look up.
 * @returns The stored trace, or undefined if not found.
 *
 * @example
 * ```ts
 * const t = getTrace(monitor, traceId);
 * if (t) console.log(`${t.name} took ${t.durationMs}ms`);
 * ```
 */
export function getTrace(
	monitor: MonitorClient,
	traceId: string,
): StoredTrace | undefined {
	return monitor.traces.find((t) => t.traceId === traceId);
}

/**
 * Register a callback invoked after every trace completes.
 *
 * Returns an unsubscribe function.
 *
 * @param monitor - The monitor client.
 * @param callback - Function called with each completed trace.
 * @returns Unsubscribe function to remove the callback.
 *
 * @example
 * ```ts
 * const unsub = onTrace(monitor, (t) => {
 *   console.log(`Trace ${t.traceId} done in ${t.durationMs}ms`);
 * });
 * // later: unsub();
 * ```
 */
export function onTrace(
	monitor: MonitorClient,
	callback: OnTraceCallback,
): () => void {
	monitor.onTraceCallbacks.push(callback);
	return () => {
		const idx = monitor.onTraceCallbacks.indexOf(callback);
		if (idx >= 0) {
			monitor.onTraceCallbacks.splice(idx, 1);
		}
	};
}

// ─── Metrics Export ──────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0;
	const idx = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, idx)];
}

/**
 * Export an OpenTelemetry-compatible metrics summary.
 *
 * Aggregates trace durations, error rates, and cost data into
 * a single metrics object. Works without Langfuse.
 *
 * @param monitor - The monitor client.
 * @returns MetricsExport with aggregated stats.
 *
 * @example
 * ```ts
 * const metrics = exportMetrics(monitor);
 * console.log(`${metrics.totalTraces} traces, p95=${metrics.p95DurationMs}ms, errors=${metrics.errorRate}`);
 * ```
 */
export function exportMetrics(monitor: MonitorClient): MetricsExport {
	const traces = monitor.traces;
	const costReport = getCostReport(monitor);

	if (traces.length === 0) {
		return {
			totalTraces: 0,
			totalErrors: 0,
			errorRate: 0,
			avgDurationMs: 0,
			p50DurationMs: 0,
			p95DurationMs: 0,
			p99DurationMs: 0,
			byName: {},
			totalCostUsd: costReport.totalEstimatedCostUsd,
			totalTokens: costReport.totalTokens,
			timeRange: null,
		};
	}

	const durations = traces.map((t) => t.durationMs).sort((a, b) => a - b);
	const totalErrors = traces.filter((t) => t.error).length;

	const byName: Record<string, { count: number; avgDurationMs: number; errorCount: number }> = {};
	for (const t of traces) {
		if (!byName[t.name]) {
			byName[t.name] = { count: 0, avgDurationMs: 0, errorCount: 0 };
		}
		const bucket = byName[t.name];
		bucket.avgDurationMs = (bucket.avgDurationMs * bucket.count + t.durationMs) / (bucket.count + 1);
		bucket.count += 1;
		if (t.error) bucket.errorCount += 1;
	}

	const timestamps = traces.map((t) => t.startedAt.getTime());

	return {
		totalTraces: traces.length,
		totalErrors,
		errorRate: totalErrors / traces.length,
		avgDurationMs: durations.reduce((a, b) => a + b, 0) / durations.length,
		p50DurationMs: percentile(durations, 50),
		p95DurationMs: percentile(durations, 95),
		p99DurationMs: percentile(durations, 99),
		byName,
		totalCostUsd: costReport.totalEstimatedCostUsd,
		totalTokens: costReport.totalTokens,
		timeRange: {
			from: new Date(Math.min(...timestamps)),
			to: new Date(Math.max(...timestamps)),
		},
	};
}
