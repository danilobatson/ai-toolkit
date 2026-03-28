/**
 * Monitor module types — Langfuse tracing, evaluation, and cost tracking.
 */

// ─── Logger Types (absorbed from observability/) ───────────────────────────

/** Log severity levels. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Structured logger interface. */
export interface Logger {
	debug(message: string, meta?: Record<string, unknown>): void;
	info(message: string, meta?: Record<string, unknown>): void;
	warn(message: string, meta?: Record<string, unknown>): void;
	error(message: string, meta?: Record<string, unknown>): void;
}

// ─── Monitor Config ────────────────────────────────────────────────────────

/** Configuration for creating a monitor client. */
export interface MonitorConfig {
	/** Langfuse public key. Falls back to LANGFUSE_PUBLIC_KEY env var. */
	publicKey?: string;
	/** Langfuse secret key. Falls back to LANGFUSE_SECRET_KEY env var. */
	secretKey?: string;
	/** Langfuse base URL. Falls back to LANGFUSE_BASE_URL or https://cloud.langfuse.com. */
	baseUrl?: string;
	/** Whether to enable monitoring. Defaults to true if keys are available. */
	enabled?: boolean;
}

// ─── Trace Types ───────────────────────────────────────────────────────────

/** A traced span that can be updated with metadata. */
export interface TraceSpan {
	/** Update the span with input/output or arbitrary metadata. */
	update(attrs: TraceAttributes): void;
}

/** Attributes that can be set on a trace span. */
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

/** Token usage for cost tracking. */
export interface TokenUsage {
	/** Input/prompt tokens consumed. */
	promptTokens?: number;
	/** Output/completion tokens generated. */
	completionTokens?: number;
	/** Total tokens (promptTokens + completionTokens if not provided). */
	totalTokens?: number;
}

/** Result of a trace() call, including the traced function's return value. */
export interface TraceResult<T> {
	/** The return value of the traced function. */
	result: T;
	/** The trace ID assigned by the monitor. */
	traceId: string;
}

// ─── Evaluate Types ────────────────────────────────────────────────────────

/** Score data types supported by Langfuse. */
export type ScoreDataType = "NUMERIC" | "CATEGORICAL" | "BOOLEAN";

/** Options for evaluating (scoring) a trace. */
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

/** A single cost entry tracked locally. */
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

/** Aggregated cost report. */
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

/** Summary of costs for a single model or module. */
export interface ModelCostSummary {
	/** Number of operations. */
	operations: number;
	/** Total tokens consumed. */
	totalTokens: number;
	/** Total estimated cost in USD. */
	estimatedCostUsd: number;
}

// ─── Monitor Client ────────────────────────────────────────────────────────

/** The monitor client returned by createMonitor(). */
export interface MonitorClient {
	/** Whether this monitor is connected to Langfuse (vs noop). */
	readonly enabled: boolean;
	/** The underlying Langfuse client, or null if not connected. */
	readonly langfuse: unknown | null;
	/** Local cost entries tracked by this monitor. */
	readonly costs: CostEntry[];
	/** Record a cost entry for local tracking. */
	recordCost(entry: Omit<CostEntry, "timestamp">): void;
	/** Flush pending data to Langfuse. */
	flush(): Promise<void>;
	/** Shut down the monitor and flush pending data. */
	shutdown(): Promise<void>;
}
