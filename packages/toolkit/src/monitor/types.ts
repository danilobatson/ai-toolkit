/**
 * Monitor module types — Langfuse tracing, evaluation, and cost tracking.
 */

// ─── Logger Types (absorbed from observability/) ───────────────────────────

/**
 * Log severity levels.
 *
 * @example
 * ```ts
 * const level: LogLevel = 'info';
 * ```
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Structured logger interface.
 *
 * @example
 * ```ts
 * const logger: Logger = createLogger('my-service');
 * logger.info('Request processed', { durationMs: 42 });
 * ```
 */
export interface Logger {
	debug(message: string, meta?: Record<string, unknown>): void;
	info(message: string, meta?: Record<string, unknown>): void;
	warn(message: string, meta?: Record<string, unknown>): void;
	error(message: string, meta?: Record<string, unknown>): void;
}

// ─── Monitor Config ────────────────────────────────────────────────────────

/**
 * Configuration for creating a monitor client.
 *
 * @example
 * ```ts
 * const config: MonitorConfig = {
 *   publicKey: 'pk-lf-xxx',
 *   secretKey: 'sk-lf-xxx',
 *   enabled: true,
 * };
 * const monitor = await createMonitor(config);
 * ```
 */
export interface MonitorConfig {
	/** Langfuse public key. Falls back to LANGFUSE_PUBLIC_KEY env var. */
	publicKey?: string;
	/** Langfuse secret key. Falls back to LANGFUSE_SECRET_KEY env var. */
	secretKey?: string;
	/** Langfuse base URL. Falls back to LANGFUSE_BASE_URL or https://cloud.langfuse.com. */
	baseUrl?: string;
	/** Whether to enable monitoring. Defaults to true if keys are available. */
	enabled?: boolean;
	/** Configuration for the in-memory trace store. */
	traceStore?: TraceStoreConfig;
}

// ─── Trace Types ───────────────────────────────────────────────────────────

/**
 * A traced span that can be updated with metadata.
 *
 * @example
 * ```ts
 * const span: TraceSpan = trace.createSpan('process');
 * span.update({ input: query, output: result, model: 'gpt-4o' });
 * ```
 */
export interface TraceSpan {
	/** Update the span with input/output or arbitrary metadata. */
	update(attrs: TraceAttributes): void;
}

/**
 * Attributes that can be set on a trace span.
 *
 * @example
 * ```ts
 * const attrs: TraceAttributes = {
 *   input: 'What is AI?',
 *   output: 'AI is...',
 *   model: 'gpt-4o',
 *   usage: { promptTokens: 10, completionTokens: 50 },
 * };
 * ```
 */
export interface TraceAttributes {
	/** Input to the operation. */
	input?: unknown;
	/** Output of the operation. */
	output?: unknown;
	/** Model used (e.g. "gpt-4o", "claude-sonnet-4-20250514"). */
	model?: string;
	/** Token usage from the LLM call. */
	usage?: TokenUsage;
	/** Arbitrary metadata. */
	metadata?: Record<string, unknown>;
}

/**
 * Token usage for cost tracking.
 *
 * @example
 * ```ts
 * const usage: TokenUsage = { promptTokens: 100, completionTokens: 250, totalTokens: 350 };
 * ```
 */
export interface TokenUsage {
	/** Input/prompt tokens consumed. */
	promptTokens?: number;
	/** Output/completion tokens generated. */
	completionTokens?: number;
	/** Total tokens (promptTokens + completionTokens if not provided). */
	totalTokens?: number;
}

/**
 * Result of a trace() call, including the traced function's return value.
 *
 * @example
 * ```ts
 * const { result, traceId }: TraceResult<string> = await trace(monitor, 'generate', fn);
 * console.log(`Trace ${traceId}: ${result}`);
 * ```
 */
export interface TraceResult<T> {
	/** The return value of the traced function. */
	result: T;
	/** The trace ID assigned by the monitor. */
	traceId: string;
}

// ─── Evaluate Types ────────────────────────────────────────────────────────

/**
 * Score data types supported by Langfuse.
 *
 * @example
 * ```ts
 * const dataType: ScoreDataType = 'NUMERIC';
 * ```
 */
export type ScoreDataType = "NUMERIC" | "CATEGORICAL" | "BOOLEAN";

/**
 * Options for evaluating (scoring) a trace.
 *
 * @example
 * ```ts
 * const options: EvaluateOptions = {
 *   traceId: 'trace-abc',
 *   name: 'relevance',
 *   value: 0.9,
 *   dataType: 'NUMERIC',
 * };
 * await evaluate(monitor, options);
 * ```
 */
export interface EvaluateOptions {
	/** The trace ID to score. */
	traceId: string;
	/** Score name (e.g. "relevance", "accuracy", "helpfulness"). */
	name: string;
	/** Score value — number for NUMERIC/BOOLEAN, string for CATEGORICAL. */
	value: number | string;
	/** Score data type. Defaults to NUMERIC. */
	dataType?: ScoreDataType;
	/** Optional observation ID within the trace. */
	observationId?: string;
	/** Optional human-readable comment. */
	comment?: string;
}

// ─── Cost Report Types ─────────────────────────────────────────────────────

/**
 * A single cost entry tracked locally.
 *
 * @example
 * ```ts
 * monitor.recordCost({
 *   model: 'gpt-4o',
 *   module: 'ai',
 *   usage: { promptTokens: 100, completionTokens: 50 },
 *   estimatedCostUsd: 0.003,
 *   traceId: 'trace-abc',
 * });
 * ```
 */
