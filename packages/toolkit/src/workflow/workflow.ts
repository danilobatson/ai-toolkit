// ─── Workflow Client + Job Definition ────────────────────────────────────────
// Wraps Inngest behind the toolkit adapter pattern.

import { ToolkitError } from "../errors/index.js";
import type {
	AIStepOptions,
	AIStepResult,
	HITLOptions,
	JobConfig,
	JobContext,
	ServeOptions,
	WorkflowClient,
	WorkflowConfig,
	WorkflowJob,
} from "./types.js";
import {
	AIStepOptionsSchema,
	HITLOptionsSchema,
	JobConfigSchema,
	WorkflowConfigSchema,
} from "./types.js";

// ─── Dynamic Import ─────────────────────────────────────────────────────────

async function loadInngest(): Promise<{
	Inngest: new (config: Record<string, unknown>) => Record<string, unknown>;
}> {
	try {
		const moduleName = "inngest";
		const mod = await import(moduleName);
		if (!mod.Inngest) {
			throw new ToolkitError(
				"Inngest module found but Inngest class not exported — check inngest version",
				{ code: "WORKFLOW_IMPORT_FAILED" },
			);
		}
		return mod;
	} catch (error) {
		if (error instanceof ToolkitError) throw error;
		throw new ToolkitError(
			"inngest is required for the workflow module. Install it with: yarn add inngest",
			{
				code: "WORKFLOW_IMPORT_FAILED",
				cause: error instanceof Error ? error : undefined,
			},
		);
	}
}

// ─── createWorkflow() ───────────────────────────────────────────────────────

/**
 * Create a workflow client for durable background jobs.
 *
 * Wraps Inngest's client with the toolkit's adapter pattern.
 * Requires the `inngest` package as a peer dependency.
 *
 * @param config - Workflow configuration with app id
 * @returns A WorkflowClient wrapping the Inngest client
 *
 * @example
 * ```ts
 * import { createWorkflow } from '@jamaalbuilds/ai-toolkit/workflow';
 *
 * const workflow = createWorkflow({ id: 'my-app' });
 * ```
 */
