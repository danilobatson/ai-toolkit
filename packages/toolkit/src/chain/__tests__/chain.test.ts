import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	createChain,
	createLanguageSplitter,
	createSplitter,
	parse,
	prompt,
	rag,
} from "../index.js";
import type { ChainDocument, Retriever } from "../types.js";

// ─── Test Helpers ─────────────────────────────────────────────────────────

function createMockRetriever(docs: ChainDocument[] = []): Retriever {
	return {
		retrieve: vi.fn().mockResolvedValue(docs),
	};
}

function createMockModel(
	response = "mock response",
): (prompt: string) => Promise<string> {
	return vi.fn().mockResolvedValue(response);
}

// ─── prompt() Tests ───────────────────────────────────────────────────────

describe("prompt", () => {
	// ── Level 1: CRASH ──────────────────────────────────────────────────────

	describe("Level 1: CRASH", () => {
		it("does not throw with a valid string template", () => {
			expect(() => prompt("Hello {name}")).not.toThrow();
		});

		it("does not throw with a valid config object", () => {
			expect(() => prompt({ template: "Hello {name}" })).not.toThrow();
		});

		it("does not throw with message tuple array", () => {
			expect(() =>
				prompt({
					template: [
						["system", "You are helpful."],
						["human", "{question}"],
					],
				}),
			).not.toThrow();
		});

		it("throws on empty template", () => {
			expect(() => prompt({ template: "" })).toThrow(/non-empty template/);
		});

		it("throws on invalid template type", () => {
			expect(() => prompt({ template: 123 as unknown as string })).toThrow(
				/non-empty template/,
			);
		});
	});

	// ── Level 2: BEHAVIOR ───────────────────────────────────────────────────

	describe("Level 2: BEHAVIOR", () => {
		it("format() interpolates variables", async () => {
			const p = prompt("Hello {name}, you are {age}");
			const result = await p.format({ name: "Alice", age: "30" });
			expect(result).toBe("Hello Alice, you are 30");
		});

		it("formatMessages() returns a single human message for string template", async () => {
			const p = prompt("Hello {name}");
			const messages = await p.formatMessages({ name: "Bob" });
			expect(messages).toHaveLength(1);
			expect(messages[0].role).toBe("human");
			expect(messages[0].content).toBe("Hello Bob");
		});

		it("formatMessages() returns multiple messages for tuple array", async () => {
			const p = prompt({
				template: [
					["system", "You are a {role}."],
					["human", "{question}"],
				],
			});
			const messages = await p.formatMessages({
				role: "teacher",
				question: "What is 2+2?",
			});
			expect(messages).toHaveLength(2);
			expect(messages[0].role).toBe("system");
			expect(messages[0].content).toBe("You are a teacher.");
			expect(messages[1].role).toBe("human");
			expect(messages[1].content).toBe("What is 2+2?");
		});

		it("format() joins multi-message templates with role labels", async () => {
			const p = prompt({
				template: [
					["system", "Be helpful."],
					["human", "Hi"],
				],
			});
			const result = await p.format({});
			expect(result).toContain("System: Be helpful.");
			expect(result).toContain("Human: Hi");
		});
	});

	// ── Level 3: DATA QUALITY ───────────────────────────────────────────────

	describe("Level 3: DATA QUALITY", () => {
		it("auto-detects input variables from string template", () => {
			const p = prompt("Hello {name}, age {age}");
			expect(p.inputVariables).toEqual(["name", "age"]);
		});

		it("auto-detects input variables from message tuples", () => {
			const p = prompt({
				template: [
					["system", "You are {role}"],
					["human", "{question}"],
				],
			});
			expect(p.inputVariables).toContain("role");
			expect(p.inputVariables).toContain("question");
		});

		it("uses explicit inputVariables when provided", () => {
			const p = prompt({
				template: "Hello {name}",
				inputVariables: ["name", "extra"],
			});
			expect(p.inputVariables).toEqual(["name", "extra"]);
		});

		it("deduplicates variables used multiple times", () => {
			const p = prompt("{x} and {x} and {y}");
			expect(p.inputVariables).toEqual(["x", "y"]);
		});
	});

	// ── Level 4: ENVIRONMENT ────────────────────────────────────────────────

	describe("Level 4: ENVIRONMENT", () => {
		it("format() throws on missing variable", async () => {
			const p = prompt("Hello {name}");
			await expect(p.format({})).rejects.toThrow(/Missing variable "name"/);
		});

		it("format() works with no variables in template", async () => {
			const p = prompt("Hello world");
			const result = await p.format({});
			expect(result).toBe("Hello world");
		});
	});
});

