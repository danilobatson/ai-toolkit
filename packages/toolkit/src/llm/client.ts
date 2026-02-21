/**
 * LLM — lightweight provider-agnostic completion helpers.
 *
 * For streaming + React hooks, use Vercel AI SDK directly.
 * This module handles server-side, non-streaming LLM calls
 * (e.g., NestJS backend, API routes, BFF logic).
 *
 * @example
 * ```ts
 * import { createLLM } from '@jamaalbuilds/ai-toolkit/llm';
 *
 * const llm = createLLM();  // auto-detects from env vars
 * const response = await llm.complete('Summarize this document.', {
 *   system: 'You are a helpful assistant.',
 * });
 * console.log(response.content);
 * ```
 */

import { LLMError } from "../errors/types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latencyMs: number;
}

export interface LLMConfig {
  /** Provider: 'anthropic' | 'openai'. Auto-detected from env vars if omitted. */
  provider?: "anthropic" | "openai";
  /** Model override. Default: provider's best model. */
  model?: string;
  /** API key override. Default: from env vars. */
  apiKey?: string;
}

export interface CompletionOptions {
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMClient {
  complete(prompt: string, options?: CompletionOptions): Promise<LLMResponse>;
  readonly provider: string;
  readonly model: string;
}

// ─── Pricing Registry ────────────────────────────────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

// ─── Provider Defaults ──────────────────────────────────────────────────────

const PROVIDER_DEFAULTS: Record<string, { model: string; envKey: string }> = {
  anthropic: { model: "claude-sonnet-4-20250514", envKey: "ANTHROPIC_API_KEY" },
  openai: { model: "gpt-4o", envKey: "OPENAI_API_KEY" },
};

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Create an LLM client. Auto-detects provider from env vars.
 *
 * Priority: Anthropic (if ANTHROPIC_API_KEY set) → OpenAI.
 */
export function createLLM(config?: LLMConfig): LLMClient {
  // Detect provider
  let provider = config?.provider;
  if (!provider) {
    if (process.env.ANTHROPIC_API_KEY) provider = "anthropic";
    else if (process.env.OPENAI_API_KEY) provider = "openai";
    else throw new LLMError("No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.", {
      provider: "unknown",
      code: "LLM_NO_KEY",
    });
  }

  const defaults = PROVIDER_DEFAULTS[provider];
  const model = config?.model ?? defaults.model;
  const apiKey = config?.apiKey ?? process.env[defaults.envKey];

  if (!apiKey) {
    throw new LLMError(`${defaults.envKey} not set`, {
      provider,
      code: "LLM_NO_KEY",
    });
  }

  if (provider === "anthropic") {
    return createAnthropicClient(model, apiKey);
  }

  return createOpenAIClient(model, apiKey);
}

// ─── Anthropic ──────────────────────────────────────────────────────────────

function createAnthropicClient(model: string, apiKey: string): LLMClient {
  return {
    provider: "anthropic",
    model,

    async complete(prompt: string, options?: CompletionOptions): Promise<LLMResponse> {
      let Anthropic: any;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        Anthropic = require("@anthropic-ai/sdk");
        if (Anthropic.default) Anthropic = Anthropic.default;
      } catch {
        throw new LLMError(
          "Anthropic SDK not installed. Run: yarn add @anthropic-ai/sdk",
          { provider: "anthropic", model, code: "LLM_MISSING_DEPENDENCY" },
        );
      }

      const client = new Anthropic({ apiKey });
      const start = Date.now();

      try {
        const response = await client.messages.create({
          model,
          max_tokens: options?.maxTokens ?? 4096,
          temperature: options?.temperature,
          system: options?.system,
          messages: [{ role: "user", content: prompt }],
        });

        const content = response.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");

        return {
          content,
          model: response.model,
          provider: "anthropic",
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cost: estimateCost(response.model, response.usage.input_tokens, response.usage.output_tokens),
          latencyMs: Date.now() - start,
        };
      } catch (error) {
        throw new LLMError(
          `Anthropic API error: ${error instanceof Error ? error.message : "Unknown"}`,
          {
            provider: "anthropic",
            model,
            retryable: (error as any)?.status >= 500,
            cause: error instanceof Error ? error : undefined,
          },
        );
      }
    },
  };
}

// ─── OpenAI ─────────────────────────────────────────────────────────────────

function createOpenAIClient(model: string, apiKey: string): LLMClient {
  return {
    provider: "openai",
    model,

    async complete(prompt: string, options?: CompletionOptions): Promise<LLMResponse> {
      let OpenAI: any;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require("openai");
        OpenAI = mod.default ?? mod;
      } catch {
        throw new LLMError(
          "OpenAI SDK not installed. Run: yarn add openai",
          { provider: "openai", model, code: "LLM_MISSING_DEPENDENCY" },
        );
      }

      const client = new OpenAI({ apiKey });
      const start = Date.now();

      try {
        const messages: any[] = [];
        if (options?.system) {
          messages.push({ role: "system", content: options.system });
        }
        messages.push({ role: "user", content: prompt });

        const response = await client.chat.completions.create({
          model,
          messages,
          temperature: options?.temperature,
          max_tokens: options?.maxTokens,
        });

        const content = response.choices[0]?.message?.content ?? "";

        return {
          content,
          model: response.model,
          provider: "openai",
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
          cost: estimateCost(response.model, response.usage?.prompt_tokens ?? 0, response.usage?.completion_tokens ?? 0),
          latencyMs: Date.now() - start,
        };
      } catch (error) {
        throw new LLMError(
          `OpenAI API error: ${error instanceof Error ? error.message : "Unknown"}`,
          {
            provider: "openai",
            model,
            retryable: (error as any)?.status >= 500,
            cause: error instanceof Error ? error : undefined,
          },
        );
      }
    },
  };
}