export async function createWorkflow(
	config: WorkflowConfig,
): Promise<WorkflowClient> {
	const parsed = WorkflowConfigSchema.safeParse(config);
	if (!parsed.success) {
		throw new ToolkitError(
			`createWorkflow() invalid config: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
			{ code: "WORKFLOW_INVALID_CONFIG" },
		);
	}

	const { Inngest } = await loadInngest();

	const inngestConfig: Record<string, unknown> = { id: parsed.data.id };
	if (parsed.data.signingKey) inngestConfig.signingKey = parsed.data.signingKey;
	if (parsed.data.baseUrl) inngestConfig.baseUrl = parsed.data.baseUrl;
	if (parsed.data.isDev !== undefined) inngestConfig.isDev = parsed.data.isDev;

	const client = new Inngest(inngestConfig);

	return {
		id: parsed.data.id,
		inngestClient: client,
	};
}

// ─── defineJob() ────────────────────────────────────────────────────────────

/**
 * Define a durable background job with automatic retries.
 *
 * Uses Inngest v4 2-arg createFunction API (config with triggers array + handler).
 * Verified in spike-all (2026-03-28).
 *
 * The handler receives event data and durable step helpers (run, sleep, waitForEvent, sendEvent).
 *
 * @param client - The workflow client from createWorkflow()
 * @param config - Job configuration (id, trigger, retries, concurrency)
 * @param handler - Async function to execute with event + step context
 * @returns A WorkflowJob that can be passed to serve()
 *
 * @example
 * ```ts
 * import { createWorkflow, defineJob } from '@jamaalbuilds/ai-toolkit/workflow';
 *
 * const workflow = await createWorkflow({ id: 'my-app' });
 *
 * const processJob = defineJob(workflow, {
 *   id: 'process-data',
 *   trigger: { event: 'app/data.uploaded' },
 *   retries: 5,
 * }, async ({ event, step }) => {
 *   const data = await step.run('fetch', async () => fetchData(event.data.id));
 *   await step.sleep('pause', '10s');
 *   return { processed: true, data };
 * });
 * ```
 */
export function defineJob(
	client: WorkflowClient,
	config: JobConfig,
	handler: (ctx: JobContext) => Promise<unknown>,
): WorkflowJob {
	if (!client?.inngestClient) {
		throw new ToolkitError(
			"defineJob() requires a valid WorkflowClient from createWorkflow()",
			{ code: "WORKFLOW_INVALID_CONFIG" },
		);
	}

	const parsed = JobConfigSchema.safeParse(config);
	if (!parsed.success) {
		throw new ToolkitError(
			`defineJob() invalid config: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
			{ code: "WORKFLOW_INVALID_CONFIG" },
		);
	}

	if (typeof handler !== "function") {
		throw new ToolkitError("defineJob() requires a handler function", {
			code: "WORKFLOW_INVALID_CONFIG",
		});
	}

	const inngest = client.inngestClient as {
		createFunction: (
			opts: Record<string, unknown>,
			fn: (ctx: Record<string, unknown>) => Promise<unknown>,
		) => unknown;
	};

	// Build Inngest v4 2-arg config
	const fnConfig: Record<string, unknown> = {
		id: parsed.data.id,
	};

	// Set trigger(s) — v4 uses triggers in first arg
	if ("event" in parsed.data.trigger) {
		fnConfig.triggers = [{ event: parsed.data.trigger.event }];
	} else {
		fnConfig.triggers = [{ cron: parsed.data.trigger.cron }];
	}

	if (parsed.data.retries !== undefined) {
		fnConfig.retries = parsed.data.retries;
	}

	if (parsed.data.concurrency !== undefined) {
		fnConfig.concurrency = [{ limit: parsed.data.concurrency }];
	}

	// Wrap Inngest's raw context into our typed JobContext
	const inngestFn = inngest.createFunction(
		fnConfig,
		async (rawCtx: Record<string, unknown>) => {
			const rawEvent = rawCtx.event as {
				name: string;
				data: Record<string, unknown>;
			};
			const rawStep = rawCtx.step as {
				run: (id: string, fn: () => unknown) => Promise<unknown>;
				sleep: (id: string, duration: string) => Promise<void>;
				waitForEvent: (
					id: string,
					opts: Record<string, unknown>,
				) => Promise<Record<string, unknown> | null>;
				sendEvent: (
					id: string,
					event: Record<string, unknown>,
				) => Promise<void>;
			};

			const ctx: JobContext = {
				event: {
					name: rawEvent?.name ?? "",
					data: rawEvent?.data ?? {},
				},
				step: {
					run: async <T>(id: string, fn: () => T | Promise<T>): Promise<T> => {
						try {
							return (await rawStep.run(id, fn)) as T;
						} catch (error) {
							if (error instanceof ToolkitError) throw error;
							throw new ToolkitError(`Step "${id}" failed`, {
								code: "WORKFLOW_STEP_FAILED",
								retryable: true,
								cause: error instanceof Error ? error : undefined,
							});
						}
					},
					sleep: async (id: string, duration: string): Promise<void> => {
						await rawStep.sleep(id, duration);
					},
					waitForEvent: async (
						id: string,
						opts: { event: string; timeout: string; match?: string },
					) => {
						return rawStep.waitForEvent(id, opts);
					},
					sendEvent: async (
						id: string,
						event: { name: string; data: Record<string, unknown> },
					) => {
						await rawStep.sendEvent(id, event);
					},
				},
			};

			try {
				return await handler(ctx);
			} catch (error) {
				if (error instanceof ToolkitError) throw error;
				throw new ToolkitError(`Job "${parsed.data.id}" failed`, {
					code: "WORKFLOW_JOB_FAILED",
					retryable: true,
					cause: error instanceof Error ? error : undefined,
				});
			}
		},
	);

	return {
		config: parsed.data,
		inngestFn,
	};
}

// ─── humanInTheLoop() ───────────────────────────────────────────────────────

