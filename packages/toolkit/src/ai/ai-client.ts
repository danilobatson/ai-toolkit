/**
 * AI Client — wraps Vercel AI SDK with provider fallback, cost tracking, rate limiting.
 *
 * @example
 * ```ts
 * import { createAI } from '@jamaalbuilds/ai-toolkit/ai';
 *
 * // Zero config — auto-detects Groq from GROQ_API_KEY
 * const ai = createAI();
 *
 * // Generate text
 * const result = await ai.generate('Explain quantum computing in one sentence.');
 * console.log(result.text, result.cost.totalCost);
 *
 * // Stream text
 * const stream = await ai.stream('Write a haiku about TypeScript.');
 * for await (const chunk of stream.textStream) {
 *   process.stdout.write(chunk);
 * }
 *
 * // Structured output with Zod
 * import { z } from 'zod';
 * const { object } = await ai.structured('Generate a user profile', {
 *   schema: z.object({ name: z.string(), age: z.number(), bio: z.string() }),
 * });
 * console.log(object.name); // fully typed!
 * ```
 */

import type { z } from "zod";
import { LLMError, ValidationError } from "../errors/types.js";
import {
	detectProvider,
	estimateCost,
	getDefaultFallback,
	getDefaultModel,
	loadModel,
} from "./provider.js";
import type {
	AIClient,
	AIConfig,
	AIProvider,
	GenerateOptions,
	GenerateResult,
	StreamOptions,
	StreamResult,
	StructuredOptions,
	StructuredResult,
	TokenUsage,
} from "./types.js";

// ─── Rate Limiter (in-memory) ───────────────────────────────────────────────

// Sliding 24h window, not calendar-day reset
interface RateLimitState {
	requestTimestamps: number[];
	tokensInWindow: number;
	windowStart: number;
}

function checkRateLimit(state: RateLimitState, config: AIConfig): void {
	const now = Date.now();

	// Reset sliding window after 24h
	if (now - state.windowStart > 86_400_000) {
		state.tokensInWindow = 0;
		state.windowStart = now;
	}

	// Check requests per minute
	if (config.maxRequestsPerMinute) {
		state.requestTimestamps = state.requestTimestamps.filter(
			(ts) => now - ts < 60_000,
		);
		if (state.requestTimestamps.length >= config.maxRequestsPerMinute) {
			throw new LLMError(
				`Rate limit: ${config.maxRequestsPerMinute} requests/minute exceeded`,
				{ provider: "rate-limiter", code: "LLM_RATE_LIMITED", retryable: true },
			);
		}
	}

	// Check tokens per day
	if (config.maxTokensPerDay && state.tokensInWindow >= config.maxTokensPerDay) {
		throw new LLMError(
			`Rate limit: ${config.maxTokensPerDay} tokens/day exceeded`,
			{ provider: "rate-limiter", code: "LLM_RATE_LIMITED", retryable: false },
		);
	}
}

function recordUsage(state: RateLimitState, tokens: number): void {
	state.requestTimestamps.push(Date.now());
	state.tokensInWindow += tokens;
}

// ─── AI SDK Dynamic Imports ─────────────────────────────────────────────────

interface AISDKFunctions {
	generateText: (
		opts: Record<string, unknown>,
	) => Promise<Record<string, unknown>>;
	streamText: (
		opts: Record<string, unknown>,
	) => Promise<Record<string, unknown>>;
	generateObject: (
		opts: Record<string, unknown>,
	) => Promise<Record<string, unknown>>;
}

async function loadAISDK(): Promise<AISDKFunctions> {
	try {
		// Variable-based import to skip TypeScript module resolution.
		// The 'ai' package is a peer dependency — installed by the consumer.
		const aiPath = "ai";
		const mod = await import(aiPath);
		return {
			generateText: mod.generateText as AISDKFunctions["generateText"],
			streamText: mod.streamText as AISDKFunctions["streamText"],
			generateObject: mod.generateObject as AISDKFunctions["generateObject"],
		};
	} catch {
		throw new LLMError("Vercel AI SDK not installed. Run: yarn add ai", {
			provider: "ai-sdk",
			code: "LLM_MISSING_DEPENDENCY",
		});
	}
}

