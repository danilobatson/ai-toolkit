/**
 * Provider adapter — dynamically loads Vercel AI SDK providers.
 *
 * Each provider is a peer dependency loaded at runtime. If the primary
 * provider fails, the fallback is tried automatically.
 */

import { LLMError } from "../errors/types.js";
import type { AIProvider } from "./types.js";

// ─── Provider Defaults ──────────────────────────────────────────────────────

interface ProviderEntry {
	envKey: string;
	defaultModel: string;
	importPath: string;
	createFn: string;
}

const PROVIDERS: Record<AIProvider, ProviderEntry> = {
	groq: {
		envKey: "GROQ_API_KEY",
		defaultModel: "llama-3.3-70b-versatile",
		importPath: "@ai-sdk/groq",
		createFn: "createGroq",
	},
	openrouter: {
		envKey: "OPENROUTER_API_KEY",
		defaultModel: "google/gemini-2.0-flash-exp:free",
		importPath: "@openrouter/ai-sdk-provider",
		createFn: "createOpenRouter",
	},
	anthropic: {
		envKey: "ANTHROPIC_API_KEY",
		defaultModel: "claude-sonnet-4-20250514",
		importPath: "@ai-sdk/anthropic",
		createFn: "createAnthropic",
	},
	openai: {
		envKey: "OPENAI_API_KEY",
		defaultModel: "gpt-4o",
		importPath: "@ai-sdk/openai",
		createFn: "createOpenAI",
	},
};

/** Detection order for auto-selecting a provider. */
const DETECTION_ORDER: AIProvider[] = [
	"groq",
	"openrouter",
	"anthropic",
	"openai",
];

/** Default fallback mapping. */
const DEFAULT_FALLBACK: Partial<Record<AIProvider, AIProvider>> = {
	groq: "openrouter",
};

// ─── Pricing (per 1M tokens, USD) ───────────────────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
	// Groq (free tier for most models)
	"llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
	"llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
	"gemma2-9b-it": { input: 0.2, output: 0.2 },
	// OpenRouter free models
	"google/gemini-2.0-flash-exp:free": { input: 0, output: 0 },
	// Anthropic
	"claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
	"claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
	// OpenAI
	"gpt-4o": { input: 2.5, output: 10.0 },
	"gpt-4o-mini": { input: 0.15, output: 0.6 },
};

/**
 * Estimate the cost of a request in USD.
 */
export function estimateCost(
	model: string,
	inputTokens: number,
	outputTokens: number,
): { inputCost: number; outputCost: number; totalCost: number } {
	const p = PRICING[model];
	if (!p) return { inputCost: 0, outputCost: 0, totalCost: 0 };
	const inputCost = (inputTokens * p.input) / 1_000_000;
	const outputCost = (outputTokens * p.output) / 1_000_000;
	return { inputCost, outputCost, totalCost: inputCost + outputCost };
}

/**
 * Auto-detect the best available provider from environment variables.
 */
export function detectProvider(): AIProvider {
	for (const provider of DETECTION_ORDER) {
		if (process.env[PROVIDERS[provider].envKey]) {
			return provider;
		}
	}
	throw new LLMError(
		"No AI provider API key found. Set GROQ_API_KEY (free), OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY.",
		{ provider: "unknown", code: "LLM_NO_KEY" },
	);
}

/**
 * Get the default model for a provider.
 */
export function getDefaultModel(provider: AIProvider): string {
	return PROVIDERS[provider].defaultModel;
}

/**
 * Get the default fallback provider.
 */
export function getDefaultFallback(
	primary: AIProvider,
): AIProvider | undefined {
	return DEFAULT_FALLBACK[primary];
}

/**
 * Get the environment variable key for a provider.
 */
export function getProviderEnvKey(provider: AIProvider): string {
	return PROVIDERS[provider].envKey;
}

/**
 * Dynamically load a Vercel AI SDK provider and create a model instance.
 *
 * Returns a LanguageModel compatible with generateText/streamText/generateObject.
 */
export async function loadModel(
	provider: AIProvider,
	model: string,
	apiKey?: string,
): Promise<unknown> {
	const entry = PROVIDERS[provider];
	const key = apiKey ?? process.env[entry.envKey];

	if (!key) {
		throw new LLMError(`${entry.envKey} not set`, {
			provider,
			code: "LLM_NO_KEY",
		});
	}

	try {
		const mod = await import(entry.importPath);
		const createFn = mod[entry.createFn];
		if (typeof createFn !== "function") {
			throw new LLMError(
				`Provider ${provider} does not export ${entry.createFn}`,
				{ provider, code: "LLM_MISSING_DEPENDENCY" },
			);
		}
		const providerInstance = createFn({ apiKey: key });
		return providerInstance(model);
	} catch (error) {
		if (error instanceof LLMError) throw error;
		throw new LLMError(
			`Failed to load ${entry.importPath}. Run: yarn add ${entry.importPath}`,
			{
				provider,
				model,
				code: "LLM_MISSING_DEPENDENCY",
				cause: error instanceof Error ? error : undefined,
			},
		);
	}
}
