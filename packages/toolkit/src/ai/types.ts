/**
 * AI module types — configuration, responses, and provider interfaces.
 */

import type { z } from "zod";

// ─── Provider Config ────────────────────────────────────────────────────────

/**
 * Supported AI provider identifiers.
 *
 * @example
 * ```ts
 * const provider: AIProvider = 'groq';
 * ```
 */
export type AIProvider = "groq" | "openrouter" | "anthropic" | "openai";

/**
 * Configuration for the AI client.
 *
 * @example
 * ```ts
 * const config: AIConfig = {
 *   provider: 'groq',
 *   model: 'llama-3.3-70b-versatile',
 *   fallbackProvider: 'openrouter',
 *   maxRequestsPerMinute: 60,
 * };
 * const ai = createAI(config);
 * ```
 */
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

/**
 * Options for text generation.
 *
 * @example
 * ```ts
 * const options: GenerateOptions = {
 *   system: 'You are a helpful assistant.',
 *   temperature: 0.7,
 *   maxTokens: 1000,
 * };
 * const result = await ai.generate('Hello', options);
 * ```
 */
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

/**
 * Options for streaming text generation.
 *
 * @example
 * ```ts
 * const options: StreamOptions = {
 *   system: 'You are a helpful assistant.',
 *   onChunk: (chunk) => process.stdout.write(chunk),
 * };
 * const stream = await ai.stream('Tell me a story', options);
 * ```
 */
export interface StreamOptions extends GenerateOptions {
	/** Callback fired on each text chunk. */
	onChunk?: (chunk: string) => void;
}

/**
 * Options for structured output generation.
 *
 * @example
 * ```ts
 * const options: StructuredOptions<typeof schema> = {
 *   schema: z.object({ name: z.string(), age: z.number() }),
 *   schemaName: 'Person',
 * };
 * const result = await ai.structured('Extract person info', options);
 * ```
 */
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

/**
 * Token usage information.
 *
 * @example
 * ```ts
 * const usage: TokenUsage = result.usage;
 * console.log(`Used ${usage.totalTokens} tokens (${usage.inputTokens} in, ${usage.outputTokens} out)`);
 * ```
 */
export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}

/**
 * Cost estimate for a request.
 *
 * @example
 * ```ts
 * const cost: CostEstimate = result.cost;
 * console.log(`Cost: $${cost.totalCost.toFixed(4)} ${cost.currency}`);
 * ```
 */
export interface CostEstimate {
	inputCost: number;
	outputCost: number;
	totalCost: number;
	currency: "USD";
}

/**
 * Response from a text generation request.
 *
 * @example
 * ```ts
 * const result: GenerateResult = await ai.generate('Hello');
 * console.log(result.text);
 * console.log(`${result.model} via ${result.provider} in ${result.latencyMs}ms`);
 * ```
 */
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

/**
 * Response from a streaming text generation request.
 *
 * @example
 * ```ts
 * const stream: StreamResult = await ai.stream('Tell me a story');
 * for await (const chunk of stream.textStream) {
 *   process.stdout.write(chunk);
 * }
 * const fullText = await stream.text;
 * ```
 */
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

/**
 * Response from a structured output request.
 *
 * @example
 * ```ts
 * const result: StructuredResult<{ name: string }> = await ai.structured('Extract name', { schema });
 * console.log(result.object.name);
 * ```
 */
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

/**
 * The AI client interface returned by createAI().
 *
 * @example
 * ```ts
 * const ai: AIClient = createAI({ provider: 'groq' });
 * const result = await ai.generate('Hello');
 * console.log(`${ai.provider}/${ai.model}: ${result.text}`);
 * ```
 */
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