// ─── parse() Tests ────────────────────────────────────────────────────────

describe("parse", () => {
	const personSchema = z.object({
		name: z.string().describe("Person's name"),
		age: z.number().describe("Person's age"),
	});

	// ── Level 1: CRASH ──────────────────────────────────────────────────────

	describe("Level 1: CRASH", () => {
		it("does not throw with a valid Zod schema", () => {
			expect(() => parse({ schema: personSchema })).not.toThrow();
		});

		it("does not throw when passing schema directly", () => {
			expect(() => parse(personSchema)).not.toThrow();
		});

		it("throws on invalid schema", () => {
			expect(() =>
				parse({ schema: "not a schema" as unknown as z.ZodType }),
			).toThrow(/valid Zod schema/);
		});
	});

	// ── Level 2: BEHAVIOR ───────────────────────────────────────────────────

	describe("Level 2: BEHAVIOR", () => {
		it("parses valid JSON from plain text", async () => {
			const parser = parse({ schema: personSchema });
			const result = await parser.parse('{"name": "Alice", "age": 30}');
			expect(result).toEqual({ name: "Alice", age: 30 });
		});

		it("parses JSON from markdown code block", async () => {
			const parser = parse({ schema: personSchema });
			const result = await parser.parse(
				'Here is the result:\n```json\n{"name": "Bob", "age": 25}\n```\nDone.',
			);
			expect(result).toEqual({ name: "Bob", age: 25 });
		});

		it("parses JSON from code block without language tag", async () => {
			const parser = parse({ schema: personSchema });
			const result = await parser.parse(
				'```\n{"name": "Charlie", "age": 35}\n```',
			);
			expect(result).toEqual({ name: "Charlie", age: 35 });
		});

		it("getFormatInstructions() returns non-empty string", () => {
			const parser = parse({ schema: personSchema });
			const instructions = parser.getFormatInstructions();
			expect(instructions).toContain("JSON");
			expect(instructions.length).toBeGreaterThan(10);
		});
	});

	// ── Level 3: DATA QUALITY ───────────────────────────────────────────────

	describe("Level 3: DATA QUALITY", () => {
		it("returns correctly typed output matching schema", async () => {
			const parser = parse({ schema: personSchema });
			const result = await parser.parse('{"name": "Dana", "age": 28}');
			expect(typeof result.name).toBe("string");
			expect(typeof result.age).toBe("number");
		});

		it("getFormatInstructions includes schema field descriptions", () => {
			const parser = parse({ schema: personSchema, name: "person" });
			const instructions = parser.getFormatInstructions();
			expect(instructions).toContain("name");
			expect(instructions).toContain("age");
		});
	});

	// ── Level 4: ENVIRONMENT ────────────────────────────────────────────────

	describe("Level 4: ENVIRONMENT", () => {
		it("throws on non-string input", async () => {
			const parser = parse({ schema: personSchema });
			await expect(parser.parse(123 as unknown as string)).rejects.toThrow(
				/requires a string/,
			);
		});

		it("throws on invalid JSON", async () => {
			const parser = parse({ schema: personSchema });
			await expect(parser.parse("not json at all")).rejects.toThrow(
				/failed to extract JSON/,
			);
		});

		it("throws on valid JSON that doesn't match schema", async () => {
			const parser = parse({ schema: personSchema });
			await expect(
				parser.parse('{"name": 123, "age": "not a number"}'),
			).rejects.toThrow(/does not match schema/);
		});

		it("throws with custom parser name in error message", async () => {
			const parser = parse({ schema: personSchema, name: "person-parser" });
			await expect(parser.parse(42 as unknown as string)).rejects.toThrow(
				/person-parser/,
			);
		});
	});
});

