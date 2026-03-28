/**
 * Workflow — durable background jobs with retry, cron, and pause/resume.
 *
 * Wraps Inngest behind the toolkit's adapter pattern for durable AI workflows
 * with automatic retries, human-in-the-loop approval, and cost tracking.
 *
 * @example
 * ```ts
 * import { createWorkflow, defineJob, humanInTheLoop, aiStep } from '@jamaalbuilds/ai-toolkit/workflow';
 *
 * const workflow = await createWorkflow({ id: 'my-app' });
 *
 * const processJob = defineJob(workflow, {
 *   id: 'process-data',
 *   trigger: { event: 'app/data.uploaded' },
 * }, async ({ event, step }) => {
 *   const result = await step.run('transform', async () => {
 *     return transformData(event.data);
 *   });
 *
 *   const approval = await humanInTheLoop(step, {
 *     stepId: 'wait-approval',
 *     event: 'app/data.approved',
 *     timeout: '7d',
 *   });
 *
 *   if (!approval) return { status: 'timed_out' };
 *
 *   const summary = await aiStep(step, {
 *     stepId: 'summarize',
 *     prompt: `Summarize: ${JSON.stringify(result)}`,
 *     fallback: 'Summary unavailable',
 *   });
 *
 *   return { status: 'complete', summary: summary.text };
 * });
 * ```
 */

export type {
	AIStepOptions,
	AIStepResult,
	HITLOptions,
	JobConfig,
	JobContext,
	ServeOptions,
	Trigger,
	WorkflowClient,
	WorkflowConfig,
	WorkflowJob,
	WorkflowStep,
} from "./types.js";
export {
	aiStep,
	createWorkflow,
	defineJob,
	humanInTheLoop,
	serve,
} from "./workflow.js";
