import { describe, expect, it } from "vitest";
import { checkOutput, createGuardrails } from "../guardrails.js";

// ─── LEVEL 1: CRASH ─────────────────────────────────────────────────────────

describe("createGuardrails", () => {
	it("does not throw with valid rules", () => {
		expect(() =>
			createGuardrails([
				{ id: "test", description: "test rule", test: /bad/i },
			]),
		).not.toThrow();
	});

	it("throws ValidationError when rules is not an array", () => {
		expect(() => createGuardrails("bad" as unknown as [])).toThrow(
			/requires an array/,
		);
	});

	it("throws ValidationError when rule is missing required fields", () => {
		expect(() => createGuardrails([{ id: "test" } as never])).toThrow(
			/must have id, description, and test/,
		);
	});

	it("throws ValidationError when check receives non-string", () => {
		const guard = createGuardrails([{ id: "t", description: "t", test: /x/ }]);
		expect(() => guard.check(123 as unknown as string)).toThrow(
			/requires a string/,
		);
	});

	// ─── LEVEL 2: BEHAVIOR ───────────────────────────────────────────────────

	it("allows text that matches no rules", () => {
		const guard = createGuardrails([
			{ id: "no-bad", description: "Block bad word", test: /bad/i },
		]);
		const result = guard.check("This is perfectly fine");
		expect(result.allowed).toBe(true);
		expect(result.violations).toEqual([]);
		expect(result.reasons).toEqual([]);
	});

	it("blocks text matching a regex rule", () => {
		const guard = createGuardrails([
			{
				id: "no-code",
				description: "Block code requests",
				test: /write.*code/i,
			},
		]);
		const result = guard.check("Write me some code please");
		expect(result.allowed).toBe(false);
		expect(result.violations).toContain("no-code");
		expect(result.reasons).toContain("Block code requests");
	});

	it("blocks text matching a function rule", () => {
		const guard = createGuardrails([
			{
				id: "on-topic",
				description: "Must mention product",
				test: (text: string) => !text.toLowerCase().includes("acme"),
			},
		]);
		const result = guard.check("Tell me about the weather");
		expect(result.allowed).toBe(false);
		expect(result.violations).toContain("on-topic");
	});

	it("allows text that passes a function rule", () => {
		const guard = createGuardrails([
			{
				id: "on-topic",
				description: "Must mention product",
				test: (text: string) => !text.toLowerCase().includes("acme"),
			},
		]);
		const result = guard.check("How does Acme handle billing?");
		expect(result.allowed).toBe(true);
	});

	it("reports multiple violations", () => {
		const guard = createGuardrails([
			{ id: "no-bad", description: "No bad word", test: /bad/i },
			{ id: "no-evil", description: "No evil word", test: /evil/i },
		]);
		const result = guard.check("This is bad and evil");
		expect(result.allowed).toBe(false);
		expect(result.violations).toHaveLength(2);
		expect(result.violations).toContain("no-bad");
		expect(result.violations).toContain("no-evil");
	});

	// ─── LEVEL 3: DATA QUALITY ───────────────────────────────────────────────

	it("returns GuardrailResult with correct shape", () => {
		const guard = createGuardrails([
			{ id: "t", description: "test", test: /x/ },
		]);
		const result = guard.check("hello");
		expect(result).toHaveProperty("allowed");
		expect(result).toHaveProperty("violations");
		expect(result).toHaveProperty("reasons");
		expect(typeof result.allowed).toBe("boolean");
		expect(Array.isArray(result.violations)).toBe(true);
		expect(Array.isArray(result.reasons)).toBe(true);
	});

	// ─── LEVEL 4: ENVIRONMENT ────────────────────────────────────────────────

	it("handles empty string input", () => {
		const guard = createGuardrails([
			{ id: "no-bad", description: "No bad word", test: /bad/i },
		]);
		const result = guard.check("");
		expect(result.allowed).toBe(true);
	});

	it("handles empty rules array", () => {
		const guard = createGuardrails([]);
		const result = guard.check("anything");
		expect(result.allowed).toBe(true);
	});

	// ─── LEVEL 5: PATTERN ────────────────────────────────────────────────────

	it("is safe with global regex (lastIndex reset)", () => {
		const guard = createGuardrails([
			{ id: "no-bad", description: "No bad", test: /bad/gi },
		]);
		guard.check("bad");
		const result = guard.check("bad");
		expect(result.allowed).toBe(false);
	});
});

// ─── checkOutput ─────────────────────────────────────────────────────────────

describe("checkOutput", () => {
	it("does not throw on valid input", () => {
		expect(() =>
			checkOutput("response", [{ id: "t", description: "t", test: /x/ }]),
		).not.toThrow();
	});

	it("throws ValidationError on non-string response", () => {
		expect(() => checkOutput(123 as unknown as string, [])).toThrow(
			/requires a string/,
		);
	});

	it("throws ValidationError on non-array rules", () => {
		expect(() => checkOutput("text", "bad" as unknown as [])).toThrow(
			/requires an array/,
		);
	});

	it("allows output that passes all rules", () => {
		const result = checkOutput("The answer is 42 [source]", [
			{
				id: "cite-sources",
				description: "Must cite sources",
				test: (text: string) => !text.includes("[source]"),
			},
		]);
		expect(result.allowed).toBe(true);
	});

	it("blocks output that violates a rule", () => {
		const result = checkOutput("I think maybe the answer is 42", [
			{
				id: "no-hedging",
				description: "No uncertain language",
				test: /I think|maybe|probably/i,
			},
		]);
		expect(result.allowed).toBe(false);
		expect(result.violations).toContain("no-hedging");
	});

	it("blocks hallucinated content via regex", () => {
		const result = checkOutput("As an AI language model, I cannot", [
			{
				id: "no-ai-disclaimer",
				description: "No AI self-reference",
				test: /as an ai/i,
			},
		]);
		expect(result.allowed).toBe(false);
		expect(result.violations).toContain("no-ai-disclaimer");
	});
});
