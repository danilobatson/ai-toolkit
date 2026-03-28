/**
 * Workflow — durable background jobs with retry, cron, and pause/resume.
 *
 * Wraps Inngest behind the toolkit's adapter pattern for durable AI workflows
 * with automatic retries, human-in-the-loop approval, and cost tracking.
 *
 * @example
 * ```ts
 * import { createWorkflow, defineJob } from '@jamaalbuilds/ai-toolkit/workflow';
 *
 * const workflow = createWorkflow({ id: 'my-app' });
 *
 * const processJob = defineJob(workflow, {
 *   id: 'process-data',
 *   trigger: { event: 'app/data.uploaded' },
 * }, async ({ event, step }) => {
 *   const result = await step.run('transform', async () => {
 *     return transformData(event.data);
 *   });
 *   return result;
 * });
 * ```
 */
