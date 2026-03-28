import { beforeEach, describe, expect, it, vi } from "vitest";
import { LLMError, ValidationError } from "../../errors/types.js";
import { createAI } from "../ai-client.js";

/**
 * Tests for stream() behavior and executeWithFallback fallback path.
 *
 * These tests mock the Vercel AI SDK and provider loading to verify:
 * - stream() returns an async iterable textStream
 * - stream() rejects empty prompt
 * - executeWithFallback falls back to secondary provider on error
 * - Fallback is not attempted for non-retryable errors (LLM_NO_KEY)
 */

// Mock the provider module
const mockLoadModel = vi.fn();
const mockDetectProvider = vi.fn();
const mockEstimateCost = vi.fn();
const mockGetDefaultModel = vi.fn();
const mockGetDefaultFallback = vi.fn();

vi.mock("../provider.js", () => ({
	detectProvider: (...args: unknown[]) => mockDetectProvider(...args),
	loadModel: (...args: unknown[]) => mockLoadModel(...args),
	estimateCost: (...args: unknown[]) => mockEstimateCost(...args),
	getDefaultModel: (...args: unknown[]) => mockGetDefaultModel(...args),
	getDefaultFallback: (...args: unknown[]) => mockGetDefaultFallback(...args),
}));

// Mock the AI SDK
const mockStreamText = vi.fn();
const mockGenerateText = vi.fn();
const mockGenerateObject = vi.fn();

vi.mock("ai", () => ({
	generateText: (...args: unknown[]) => mockGenerateText(...args),
	streamText: (...args: unknown[]) => mockStreamText(...args),
	generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

describe("stream()", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDetectProvider.mockReturnValue("groq");
		mockGetDefaultModel.mockReturnValue("llama-3.3-70b-versatile");
		mockGetDefaultFallback.mockReturnValue("openrouter");
		mockLoadModel.mockResolvedValue({ modelId: "test-model" });
		mockEstimateCost.mockReturnValue({
			inputCost: 0,
			outputCost: 0,
			totalCost: 0,
		});
	});

	it("CRASH — does not throw on valid prompt", async () => {
		mockStreamText.mockResolvedValueOnce({
			textStream: (async function* () {
				yield "hello";
			})(),
			text: Promise.resolve("hello"),
			usage: Promise.resolve({ promptTokens: 5, completionTokens: 5 }),
		});

		const ai = createAI({ provider: "groq" });
		const result = await ai.stream("test prompt");
		expect(result).toHaveProperty("textStream");
		expect(result).toHaveProperty("provider");
		expect(result.usedFallback).toBe(false);
	});

	it("BEHAVIOR — textStream yields chunks", async () => {
		mockStreamText.mockResolvedValueOnce({
			textStream: (async function* () {
				yield "Hello";
				yield " world";
			})(),
			text: Promise.resolve("Hello world"),
			usage: Promise.resolve({ promptTokens: 5, completionTokens: 10 }),
		});

		const ai = createAI({ provider: "groq" });
		const result = await ai.stream("test");

		const chunks: string[] = [];
		for await (const chunk of result.textStream) {
			chunks.push(chunk);
		}

		expect(chunks).toEqual(["Hello", " world"]);
	});

	it("BEHAVIOR — onChunk callback is called for each chunk", async () => {
		mockStreamText.mockResolvedValueOnce({
			textStream: (async function* () {
				yield "a";
				yield "b";
			})(),
			text: Promise.resolve("ab"),
			usage: Promise.resolve({ promptTokens: 1, completionTokens: 2 }),
		});

		const ai = createAI({ provider: "groq" });
		const received: string[] = [];
		const result = await ai.stream("test", {
			onChunk: (chunk) => received.push(chunk),
		});

		// Consume the stream to trigger onChunk
		for await (const _ of result.textStream) {
			// consuming
		}

		expect(received).toEqual(["a", "b"]);
	});

	it("ENVIRONMENT — rejects empty prompt with ValidationError", async () => {
		expect.assertions(2);
		const ai = createAI({ provider: "groq" });
		await expect(ai.stream("")).rejects.toThrow(/prompt is required/i);

		try {
			await ai.stream("");
		} catch (err) {
			expect(err).toBeInstanceOf(ValidationError);
		}
	});

	it("PROVIDER FALLBACK — falls back when primary loadModel fails", async () => {
		mockLoadModel
			.mockRejectedValueOnce(
				new LLMError("Primary down", {
					provider: "groq",
					code: "LLM_PROVIDER_ERROR",
				}),
			)
			.mockResolvedValueOnce({ modelId: "fallback-model" });

		mockStreamText.mockResolvedValueOnce({
			textStream: (async function* () {
				yield "fallback response";
			})(),
			text: Promise.resolve("fallback response"),
			usage: Promise.resolve({ promptTokens: 5, completionTokens: 10 }),
		});

		const ai = createAI({
			provider: "groq",
			fallbackProvider: "openrouter",
		});
		const result = await ai.stream("test");

		expect(result.usedFallback).toBe(true);
		expect(result.provider).toBe("openrouter");
	});
});