/**
 * Wait for an external event in a workflow (human-in-the-loop approval).
 *
 * Wraps step.waitForEvent with validation and timeout handling.
 * Returns the event payload if received, or null on timeout.
 *
 * @param step - The step object from the job handler context
 * @param options - HITL options (stepId, event, timeout, match)
 * @returns The received event data, or null if timeout
 *
 * @example
 * ```ts
 * import { defineJob, humanInTheLoop } from '@jamaalbuilds/ai-toolkit/workflow';
 *
 * const approvalJob = defineJob(workflow, {
 *   id: 'approval-flow',
 *   trigger: { event: 'app/request.created' },
 * }, async ({ event, step }) => {
 *   const approval = await humanInTheLoop(step, {
 *     stepId: 'wait-approval',
 *     event: 'app/request.approved',
 *     timeout: '7d',
 *     match: 'data.requestId',
 *   });
 *
 *   if (!approval) {
 *     return { status: 'timed_out' };
 *   }
 *   return { status: 'approved', data: approval };
 * });
 * ```
 */
export async function humanInTheLoop(
	step: JobContext["step"],
	options: HITLOptions,
): Promise<Record<string, unknown> | null> {
	const parsed = HITLOptionsSchema.safeParse(options);
	if (!parsed.success) {
		throw new ToolkitError(
			`humanInTheLoop() invalid options: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
			{ code: "WORKFLOW_INVALID_CONFIG" },
		);
	}

	if (!step || typeof step.waitForEvent !== "function") {
		throw new ToolkitError(
			"humanInTheLoop() requires a valid step object from the job handler context",
			{ code: "WORKFLOW_INVALID_CONFIG" },
		);
	}

	try {
		return await step.waitForEvent(parsed.data.stepId, {
			event: parsed.data.event,
			timeout: parsed.data.timeout,
			match: parsed.data.match,
		});
	} catch (error) {
		if (error instanceof ToolkitError) throw error;
		throw new ToolkitError("humanInTheLoop() wait failed", {
			code: "WORKFLOW_HITL_FAILED",
			cause: error instanceof Error ? error : undefined,
		});
	}
}

// ─── aiStep() ───────────────────────────────────────────────────────────────

/**
 * Execute an AI generation step within a durable workflow.
 *
 * Wraps a step.run() call that invokes the ai module's generate function,
 * with optional fallback text if the AI call fails.
 *
 * @param step - The step object from the job handler context
 * @param options - AI step options (stepId, prompt, model, fallback)
 * @returns AIStepResult with text, usedFallback flag, and optional cost
 *
 * @example
 * ```ts
 * import { defineJob, aiStep } from '@jamaalbuilds/ai-toolkit/workflow';
 *
 * const summarizeJob = defineJob(workflow, {
 *   id: 'summarize',
 *   trigger: { event: 'app/doc.uploaded' },
 * }, async ({ event, step }) => {
 *   const result = await aiStep(step, {
 *     stepId: 'generate-summary',
 *     prompt: `Summarize: ${event.data.content}`,
 *     fallback: 'Summary unavailable',
 *   });
 *
 *   return { summary: result.text, usedFallback: result.usedFallback };
 * });
 * ```
 */
export async function aiStep(
	step: JobContext["step"],
	options: AIStepOptions,
): Promise<AIStepResult> {
	const parsed = AIStepOptionsSchema.safeParse(options);
	if (!parsed.success) {
		throw new ToolkitError(
			`aiStep() invalid options: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
			{ code: "WORKFLOW_INVALID_CONFIG" },
		);
	}

	if (!step || typeof step.run !== "function") {
		throw new ToolkitError(
			"aiStep() requires a valid step object from the job handler context",
			{ code: "WORKFLOW_INVALID_CONFIG" },
		);
	}

	return step.run(parsed.data.stepId, async () => {
		try {
			const aiModule = await tryLoadAI();
			if (!aiModule) {
				if (parsed.data.fallback !== undefined) {
					return {
						text: parsed.data.fallback,
						usedFallback: true,
					};
				}
				throw new ToolkitError(
					"ai module not available and no fallback provided. Install ai SDK or provide a fallback.",
					{ code: "WORKFLOW_AI_UNAVAILABLE" },
				);
			}

			const generateOptions: Record<string, unknown> = {
				prompt: parsed.data.prompt,
			};
			if (parsed.data.model) {
				generateOptions.model = parsed.data.model;
			}

			const result = await aiModule.generate(generateOptions);
			return {
				text: result.text,
				usedFallback: false,
				cost: result.usage
					? estimateStepCost(
							result.usage as { inputTokens?: number; outputTokens?: number },
						)
					: undefined,
			};
		} catch (error) {
			if (error instanceof ToolkitError && !parsed.data.fallback) throw error;

			if (parsed.data.fallback !== undefined) {
				return {
					text: parsed.data.fallback,
					usedFallback: true,
				};
			}

			throw new ToolkitError(`AI step "${parsed.data.stepId}" failed`, {
				code: "WORKFLOW_AI_FAILED",
				retryable: true,
				cause: error instanceof Error ? error : undefined,
			});
		}
	});
}

