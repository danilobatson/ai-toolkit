import { z } from "zod";

/**
 * Workflow module types — durable background jobs with Inngest.
 */

/** Configuration for creating a workflow client. */
export const WorkflowConfigSchema = z.object({
	/** Unique application identifier. */
	id: z.string().min(1),
});

export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;