// ─── createChain() Tests ──────────────────────────────────────────────────

describe("createChain", () => {
	// ── Level 1: CRASH ──────────────────────────────────────────────────────

	describe("Level 1: CRASH", () => {
		it("does not throw with valid function steps", () => {
			expect(() => createChain({ steps: [(x: unknown) => x] })).not.toThrow();
		});

		it("does not throw with named steps", () => {
			expect(() =>
				createChain({
					steps: [{ name: "passthrough", transform: (x: unknown) => x }],
				}),
			).not.toThrow();
		});

		it("throws on empty steps array", () => {
			expect(() => createChain({ steps: [] })).toThrow(/non-empty steps array/);
		});

		it("throws on missing steps", () => {
			expect(() => createChain({} as unknown as { steps: [] })).toThrow(
				/non-empty steps array/,
			);
		});

		it("throws on invalid step type", () => {
			expect(() =>
				createChain({ steps: ["not a function" as unknown as () => void] }),
			).toThrow(/must be a function/);
		});
	});

	// ── Level 2: BEHAVIOR ───────────────────────────────────────────────────

	describe("Level 2: BEHAVIOR", () => {
		it("invoke() runs steps sequentially", async () => {
			const chain = createChain({
				steps: [
					(x: { value: number }) => x.value,
					(x: number) => x * 2,
					(x: number) => `result: ${x}`,
				],
			});

			const result = await chain.invoke({ value: 5 });
			expect(result).toBe("result: 10");
		});

		it("invoke() handles async steps", async () => {
			const chain = createChain({
				steps: [
					async (x: { text: string }) => x.text.toUpperCase(),
					async (x: string) => x.trim(),
				],
			});

			const result = await chain.invoke({ text: "  hello  " });
			expect(result).toBe("HELLO");
		});

		it("invoke() works with named steps", async () => {
			const chain = createChain({
				steps: [
					{ name: "double", transform: (x: number) => x * 2 },
					{ name: "stringify", transform: (x: number) => String(x) },
				],
			});

			const result = await chain.invoke(5);
			expect(result).toBe("10");
		});
	});

	// ── Level 3: DATA QUALITY ───────────────────────────────────────────────

	describe("Level 3: DATA QUALITY", () => {
		it("chain has correct name", () => {
			const chain = createChain({
				name: "my-chain",
				steps: [(x: unknown) => x],
			});
			expect(chain.name).toBe("my-chain");
		});

		it("chain has correct length", () => {
			const chain = createChain({
				steps: [(x: unknown) => x, (x: unknown) => x, (x: unknown) => x],
			});
			expect(chain.length).toBe(3);
		});

		it("defaults chain name to 'chain'", () => {
			const chain = createChain({ steps: [(x: unknown) => x] });
			expect(chain.name).toBe("chain");
		});
	});

	// ── Level 4: ENVIRONMENT ────────────────────────────────────────────────

	describe("Level 4: ENVIRONMENT", () => {
		it("wraps step errors in ToolkitError", async () => {
			const chain = createChain({
				name: "fail-chain",
				steps: [
					() => {
						throw new Error("step boom");
					},
				],
			});

			await expect(chain.invoke({})).rejects.toThrow(
				/Chain "fail-chain" failed at step/,
			);
		});

		it("preserves ToolkitError thrown by steps", async () => {
			const { ToolkitError } = await import("../../errors/index.js");
			const chain = createChain({
				steps: [
					() => {
						throw new ToolkitError("custom error", {
							code: "CUSTOM",
						});
					},
				],
			});

			await expect(chain.invoke({})).rejects.toThrow(/custom error/);
		});
	});
});