// ─── serve() ────────────────────────────────────────────────────────────────

/**
 * Create a serve handler for Next.js API routes.
 *
 * Returns { GET, POST, PUT } route handlers that Inngest uses
 * to discover and invoke your workflow functions.
 *
 * @param options - Serve options with client and functions
 * @returns Object with GET, POST, PUT handlers for Next.js
 *
 * @example
 * ```ts
 * // app/api/inngest/route.ts
 * import { serve } from '@jamaalbuilds/ai-toolkit/workflow';
 * import { workflow, myJob } from '@/inngest';
 *
 * export const { GET, POST, PUT } = serve({
 *   client: workflow,
 *   functions: [myJob],
 * });
 * ```
 */
export async function serve(
	options: ServeOptions,
): Promise<{ GET: unknown; POST: unknown; PUT: unknown }> {
	if (!options?.client) {
		throw new ToolkitError("serve() requires a client option", {
			code: "WORKFLOW_INVALID_CONFIG",
		});
	}

	if (!options.functions || !Array.isArray(options.functions)) {
		throw new ToolkitError("serve() requires a functions array", {
			code: "WORKFLOW_INVALID_CONFIG",
		});
	}

	try {
		const moduleName = "inngest/next";
		const mod = await import(moduleName);
		const serveHandler = mod.serve;

		if (typeof serveHandler !== "function") {
			throw new ToolkitError(
				"inngest/next serve export not found — check inngest version",
				{ code: "WORKFLOW_IMPORT_FAILED" },
			);
		}

		return serveHandler({
			client: options.client.inngestClient,
			functions: options.functions.map((j) => j.inngestFn),
		});
	} catch (error) {
		if (error instanceof ToolkitError) throw error;
		throw new ToolkitError(
			"Failed to load inngest/next. Install inngest with: yarn add inngest",
			{
				code: "WORKFLOW_IMPORT_FAILED",
				cause: error instanceof Error ? error : undefined,
			},
		);
	}
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

interface AIModuleInterface {
	generate: (opts: Record<string, unknown>) => Promise<{
		text: string;
		usage?: { inputTokens?: number; outputTokens?: number };
	}>;
}

async function tryLoadAI(): Promise<AIModuleInterface | null> {
	try {
		const moduleName = "../ai/ai-client.js";
		const mod = await import(moduleName);
		if (typeof mod.createAI === "function") {
			const ai = mod.createAI();
			if (typeof ai.generate === "function") {
				return ai;
			}
		}
		return null;
	} catch {
		return null;
	}
}

function estimateStepCost(usage: {
	inputTokens?: number;
	outputTokens?: number;
}): number | undefined {
	const input = usage.inputTokens ?? 0;
	const output = usage.outputTokens ?? 0;
	if (input === 0 && output === 0) return undefined;
	// Rough estimate based on typical model pricing ($3/1M input, $15/1M output)
	return (input * 3 + output * 15) / 1_000_000;
}