export interface CostEntry {
	/** Timestamp of the operation. */
	timestamp: Date;
	/** Model used. */
	model: string;
	/** Module that made the call (e.g. "ai", "chain", "agents"). */
	module: string;
	/** Token usage. */
	usage: TokenUsage;
	/** Estimated cost in USD (if available). */
	estimatedCostUsd?: number;
	/** Associated trace ID. */
	traceId: string;
}

/**
 * Aggregated cost report.
 *
 * @example
 * ```ts
 * const report: CostReport = getCostReport(monitor);
 * console.log(`Total: $${report.totalEstimatedCostUsd} across ${report.totalOperations} ops`);
 * ```
 */
export interface CostReport {
	/** Total operations tracked. */
	totalOperations: number;
	/** Total tokens consumed. */
	totalTokens: number;
	/** Total estimated cost in USD. */
	totalEstimatedCostUsd: number;
	/** Cost breakdown by model name. */
	byModel: Record<string, ModelCostSummary>;
	/** Cost breakdown by module name. */
	byModule: Record<string, ModelCostSummary>;
	/** Time range of tracked operations. */
	timeRange: { from: Date; to: Date } | null;
}

/**
 * Summary of costs for a single model or module.
 *
 * @example
 * ```ts
 * const summary: ModelCostSummary = report.byModel['gpt-4o'];
 * console.log(`${summary.operations} ops, ${summary.totalTokens} tokens, $${summary.estimatedCostUsd}`);
 * ```
 */
export interface ModelCostSummary {
	/** Number of operations. */
	operations: number;
	/** Total tokens consumed. */
	totalTokens: number;
	/** Total estimated cost in USD. */
	estimatedCostUsd: number;
}

// ─── Trace Store Types ────────────────────────────────────────────────────

/**
 * A completed trace stored in the local trace store.
 *
 * @example
 * ```ts
 * const traces: StoredTrace[] = getTraces(monitor);
 * for (const t of traces) {
 *   console.log(`${t.name} took ${t.durationMs}ms (trace: ${t.traceId})`);
 * }
 * ```
 */
export interface StoredTrace {
	/** Unique trace ID. */
	traceId: string;
	/** Name of the trace (e.g. "rag-query", "chat-completion"). */
	name: string;
	/** When the trace started. */
	startedAt: Date;
	/** Duration in milliseconds. */
	durationMs: number;
	/** Attributes collected via span.update(). */
	attributes: TraceAttributes;
	/** Whether the traced function threw an error. */
	error: boolean;
	/** Error message if the traced function threw. */
	errorMessage?: string;
}

/**
 * Configuration for the in-memory trace store.
 *
 * @example
 * ```ts
 * const config: TraceStoreConfig = { maxTraces: 500 };
 * const monitor = await createMonitor({ traceStore: config });
 * ```
 */
export interface TraceStoreConfig {
	/** Maximum number of traces to keep in memory. Oldest are evicted first (FIFO). Default: 1000. */
	maxTraces?: number;
}

/**
 * Callback invoked after a trace completes.
 *
 * @example
 * ```ts
 * const unsub = onTrace(monitor, (trace) => {
 *   console.log(`Trace ${trace.traceId} completed in ${trace.durationMs}ms`);
 * });
 * // later: unsub() to stop listening
 * ```
 */
export type OnTraceCallback = (trace: StoredTrace) => void;

/**
 * OpenTelemetry-compatible metrics summary.
 *
 * @example
 * ```ts
 * const metrics = exportMetrics(monitor);
 * console.log(`${metrics.totalTraces} traces, avg ${metrics.avgDurationMs}ms`);
 * ```
 */
export interface MetricsExport {
	/** Total number of traces recorded. */
	totalTraces: number;
	/** Total errors across all traces. */
	totalErrors: number;
	/** Error rate (0–1). */
	errorRate: number;
	/** Average trace duration in milliseconds. */
	avgDurationMs: number;
	/** p50 trace duration in milliseconds. */
	p50DurationMs: number;
	/** p95 trace duration in milliseconds. */
	p95DurationMs: number;
	/** p99 trace duration in milliseconds. */
	p99DurationMs: number;
	/** Traces broken down by name. */
	byName: Record<string, { count: number; avgDurationMs: number; errorCount: number }>;
	/** Total cost from the cost report. */
	totalCostUsd: number;
	/** Total tokens from the cost report. */
	totalTokens: number;
	/** Time range covered. */
	timeRange: { from: Date; to: Date } | null;
}

// ─── Monitor Client ────────────────────────────────────────────────────────

/**
 * The monitor client returned by createMonitor().
 *
 * @example
 * ```ts
 * const monitor: MonitorClient = await createMonitor({ enabled: true });
 * monitor.recordCost({ model: 'gpt-4o', module: 'ai', usage: { totalTokens: 100 }, traceId: 't1' });
 * await monitor.shutdown();
 * ```
 */
export interface MonitorClient {
	/** Whether this monitor is connected to Langfuse (vs noop). */
	readonly enabled: boolean;
	/** The underlying Langfuse client, or null if not connected. */
	readonly langfuse: unknown | null;
	/** Local cost entries tracked by this monitor. */
	readonly costs: CostEntry[];
	/** Local trace store for completed traces. */
	readonly traces: StoredTrace[];
	/** Registered trace callbacks. */
	readonly onTraceCallbacks: OnTraceCallback[];
	/** Maximum traces to store in memory (FIFO eviction). */
	readonly maxTraces: number;
	/** Record a cost entry for local tracking. */
	recordCost(entry: Omit<CostEntry, "timestamp">): void;
	/** Flush pending data to Langfuse. */
	flush(): Promise<void>;
	/** Shut down the monitor and flush pending data. */
	shutdown(): Promise<void>;
}
