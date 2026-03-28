import { afterEach, describe, expect, it } from "vitest";
import { LLMError, ValidationError } from "../../errors/types.js";
import { createAI } from "../ai-client.js";

describe("createAI", () => {
	const origGroq = process.env.GROQ_API_KEY;
	const origOpenRouter = process.env.OPENROUTER_API_KEY;
	const origAnthropic = process.env.ANTHROPIC_API_KEY;
	const origOpenai = process.env.OPENAI_API_KEY;

	afterEach(() => {
		// Restore env vars
		if (origGroq) process.env.GROQ_API_KEY = origGroq;
		else delete process.env.GROQ_API_KEY;
		if (origOpenRouter) process.env.OPENROUTER_API_KEY = origOpenRouter;
		else delete process.env.OPENROUTER_API_KEY;
		if (origAnthropic) process.env.ANTHROPIC_API_KEY = origAnthropic;
		else delete process.env.ANTHROPIC_API_KEY;
		if (origOpenai) process.env.OPENAI_API_KEY = origOpenai;
		else delete process.env.OPENAI_API_KEY;
	});

	it("throws LLMError when no provider keys set", () => {
		delete process.env.GROQ_API_KEY;
		delete process.env.OPENROUTER_API_KEY;
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.OPENAI_API_KEY;

		expect(() => createAI()).toThrow(/no ai provider/i);
		try {
			createAI();
		} catch (err) {
			expect(err).toBeInstanceOf(LLMError);
		}
	});

	it("auto-detects Groq when GROQ_API_KEY is set", () => {
		process.env.GROQ_API_KEY = "gsk_test123";
		delete process.env.OPENROUTER_API_KEY;
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.OPENAI_API_KEY;

		const ai = createAI();
		expect(ai.provider).toBe("groq");
		expect(ai.model).toBe("llama-3.3-70b-versatile");
	});

	it("auto-detects OpenRouter when only OPENROUTER_API_KEY is set", () => {
		delete process.env.GROQ_API_KEY;
		process.env.OPENROUTER_API_KEY = "sk-or-test123";
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.OPENAI_API_KEY;

		const ai = createAI();
		expect(ai.provider).toBe("openrouter");
	});

	it("accepts explicit provider config", () => {
		process.env.OPENAI_API_KEY = "sk-test";
		const ai = createAI({ provider: "openai" });
		expect(ai.provider).toBe("openai");
		expect(ai.model).toBe("gpt-4o");
	});

	it("accepts custom model override", () => {
		process.env.GROQ_API_KEY = "gsk_test";
		const ai = createAI({ model: "gemma2-9b-it" });
		expect(ai.model).toBe("gemma2-9b-it");
	});

	it("exposes generate, stream, structured methods", () => {
		process.env.GROQ_API_KEY = "gsk_test";
		const ai = createAI();
		expect(typeof ai.generate).toBe("function");
		expect(typeof ai.stream).toBe("function");
		expect(typeof ai.structured).toBe("function");
	});

	it("generate rejects empty prompt with ValidationError", async () => {
		process.env.GROQ_API_KEY = "gsk_test";
		const ai = createAI();
		await expect(ai.generate("")).rejects.toThrow(/prompt is required/i);
		try {
			await ai.generate("");
		} catch (err) {
			expect(err).toBeInstanceOf(ValidationError);
		}
	});

	it("structured rejects missing schema with ValidationError", async () => {
		process.env.GROQ_API_KEY = "gsk_test";
		const ai = createAI();
		await expect(
			// @ts-expect-error — intentionally testing missing schema
			ai.structured("test", {}),
		).rejects.toThrow(/schema is required/i);
	});
});
