import { z } from "zod";

/**
 * Workflow module types — durable background jobs with Inngest.
 */

// ─── Schemas ────────────────────────────────────────────────────────────────

/** Configuration for creating a workflow client. */
export const WorkflowConfigSchema = z.object({
	/** Unique application identifier. */
	id: z.string().min(1),
	/** Inngest signing key for production. Omit for dev mode. */
	signingKey: z.string().optional(),
	/** Base URL override for the Inngest API. */
	baseUrl: z.string().url().optional(),
	/** Force dev mode (no signing key required). */
	isDev: z.boolean().optional(),
});

/** Schema for job trigger configuration. */
export const TriggerSchema = z.union([
	z.object({ event: z.string().min(1) }),
	z.object({ cron: z.string().min(1) }),
]);

/** Schema for job configuration. */
export const JobConfigSchema = z.object({
	/** Unique job identifier. */
	id: z.string().min(1),
	/** Trigger: an event name or cron schedule. */
	trigger: TriggerSchema,
	/** Number of retries on failure (default: 3). */
	retries: z.number().int().min(0).optional(),
	/** Concurrency limit (max parallel runs). */
	concurrency: z.number().int().min(1).optional(),
});

/** Schema for humanInTheLoop options. */
export const HITLOptionsSchema = z.object({
	/** Step ID for logging and memoization. */
	stepId: z.string().min(1),
	/** Event name to wait for. */
	event: z.string().min(1),
	/** Timeout duration string (e.g. "7d", "30m", "1h"). */
	timeout: z.string().min(1),
	/** Dot-notation property to match between trigger and wait event. */
	match: z.string().optional(),
});

/** Schema for cost pricing configuration. */
export const PricingConfigSchema = z.object({
	/** Cost per million input tokens in USD. Default: 3. */
	inputCostPerMillionTokens: z.number().min(0),
	/** Cost per million output tokens in USD. Default: 15. */
	outputCostPerMillionTokens: z.number().min(0),
});

/** Schema for aiStep options. */
export const AIStepOptionsSchema = z.object({
	/** Step ID for logging and memoization. */
	stepId: z.string().min(1),
	/** Prompt text to send to the AI model. */
	prompt: z.string().min(1),
	/** Optional model override. */
	model: z.string().optional(),
	/** Optional fallback response if AI call fails. */
	fallback: z.string().optional(),
	/** Optional pricing config for cost estimation. */
	pricing: PricingConfigSchema.optional(),
});

// ─── Types ──────────────────────────────────────────────────────────────────

export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

export type Trigger = z.infer<typeof TriggerSchema>;

export type JobConfig = z.infer<typeof JobConfigSchema>;

export type HITLOptions = z.infer<typeof HITLOptionsSchema>;

export type AIStepOptions = z.infer<typeof AIStepOptionsSchema>;

/** Result of an AI step execution. */
export interface AIStepResult {
	/** The generated text response. */
	text: string;
	/** Whether the fallback was used. */
	usedFallback: boolean;
	/** Estimated cost in USD (if available). */
	cost?: number;
}

/** A toolkit step helper that wraps Inngest's step object. */
export interface WorkflowStep {
	/** Execute a durable step with automatic retry. */
	run: <T>(id: string, handler: () => T | Promise<T>) => Promise<T>;
	/** Pause execution for a duration. */
	sleep: (id: string, duration: string) => Promise<void>;
	/** Wait for an external event (human-in-the-loop). */
	waitForEvent: (
		id: string,
		options: { event: string; timeout: string; match?: string },
	) => Promise<Record<string, unknown> | null>;
	/** Send an event from within a workflow step. */
	sendEvent: (
		id: string,
		event: { name: string; data: Record<string, unknown> },
	) => Promise<void>;
}

/** Context passed to a job handler. */
export interface JobContext {
	/** The triggering event. */
	event: { name: string; data: Record<string, unknown> };
	/** Durable step helpers. */
	step: WorkflowStep;
}

/** A defined workflow job (Inngest function wrapper). */
export interface WorkflowJob {
	/** The job configuration. */
	config: JobConfig;
	/** The underlying Inngest function (for serve()). */
	inngestFn: unknown;
}

/** The workflow client (Inngest client wrapper). */
export interface WorkflowClient {
	/** The client id. */
	id: string;
	/** The underlying Inngest client (for serve() and advanced usage). */
	inngestClient: unknown;
}

/** Options for the serve function. */
export interface ServeOptions {
	/** The workflow client. */
	client: WorkflowClient;
	/** Array of workflow jobs to serve. */
	functions: WorkflowJob[];
}
