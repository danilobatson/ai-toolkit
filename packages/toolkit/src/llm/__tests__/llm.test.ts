import { describe, expect, it } from "vitest";
import { LLMError } from "../../errors/types.js";
import { mockLLM } from "../../testing/mocks.js";
import { createLLM } from "../client.js";

describe("createLLM", () => {
	it("throws LLMError when no provider keys set", () => {
		// Ensure env vars are not set
		const origAnthropic = process.env.ANTHROPIC_API_KEY;
		const origOpenai = process.env.OPENAI_API_KEY;
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.OPENAI_API_KEY;
		try {
			expect(() => createLLM()).toThrow(/no llm api key/i);
			try {
				createLLM();
			} catch (err) {
				expect(err).toBeInstanceOf(LLMError);
			}
		} finally {
			if (origAnthropic) process.env.ANTHROPIC_API_KEY = origAnthropic;
			if (origOpenai) process.env.OPENAI_API_KEY = origOpenai;
		}
	});

	it("returns client when provider key is set", () => {
		const origAnthropic = process.env.ANTHROPIC_API_KEY;
		process.env.ANTHROPIC_API_KEY = "sk-test-123";
		try {
			const client = createLLM();
			expect(client.provider).toBe("anthropic");
			expect(typeof client.complete).toBe("function");
		} finally {
			if (origAnthropic) process.env.ANTHROPIC_API_KEY = origAnthropic;
			else delete process.env.ANTHROPIC_API_KEY;
		}
	});
});

describe("mockLLM", () => {
	it("returns LLMResponse shape", async () => {
		const llm = mockLLM({ response: "Test response" });
		const result = await llm.complete("Hello");
		expect(result.content).toBe("Test response");
		expect(result.model).toBe("mock-v1");
		expect(result.provider).toBe("mock");
		expect(typeof result.inputTokens).toBe("number");
		expect(typeof result.outputTokens).toBe("number");
		expect(typeof result.cost).toBe("number");
	});

	it("tracks call count", async () => {
		const llm = mockLLM();
		await llm.complete("a");
		await llm.complete("b");
		expect(llm._callCount).toBe(2);
	});
});
