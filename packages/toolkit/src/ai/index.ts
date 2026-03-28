// New v5 API
export { createAI } from "./ai-client.js";
// Legacy v4 API (kept during migration)
export type {
	CompletionOptions,
	LLMClient,
	LLMConfig,
	LLMResponse,
} from "./client.js";
export { createLLM } from "./client.js";
export type {
	AIClient,
	AIConfig,
	AIProvider,
	CostEstimate,
	GenerateOptions,
	GenerateResult,
	StreamOptions,
	StreamResult,
	StructuredOptions,
	StructuredResult,
	TokenUsage,
} from "./types.js";
