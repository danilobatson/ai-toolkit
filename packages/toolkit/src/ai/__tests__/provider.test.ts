import { afterEach, describe, expect, it } from "vitest";
import { LLMError } from "../../errors/types.js";
import {
	detectProvider,
	estimateCost,
	getDefaultFallback,
	getDefaultModel,
	getProviderEnvKey,
} from "../provider.js";

describe("detectProvider", () => {
	const origGroq = process.env.GROQ_API_KEY;
	const origOpenRouter = process.env.OPENROUTER_API_KEY;
	const origAnthropic = process.env.ANTHROPIC_API_KEY;
	const origOpenai = process.env.OPENAI_API_KEY;

	afterEach(() => {
		if (origGroq) process.env.GROQ_API_KEY = origGroq;
		else delete process.env.GROQ_API_KEY;
		if (origOpenRouter) process.env.OPENROUTER_API_KEY = origOpenRouter;
		else delete process.env.OPENROUTER_API_KEY;
		if (origAnthropic) process.env.ANTHROPIC_API_KEY = origAnthropic;
		else delete process.env.ANTHROPIC_API_KEY;
		if (origOpenai) process.env.OPENAI_API_KEY = origOpenai;
		else delete process.env.OPENAI_API_KEY;
	});

	it("prefers Groq when GROQ_API_KEY is set", () => {
		process.env.GROQ_API_KEY = "test";
		process.env.OPENAI_API_KEY = "test";
		expect(detectProvider()).toBe("groq");
	});

	it("falls back to OpenRouter", () => {
		delete process.env.GROQ_API_KEY;
		process.env.OPENROUTER_API_KEY = "test";
		expect(detectProvider()).toBe("openrouter");
	});

	it("throws LLMError when no keys set", () => {
		delete process.env.GROQ_API_KEY;
		delete process.env.OPENROUTER_API_KEY;
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.OPENAI_API_KEY;
		expect(() => detectProvider()).toThrow(LLMError);
	});
});

describe("estimateCost", () => {
	it("calculates cost for known model", () => {
		const cost = estimateCost("gpt-4o", 1000, 500);
		expect(cost.inputCost).toBeCloseTo(0.0025);
		expect(cost.outputCost).toBeCloseTo(0.005);
		expect(cost.totalCost).toBeCloseTo(0.0075);
	});

	it("returns zero for unknown model", () => {
		const cost = estimateCost("unknown-model", 1000, 500);
		expect(cost.totalCost).toBe(0);
	});

	it("returns zero for free model", () => {
		const cost = estimateCost("google/gemini-2.0-flash-exp:free", 1000, 500);
		expect(cost.totalCost).toBe(0);
	});
});

describe("getDefaultModel", () => {
	it("returns correct model for each provider", () => {
		expect(getDefaultModel("groq")).toBe("llama-3.3-70b-versatile");
		expect(getDefaultModel("openrouter")).toBe(
			"google/gemini-2.0-flash-exp:free",
		);
		expect(getDefaultModel("anthropic")).toBe("claude-sonnet-4-20250514");
		expect(getDefaultModel("openai")).toBe("gpt-4o");
	});
});

describe("getDefaultFallback", () => {
	it("returns openrouter for groq", () => {
		expect(getDefaultFallback("groq")).toBe("openrouter");
	});

	it("returns undefined for providers without default fallback", () => {
		expect(getDefaultFallback("openai")).toBeUndefined();
	});
});

describe("getProviderEnvKey", () => {
	it("returns correct env key", () => {
		expect(getProviderEnvKey("groq")).toBe("GROQ_API_KEY");
		expect(getProviderEnvKey("openrouter")).toBe("OPENROUTER_API_KEY");
	});
});