// ─── Stream Helpers ────────────────────────────────────────────────────────

function wrapStreamWithCallback(
	textStream: AsyncIterable<string>,
	onChunk?: (chunk: string) => void,
): AsyncIterable<string> {
	if (!onChunk) return textStream;
	const cb = onChunk;
	const original = textStream;
	return (async function* () {
		for await (const chunk of original) {
			cb(chunk);
			yield chunk;
		}
	})();
}

// ─── Usage Helpers ──────────────────────────────────────────────────────────

function extractUsage(usage: unknown): TokenUsage {
	if (typeof usage === "object" && usage !== null) {
		const u = usage as Record<string, unknown>;
		const input =
			typeof u.promptTokens === "number"
				? u.promptTokens
				: typeof u.inputTokens === "number"
					? u.inputTokens
					: 0;
		const output =
			typeof u.completionTokens === "number"
				? u.completionTokens
				: typeof u.outputTokens === "number"
					? u.outputTokens
					: 0;
		return {
			inputTokens: input,
			outputTokens: output,
			totalTokens: input + output,
		};
	}
	return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

// ─── Shared Client Context ─────────────────────────────────────────────────

interface AIClientContext {
	primaryProvider: AIProvider;
	fallbackProvider: AIProvider | undefined;
	primaryModel: string;
	fallbackModel: string | undefined;
	config: AIConfig | undefined;
	resolvedConfig: AIConfig;
	rateLimitState: RateLimitState;
}

async function executeWithFallback<T>(
	ctx: AIClientContext,
	operation: (
		model: unknown,
		provider: string,
		modelName: string,
	) => Promise<T>,
): Promise<T> {
	checkRateLimit(ctx.rateLimitState, ctx.resolvedConfig);

	try {
		const model = await loadModel(
			ctx.primaryProvider,
			ctx.primaryModel,
			ctx.config?.apiKey,
		);
		return await operation(model, ctx.primaryProvider, ctx.primaryModel);
	} catch (error) {
		if (
			ctx.fallbackProvider &&
			ctx.fallbackModel &&
			error instanceof LLMError &&
			error.code !== "LLM_NO_KEY" &&
			error.code !== "LLM_MISSING_DEPENDENCY"
		) {
			const fbModel = await loadModel(
				ctx.fallbackProvider,
				ctx.fallbackModel,
				ctx.config?.fallbackApiKey,
			);
			return await operation(fbModel, ctx.fallbackProvider, ctx.fallbackModel);
		}
		throw error;
	}
}

// ─── Method Implementations ────────────────────────────────────────────────

async function generateImpl(
	ctx: AIClientContext,
	prompt: string,
	options?: GenerateOptions,
): Promise<GenerateResult> {
	if (!prompt) {
		throw new ValidationError("prompt is required");
	}

	const sdk = await loadAISDK();
	const start = Date.now();

	return executeWithFallback(ctx, async (model, provider, modelName) => {
		const result = await sdk.generateText({
			model,
			prompt,
			system: options?.system,
			temperature: options?.temperature,
			maxTokens: options?.maxTokens,
			stopSequences: options?.stopSequences,
			abortSignal: options?.abortSignal,
		});

		const usage = extractUsage(result.usage);
		recordUsage(ctx.rateLimitState, usage.totalTokens);
		const cost = estimateCost(modelName, usage.inputTokens, usage.outputTokens);

		return {
			text: String(result.text ?? ""),
			model: modelName,
			provider,
			usedFallback: provider !== ctx.primaryProvider,
			usage,
			cost: { ...cost, currency: "USD" },
			latencyMs: Date.now() - start,
			finishReason: String(result.finishReason ?? "unknown"),
		};
	});
}

// Cannot retry mid-stream — fallback only applies during model loading
async function streamImpl(
	ctx: AIClientContext,
	prompt: string,
	options?: StreamOptions,
): Promise<StreamResult> {
	if (!prompt) {
		throw new ValidationError("prompt is required");
	}

	checkRateLimit(ctx.rateLimitState, ctx.resolvedConfig);

	const sdk = await loadAISDK();
	let usedFallback = false;
	let resolvedProvider = ctx.primaryProvider;

	let model: unknown;
	try {
		model = await loadModel(ctx.primaryProvider, ctx.primaryModel, ctx.config?.apiKey);
	} catch (error) {
		if (ctx.fallbackProvider && ctx.fallbackModel) {
			model = await loadModel(
				ctx.fallbackProvider,
				ctx.fallbackModel,
				ctx.config?.fallbackApiKey,
			);
			usedFallback = true;
			resolvedProvider = ctx.fallbackProvider;
		} else {
			throw error;
		}
	}

	const result = await sdk.streamText({
		model,
		prompt,
		system: options?.system,
		temperature: options?.temperature,
		maxTokens: options?.maxTokens,
		stopSequences: options?.stopSequences,
		abortSignal: options?.abortSignal,
	});

	const typedResult = result as {
		textStream: AsyncIterable<string>;
		text: Promise<string>;
		usage: Promise<unknown>;
	};

	const usagePromise = typedResult.usage.then((u: unknown) => {
		const usage = extractUsage(u);
		recordUsage(ctx.rateLimitState, usage.totalTokens);
		return usage;
	});

	return {
		textStream: wrapStreamWithCallback(typedResult.textStream, options?.onChunk),
		text: typedResult.text,
		usage: usagePromise,
		provider: resolvedProvider,
		usedFallback,
	};
}

async function structuredImpl<T extends z.ZodType>(
	ctx: AIClientContext,
	prompt: string,
	options: StructuredOptions<T>,
): Promise<StructuredResult<z.infer<T>>> {
	if (!prompt) {
		throw new ValidationError("prompt is required");
	}
	if (!options?.schema) {
		throw new ValidationError("schema is required for structured output");
	}

	const sdk = await loadAISDK();
	const start = Date.now();

	return executeWithFallback(ctx, async (model, provider, modelName) => {
		const result = await sdk.generateObject({
			model,
			prompt,
			schema: options.schema,
			schemaName: options.schemaName,
			schemaDescription: options.schemaDescription,
			system: options.system,
			temperature: options.temperature,
			maxTokens: options.maxTokens,
		});

		const usage = extractUsage(result.usage);
		recordUsage(ctx.rateLimitState, usage.totalTokens);
		const cost = estimateCost(modelName, usage.inputTokens, usage.outputTokens);

		return {
			object: result.object as z.infer<T>,
			model: modelName,
			provider,
			usedFallback: provider !== ctx.primaryProvider,
			usage,
			cost: { ...cost, currency: "USD" },
			latencyMs: Date.now() - start,
		};
	});
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Create an AI client with provider fallback and cost tracking.
 *
 * Auto-detects provider from env vars: GROQ_API_KEY → OPENROUTER_API_KEY → ANTHROPIC_API_KEY → OPENAI_API_KEY.
 * Falls back to secondary provider on failure.
 *
 * @example
 * ```ts
 * const ai = createAI(); // zero config with GROQ_API_KEY
 * const ai = createAI({ provider: 'groq', fallbackProvider: 'openrouter' });
 * const ai = createAI({ maxRequestsPerMinute: 30, maxTokensPerDay: 100000 });
 * ```
 */
export function createAI(config?: AIConfig): AIClient {
	const primaryProvider = config?.provider ?? detectProvider();
	const fallbackProvider =
		config?.fallbackProvider ?? getDefaultFallback(primaryProvider);
	const primaryModel = config?.model ?? getDefaultModel(primaryProvider);
	const fallbackModel =
		config?.fallbackModel ??
		(fallbackProvider ? getDefaultModel(fallbackProvider) : undefined);

	const ctx: AIClientContext = {
		primaryProvider,
		fallbackProvider,
		primaryModel,
		fallbackModel,
		config,
		resolvedConfig: { ...config, provider: primaryProvider },
		rateLimitState: {
			requestTimestamps: [],
			tokensInWindow: 0,
			windowStart: Date.now(),
		},
	};

	return {
		provider: primaryProvider,
		model: primaryModel,
		generate: (prompt, options) => generateImpl(ctx, prompt, options),
		stream: (prompt, options) => streamImpl(ctx, prompt, options),
		structured: (prompt, options) => structuredImpl(ctx, prompt, options),
	};
}
