/**
 * AI module types — configuration, responses, and provider interfaces.
 */

import type { z } from "zod";

// ─── Provider Config ────────────────────────────────────────────────────────

/** Supported AI provider identifiers. */
export type AIProvider = "groq" | "openrouter" | "anthropic" | "openai";

/** Configuration for the AI client. */
export interface AIConfig {
	/** Primary provider. Default: auto-detected from env vars (Groq → OpenRouter → Anthropic → OpenAI). */
	provider?: AIProvider;
	/** Fallback provider when primary fails. Default: 'openrouter' if primary is 'groq'. */
	fallbackProvider?: AIProvider;
	/** Model override for primary provider. */
	model?: string;
	/** Model override for fallback provider. */
	fallbackModel?: string;
	/** API key override for primary provider. Default: from env vars. */
	apiKey?: string;
	/** API key override for fallback provider. Default: from env vars. */
	fallbackApiKey?: string;
	/** Max requests per minute (rate limiting). Default: no limit. */
	maxRequestsPerMinute?: number;
	/** Max tokens per day (rate limiting). Default: no limit. */
	maxTokensPerDay?: number;
}

// ─── Generation Options ─────────────────────────────────────────────────────

/** Options for text generation. */
export interface GenerateOptions {
	/** System prompt. */
	system?: string;
	/** Temperature (0-2). Lower = more deterministic. */
	temperature?: number;
	/** Maximum output tokens. */
	maxTokens?: number;
	/** Stop sequences. */
	stopSequences?: string[];
	/** Abort signal for cancellation. */
	abortSignal?: AbortSignal;
}

/** Options for streaming text generation. */
export interface StreamOptions extends GenerateOptions {
	/** Callback fired on each text chunk. */
	onChunk?: (chunk: string) => void;
}

/** Options for structured output generation. */
export interface StructuredOptions<T extends z.ZodType>
	extends GenerateOptions {
	/** Zod schema for the expected output shape. */
	schema: T;
	/** Schema name (helps the model understand what to generate). */
	schemaName?: string;
	/** Schema description. */
	schemaDescription?: string;
}

// ─── Responses ──────────────────────────────────────────────────────────────

/** Token usage information. */
export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}

/** Cost estimate for a request. */
export interface CostEstimate {
	inputCost: number;
	outputCost: number;
	totalCost: number;
	currency: "USD";
}

/** Response from a text generation request. */
export interface GenerateResult {
	/** Generated text. */
	text: string;
	/** Model that produced the response. */
	model: string;
	/** Provider that served the request. */
	provider: string;
	/** Whether fallback was used. */
	usedFallback: boolean;
	/** Token usage. */
	usage: TokenUsage;
	/** Cost estimate. */
	cost: CostEstimate;
	/** Latency in milliseconds. */
	latencyMs: number;
	/** Finish reason. */
	finishReason: string;
}

/** Response from a streaming text generation request. */
export interface StreamResult {
	/** Async iterable of text chunks. */
	textStream: AsyncIterable<string>;
	/** Promise that resolves to the full text after streaming completes. */
	text: Promise<string>;
	/** Promise that resolves to usage after streaming completes. */
	usage: Promise<TokenUsage>;
	/** Provider that served the request. */
	provider: string;
	/** Whether fallback was used. */
	usedFallback: boolean;
}

/** Response from a structured output request. */
export interface StructuredResult<T> {
	/** Parsed and validated output matching the schema. */
	object: T;
	/** Model that produced the response. */
	model: string;
	/** Provider that served the request. */
	provider: string;
	/** Whether fallback was used. */
	usedFallback: boolean;
	/** Token usage. */
	usage: TokenUsage;
	/** Cost estimate. */
	cost: CostEstimate;
	/** Latency in milliseconds. */
	latencyMs: number;
}

// ─── AI Client ──────────────────────────────────────────────────────────────

/** The AI client interface returned by createAI(). */
export interface AIClient {
	/** Generate text from a prompt. */
	generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;
	/** Stream text from a prompt. */
	stream(prompt: string, options?: StreamOptions): Promise<StreamResult>;
	/** Generate structured output matching a Zod schema. */
	structured<T extends z.ZodType>(
		prompt: string,
		options: StructuredOptions<T>,
	): Promise<StructuredResult<z.infer<T>>>;
	/** The primary provider name. */
	readonly provider: string;
	/** The primary model name. */
	readonly model: string;
}
