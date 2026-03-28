/**
 * Monitor — AI observability with Langfuse tracing, evaluation, and cost tracking.
 *
 * Wraps Langfuse JS SDK behind a consistent toolkit interface.
 * Absorbs the previous observability/ module (createLogger stays).
 *
 * @example
 * ```ts
 * import { createMonitor, trace, evaluate, getCostReport, createLogger } from '@jamaalbuilds/ai-toolkit/monitor';
 *
 * const monitor = createMonitor(); // reads from env vars
 * const { result, traceId } = await trace(monitor, 'rag-query', async (span) => {
 *   span.update({ input: 'What is RAG?', model: 'gpt-4o' });
 *   const answer = await generate(ai, 'What is RAG?');
 *   span.update({ output: answer.text, usage: { promptTokens: 100, completionTokens: 50 } });
 *   return answer;
 * });
 *
 * await evaluate(monitor, { traceId, name: 'relevance', value: 0.95 });
 * const report = getCostReport(monitor);
 * ```
 */

export { createLogger } from "./logger.js";
export {
	createMonitor,
	evaluate,
	exportMetrics,
	getCostReport,
	getTrace,
	getTraces,
	onTrace,
	trace,
} from "./monitor.js";
export type {
	CostEntry,
	CostReport,
	EvaluateOptions,
	Logger,
	LogLevel,
	MetricsExport,
	ModelCostSummary,
	MonitorClient,
	MonitorConfig,
	OnTraceCallback,
	ScoreDataType,
	StoredTrace,
	TokenUsage,
	TraceAttributes,
	TraceResult,
	TraceSpan,
	TraceStoreConfig,
} from "./types.js";
