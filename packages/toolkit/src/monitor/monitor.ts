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
	ModelCostSummary,
	MonitorClient,
	MonitorConfig,
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

function createNoopMonitor(): MonitorClient {
	const costs: CostEntry[] = [];
	return {
		enabled: false,
		langfuse: null,
		costs,
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
	if (config?.enabled === false) {
		return createNoopMonitor();
	}

	const publicKey = config?.publicKey ?? process.env.LANGFUSE_PUBLIC_KEY;
	const secretKey = config?.secretKey ?? process.env.LANGFUSE_SECRET_KEY;
	const baseUrl =
		config?.baseUrl ?? process.env.LANGFUSE_BASE_URL ?? LANGFUSE_DEFAULT_URL;

	if (!publicKey || !secretKey) {
		return createNoopMonitor();
	}

	const langfuse = await tryLoadLangfuse({ publicKey, secretKey, baseUrl });

	if (!langfuse) {
		return createNoopMonitor();
	}

	const costs: CostEntry[] = [];

	return {
		enabled: true,
		langfuse,
		costs,
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

// ─── Trace ─────────────────────────────────────────────────────────────────

let traceCounter = 0;

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

	const traceId = `trace-${Date.now()}-${++traceCounter}`;
	const attrs: TraceAttributes = {};

	const span: TraceSpan = {
		update(newAttrs) {
			Object.assign(attrs, newAttrs);
		},
	};

	if (!monitor.enabled) {
		const result = await fn(span);
		recordTraceCost(monitor, name, attrs, traceId);
		return { result, traceId };
	}

	const startTime = Date.now();
	let result: T;

	try {
		result = await fn(span);
	} catch (error) {
		if (monitor.langfuse) {
			scoreLangfuse(
				monitor.langfuse as LangfuseClientLike,
				traceId,
				"error",
				1,
				"BOOLEAN",
				error instanceof Error ? error.message : String(error),
			);
		}
		throw error;
	}

	recordTraceCost(monitor, name, attrs, traceId);

	if (monitor.langfuse) {
		scoreLangfuse(
			monitor.langfuse as LangfuseClientLike,
			traceId,
			"duration_ms",
			Date.now() - startTime,
			"NUMERIC",
		);
	}

	return { result, traceId };
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