// ─── rag() Tests ──────────────────────────────────────────────────────────

describe("rag", () => {
	const testDocs: ChainDocument[] = [
		{
			content: "RAG combines retrieval with generation.",
			metadata: { source: "wiki" },
		},
		{ content: "It improves factual accuracy.", metadata: { source: "paper" } },
	];

	// ── Level 1: CRASH ──────────────────────────────────────────────────────

	describe("Level 1: CRASH", () => {
		it("does not throw with valid config", () => {
			expect(() =>
				rag({
					retriever: createMockRetriever(testDocs),
					promptTemplate: "Context: {context}\nQ: {question}",
					model: createMockModel(),
				}),
			).not.toThrow();
		});

		it("throws without retriever", () => {
			expect(() =>
				rag({
					retriever: undefined as unknown as Retriever,
					promptTemplate: "Q: {question}",
					model: createMockModel(),
				}),
			).toThrow(/retriever/);
		});

		it("throws without promptTemplate", () => {
			expect(() =>
				rag({
					retriever: createMockRetriever(),
					promptTemplate: "",
					model: createMockModel(),
				}),
			).toThrow(/promptTemplate/);
		});

		it("throws without model", () => {
			expect(() =>
				rag({
					retriever: createMockRetriever(),
					promptTemplate: "Q: {question}",
					model: undefined as unknown as () => Promise<string>,
				}),
			).toThrow(/model/);
		});
	});

	// ── Level 2: BEHAVIOR ───────────────────────────────────────────────────

	describe("Level 2: BEHAVIOR", () => {
		it("invoke() retrieves docs, formats prompt, calls model", async () => {
			const retriever = createMockRetriever(testDocs);
			const model = createMockModel("RAG is great.");
			const chain = rag({
				retriever,
				promptTemplate:
					"Context:\n{context}\n\nQuestion: {question}\n\nAnswer:",
				model,
			});

			const result = await chain.invoke({ question: "What is RAG?" });

			expect(result.answer).toBe("RAG is great.");
			expect(result.sources).toEqual(testDocs);
			expect(retriever.retrieve).toHaveBeenCalledWith("What is RAG?");
			expect(model).toHaveBeenCalledWith(
				expect.stringContaining("RAG combines retrieval"),
			);
			expect(model).toHaveBeenCalledWith(
				expect.stringContaining("What is RAG?"),
			);
		});

		it("uses custom formatDocs function", async () => {
			const chain = rag({
				retriever: createMockRetriever(testDocs),
				promptTemplate: "Context:\n{context}\n\nQ: {question}",
				model: createMockModel("answer"),
				formatDocs: (docs) =>
					docs.map((d, i) => `[${i + 1}] ${d.content}`).join("\n"),
			});

			const result = await chain.invoke({ question: "test" });
			expect(result.answer).toBe("answer");
		});
	});

	// ── Level 3: DATA QUALITY ───────────────────────────────────────────────

	describe("Level 3: DATA QUALITY", () => {
		it("returns RAGResult with answer and sources", async () => {
			const chain = rag({
				retriever: createMockRetriever(testDocs),
				promptTemplate: "{context}\n{question}",
				model: createMockModel("the answer"),
			});

			const result = await chain.invoke({ question: "test" });
			expect(result).toHaveProperty("answer");
			expect(result).toHaveProperty("sources");
			expect(typeof result.answer).toBe("string");
			expect(Array.isArray(result.sources)).toBe(true);
		});

		it("chain has name 'rag' and length 3", () => {
			const chain = rag({
				retriever: createMockRetriever(),
				promptTemplate: "{context}\n{question}",
				model: createMockModel(),
			});
			expect(chain.name).toBe("rag");
			expect(chain.length).toBe(3);
		});
	});

	// ── Level 4: ENVIRONMENT ────────────────────────────────────────────────

	describe("Level 4: ENVIRONMENT", () => {
		it("throws on empty question", async () => {
			const chain = rag({
				retriever: createMockRetriever(),
				promptTemplate: "{context}\n{question}",
				model: createMockModel(),
			});

			await expect(chain.invoke({ question: "" })).rejects.toThrow(
				/non-empty question/,
			);
		});

		it("wraps retrieval errors in ToolkitError", async () => {
			const failRetriever: Retriever = {
				retrieve: vi.fn().mockRejectedValue(new Error("db down")),
			};
			const chain = rag({
				retriever: failRetriever,
				promptTemplate: "{context}\n{question}",
				model: createMockModel(),
			});

			await expect(chain.invoke({ question: "test" })).rejects.toThrow(
				/RAG retrieval failed/,
			);
		});

		it("wraps model errors in ToolkitError", async () => {
			const failModel = vi.fn().mockRejectedValue(new Error("api error"));
			const chain = rag({
				retriever: createMockRetriever(testDocs),
				promptTemplate: "{context}\n{question}",
				model: failModel,
			});

			await expect(chain.invoke({ question: "test" })).rejects.toThrow(
				/RAG model invocation failed/,
			);
		});

		it("handles empty retrieval results gracefully", async () => {
			const chain = rag({
				retriever: createMockRetriever([]),
				promptTemplate: "Context: {context}\nQ: {question}",
				model: createMockModel("no context answer"),
			});

			const result = await chain.invoke({ question: "test" });
			expect(result.answer).toBe("no context answer");
			expect(result.sources).toEqual([]);
		});
	});
});

