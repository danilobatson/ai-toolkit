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
 * const result = await trace(monitor, 'rag-query', async (span) => {
 *   span.update({ input: query });
 *   const answer = await generate(ai, query);
 *   span.update({ output: answer.text });
 *   return answer;
 * });
 *
 * await evaluate(monitor, { traceId: result.traceId, name: 'relevance', value: 0.95 });
 * const report = getCostReport(monitor);
 * ```
 */

// Barrel — populated by /writer