describe("executeWithFallback (via generate)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDetectProvider.mockReturnValue("groq");
		mockGetDefaultModel.mockReturnValue("llama-3.3-70b-versatile");
		mockGetDefaultFallback.mockReturnValue("openrouter");
		mockLoadModel.mockResolvedValue({ modelId: "test-model" });
		mockEstimateCost.mockReturnValue({
			inputCost: 0,
			outputCost: 0,
			totalCost: 0,
		});
	});

	it("BEHAVIOR — uses primary provider on success", async () => {
		mockGenerateText.mockResolvedValueOnce({
			text: "primary response",
			usage: { promptTokens: 10, completionTokens: 20 },
			finishReason: "stop",
		});

		const ai = createAI({ provider: "groq" });
		const result = await ai.generate("test");

		expect(result.text).toBe("primary response");
		expect(result.provider).toBe("groq");
		expect(result.usedFallback).toBe(false);
	});

	it("PROVIDER FALLBACK — falls back when primary generate fails", async () => {
		mockLoadModel
			.mockResolvedValueOnce({ modelId: "primary" })
			.mockResolvedValueOnce({ modelId: "fallback" });

		mockGenerateText
			.mockRejectedValueOnce(
				new LLMError("Provider error", {
					provider: "groq",
					code: "LLM_PROVIDER_ERROR",
				}),
			)
			.mockResolvedValueOnce({
				text: "fallback response",
				usage: { promptTokens: 10, completionTokens: 20 },
				finishReason: "stop",
			});

		const ai = createAI({
			provider: "groq",
			fallbackProvider: "openrouter",
			fallbackModel: "meta-llama/llama-3-70b",
		});
		const result = await ai.generate("test");

		expect(result.text).toBe("fallback response");
		expect(result.usedFallback).toBe(true);
	});

	it("ENVIRONMENT — does NOT fallback for LLM_NO_KEY error", async () => {
		mockLoadModel.mockRejectedValueOnce(
			new LLMError("No API key", {
				provider: "groq",
				code: "LLM_NO_KEY",
			}),
		);

		const ai = createAI({
			provider: "groq",
			fallbackProvider: "openrouter",
		});

		await expect(ai.generate("test")).rejects.toThrow(/no api key/i);
	});

	it("ENVIRONMENT — does NOT fallback for LLM_MISSING_DEPENDENCY", async () => {
		mockLoadModel.mockRejectedValueOnce(
			new LLMError("SDK not installed", {
				provider: "groq",
				code: "LLM_MISSING_DEPENDENCY",
			}),
		);

		const ai = createAI({
			provider: "groq",
			fallbackProvider: "openrouter",
		});

		await expect(ai.generate("test")).rejects.toThrow(/sdk not installed/i);
	});

	it("ENVIRONMENT — throws when no fallback configured", async () => {
		mockLoadModel.mockResolvedValueOnce({ modelId: "primary" });
		mockGetDefaultFallback.mockReturnValue(undefined);

		mockGenerateText.mockRejectedValueOnce(
			new LLMError("Server error", {
				provider: "groq",
				code: "LLM_PROVIDER_ERROR",
			}),
		);

		const ai = createAI({ provider: "groq" });
		await expect(ai.generate("test")).rejects.toThrow(/server error/i);
	});
});

describe("rate limiting", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDetectProvider.mockReturnValue("groq");
		mockGetDefaultModel.mockReturnValue("llama-3.3-70b-versatile");
		mockGetDefaultFallback.mockReturnValue(undefined);
		mockLoadModel.mockResolvedValue({ modelId: "test-model" });
		mockEstimateCost.mockReturnValue({
			inputCost: 0,
			outputCost: 0,
			totalCost: 0,
		});
	});

	it("BEHAVIOR — throws LLMError when maxRequestsPerMinute exceeded", async () => {
		mockGenerateText.mockResolvedValue({
			text: "ok",
			usage: { promptTokens: 5, completionTokens: 5 },
			finishReason: "stop",
		});

		const ai = createAI({
			provider: "groq",
			maxRequestsPerMinute: 2,
		});

		await ai.generate("first");
		await ai.generate("second");
		await expect(ai.generate("third")).rejects.toThrow(/requests\/minute exceeded/i);
	});

	it("BEHAVIOR — throws LLMError when maxTokensPerDay exceeded", async () => {
		mockGenerateText.mockResolvedValue({
			text: "ok",
			usage: { promptTokens: 50, completionTokens: 50 },
			finishReason: "stop",
		});

		const ai = createAI({
			provider: "groq",
			maxTokensPerDay: 100,
		});

		// First call uses 100 tokens (50+50), filling the budget
		await ai.generate("first");
		// Second call should be blocked
		await expect(ai.generate("second")).rejects.toThrow(/tokens\/day exceeded/i);
	});

	it("DATA QUALITY — rate limit error has retryable flag", async () => {
		mockGenerateText.mockResolvedValue({
			text: "ok",
			usage: { promptTokens: 5, completionTokens: 5 },
			finishReason: "stop",
		});

		const ai = createAI({
			provider: "groq",
			maxRequestsPerMinute: 1,
		});

		await ai.generate("first");
		try {
			await ai.generate("second");
		} catch (err) {
			expect(err).toBeInstanceOf(LLMError);
			expect((err as LLMError).retryable).toBe(true);
		}
	});
});

describe("stream() — abort signal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDetectProvider.mockReturnValue("groq");
		mockGetDefaultModel.mockReturnValue("llama-3.3-70b-versatile");
		mockGetDefaultFallback.mockReturnValue(undefined);
		mockLoadModel.mockResolvedValue({ modelId: "test-model" });
		mockEstimateCost.mockReturnValue({
			inputCost: 0,
			outputCost: 0,
			totalCost: 0,
		});
	});

	it("BEHAVIOR — passes abortSignal to streamText", async () => {
		const controller = new AbortController();
		mockStreamText.mockResolvedValueOnce({
			textStream: (async function* () {
				yield "hello";
			})(),
			text: Promise.resolve("hello"),
			usage: Promise.resolve({ promptTokens: 5, completionTokens: 5 }),
		});

		const ai = createAI({ provider: "groq" });
		await ai.stream("test", { abortSignal: controller.signal });

		expect(mockStreamText).toHaveBeenCalledWith(
			expect.objectContaining({ abortSignal: controller.signal }),
		);
	});
});