// ─── createSplitter() Tests ──────────────────────────────────────────────

describe("createSplitter", () => {
	// ── Level 1: CRASH ──────────────────────────────────────────────────────

	describe("Level 1: CRASH", () => {
		it("does not throw with default config", () => {
			expect(() => createSplitter()).not.toThrow();
		});

		it("does not throw with custom config", () => {
			expect(() =>
				createSplitter({ chunkSize: 500, chunkOverlap: 50 }),
			).not.toThrow();
		});

		it("throws when chunkOverlap >= chunkSize", () => {
			expect(() =>
				createSplitter({ chunkSize: 100, chunkOverlap: 100 }),
			).toThrow(/chunkOverlap must be less than chunkSize/);
		});

		it("throws when chunkOverlap > chunkSize", () => {
			expect(() =>
				createSplitter({ chunkSize: 100, chunkOverlap: 200 }),
			).toThrow(/chunkOverlap must be less than chunkSize/);
		});

		it("throws on zero chunkSize", () => {
			expect(() => createSplitter({ chunkSize: 0 })).toThrow(
				/chunkSize must be a positive number/,
			);
		});

		it("throws on negative chunkSize", () => {
			expect(() => createSplitter({ chunkSize: -1 })).toThrow(
				/chunkSize must be a positive number/,
			);
		});
	});

	// ── Level 2: BEHAVIOR ───────────────────────────────────────────────────

	describe("Level 2: BEHAVIOR", () => {
		it("split() returns text unchanged when under chunkSize", async () => {
			const splitter = createSplitter({ chunkSize: 1000 });
			const chunks = await splitter.split("Short text.");
			expect(chunks).toEqual(["Short text."]);
		});

		it("split() chunks long text", async () => {
			const text = "Line one.\n\nLine two.\n\nLine three.\n\nLine four.";
			const splitter = createSplitter({ chunkSize: 25, chunkOverlap: 0 });
			const chunks = await splitter.split(text);
			expect(chunks.length).toBeGreaterThan(1);
			for (const chunk of chunks) {
				expect(chunk.length).toBeLessThanOrEqual(30); // allow some tolerance
			}
		});

		it("splitDocuments() preserves metadata", async () => {
			const splitter = createSplitter({ chunkSize: 20, chunkOverlap: 0 });
			const docs: ChainDocument[] = [
				{
					content: "First paragraph.\n\nSecond paragraph.",
					metadata: { source: "test.txt" },
				},
			];
			const result = await splitter.splitDocuments(docs);
			expect(result.length).toBeGreaterThanOrEqual(1);
			for (const doc of result) {
				expect(doc.metadata.source).toBe("test.txt");
			}
		});

		it("split() returns empty array for empty string", async () => {
			const splitter = createSplitter();
			const chunks = await splitter.split("");
			expect(chunks).toEqual([]);
		});

		it("split() returns empty array for whitespace-only string", async () => {
			const splitter = createSplitter();
			const chunks = await splitter.split("   \n\n   ");
			expect(chunks).toEqual([]);
		});
	});

	// ── Level 3: DATA QUALITY ───────────────────────────────────────────────

	describe("Level 3: DATA QUALITY", () => {
		it("all chunks are non-empty strings", async () => {
			const text = `${"A".repeat(100)}\n\n${"B".repeat(100)}`;
			const splitter = createSplitter({ chunkSize: 50, chunkOverlap: 10 });
			const chunks = await splitter.split(text);
			for (const chunk of chunks) {
				expect(typeof chunk).toBe("string");
				expect(chunk.length).toBeGreaterThan(0);
			}
		});

		it("splitDocuments() output documents have content and metadata", async () => {
			const splitter = createSplitter({ chunkSize: 50, chunkOverlap: 0 });
			const result = await splitter.splitDocuments([
				{ content: "A".repeat(100), metadata: { key: "val" } },
			]);
			for (const doc of result) {
				expect(doc).toHaveProperty("content");
				expect(doc).toHaveProperty("metadata");
				expect(typeof doc.content).toBe("string");
			}
		});
	});

	// ── Level 4: ENVIRONMENT ────────────────────────────────────────────────

	describe("Level 4: ENVIRONMENT", () => {
		it("split() throws on non-string input", async () => {
			const splitter = createSplitter();
			await expect(splitter.split(123 as unknown as string)).rejects.toThrow(
				/requires a string/,
			);
		});

		it("splitDocuments() throws on non-array input", async () => {
			const splitter = createSplitter();
			await expect(
				splitter.splitDocuments("not an array" as unknown as ChainDocument[]),
			).rejects.toThrow(/requires an array/);
		});
	});
});

// ─── createLanguageSplitter() Tests ───────────────────────────────────────

describe("createLanguageSplitter", () => {
	describe("Level 1: CRASH", () => {
		it("does not throw with valid language", () => {
			expect(() => createLanguageSplitter("js")).not.toThrow();
		});

		it("throws when chunkOverlap >= chunkSize", () => {
			expect(() =>
				createLanguageSplitter("js", { chunkSize: 10, chunkOverlap: 10 }),
			).toThrow(/chunkOverlap must be less than chunkSize/);
		});
	});

	describe("Level 2: BEHAVIOR", () => {
		it("falls back to default splitter without @langchain/textsplitters", async () => {
			const splitter = createLanguageSplitter("python", {
				chunkSize: 1000,
			});
			const chunks = await splitter.split("Short code.");
			expect(chunks).toEqual(["Short code."]);
		});
	});
});

// ─── Level 5: PATTERN ─────────────────────────────────────────────────────

describe("Level 5: PATTERN", () => {
	it("all exports are named (no default exports)", async () => {
		const mod = await import("../index.js");

		expect(mod.createChain).toBeDefined();
		expect(mod.rag).toBeDefined();
		expect(mod.prompt).toBeDefined();
		expect(mod.parse).toBeDefined();
		expect(mod.createSplitter).toBeDefined();
		expect(mod.createLanguageSplitter).toBeDefined();
		expect((mod as Record<string, unknown>).default).toBeUndefined();
	});
});

// ─── Level 6: CONTRACT ───────────────────────────────────────────────────

describe("Level 6: CONTRACT", () => {
	it("Chain interface is honored by createChain", () => {
		const chain = createChain({ steps: [(x: unknown) => x] });

		expect(typeof chain.invoke).toBe("function");
		expect(typeof chain.name).toBe("string");
		expect(typeof chain.length).toBe("number");
	});

	it("Chain interface is honored by rag", () => {
		const chain = rag({
			retriever: createMockRetriever(),
			promptTemplate: "{context}\n{question}",
			model: createMockModel(),
		});

		expect(typeof chain.invoke).toBe("function");
		expect(typeof chain.name).toBe("string");
		expect(typeof chain.length).toBe("number");
	});

	it("PromptTemplate interface is honored by prompt", () => {
		const p = prompt("Hello {name}");

		expect(typeof p.format).toBe("function");
		expect(typeof p.formatMessages).toBe("function");
		expect(Array.isArray(p.inputVariables)).toBe(true);
	});

	it("Parser interface is honored by parse", () => {
		const parser = parse({ schema: z.object({ x: z.string() }) });

		expect(typeof parser.parse).toBe("function");
		expect(typeof parser.getFormatInstructions).toBe("function");
	});

	it("Splitter interface is honored by createSplitter", () => {
		const splitter = createSplitter();

		expect(typeof splitter.split).toBe("function");
		expect(typeof splitter.splitDocuments).toBe("function");
	});
});

// ─── Level 7: PROVIDER FALLBACK ──────────────────────────────────────────

describe("Level 7: PROVIDER FALLBACK", () => {
	it("prompt() works without @langchain/core installed", async () => {
		const p = prompt("Hello {name}");
		const result = await p.format({ name: "World" });
		expect(result).toBe("Hello World");
	});

	it("parse() works without @langchain/core installed", async () => {
		const parser = parse({ schema: z.object({ x: z.number() }) });
		const result = await parser.parse('{"x": 42}');
		expect(result).toEqual({ x: 42 });
	});

	it("createSplitter() works without @langchain/textsplitters installed", async () => {
		const splitter = createSplitter({ chunkSize: 50, chunkOverlap: 0 });
		const chunks = await splitter.split("A".repeat(100));
		expect(chunks.length).toBeGreaterThanOrEqual(1);
	});

	it("rag() works with mock retriever and model (no LangChain needed)", async () => {
		const chain = rag({
			retriever: createMockRetriever([
				{ content: "context text", metadata: {} },
			]),
			promptTemplate: "Context: {context}\nQ: {question}",
			model: createMockModel("the answer"),
		});

		const result = await chain.invoke({ question: "test" });
		expect(result.answer).toBe("the answer");
	});
});

// ─── Level 8: CLEANUP ───────────────────────────────────────────────────

describe("Level 8: CLEANUP", () => {
	it("chain does not leak state between invocations", async () => {
		const chain = createChain({
			steps: [(x: { n: number }) => x.n * 2],
		});

		const r1 = await chain.invoke({ n: 5 });
		const r2 = await chain.invoke({ n: 10 });

		expect(r1).toBe(10);
		expect(r2).toBe(20);
	});

	it("splitter does not leak state between splits", async () => {
		const splitter = createSplitter({ chunkSize: 50, chunkOverlap: 0 });

		const c1 = await splitter.split("A".repeat(100));
		const c2 = await splitter.split("B".repeat(100));

		expect(c1.every((c) => c.includes("A"))).toBe(true);
		expect(c2.every((c) => c.includes("B"))).toBe(true);
	});

	it("parser does not leak state between parses", async () => {
		const parser = parse({ schema: z.object({ n: z.number() }) });

		const r1 = await parser.parse('{"n": 1}');
		const r2 = await parser.parse('{"n": 2}');

		expect(r1.n).toBe(1);
		expect(r2.n).toBe(2);
	});
});
