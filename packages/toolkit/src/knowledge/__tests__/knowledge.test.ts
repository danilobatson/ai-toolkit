import { describe, expect, it, vi } from "vitest";
import { ToolkitError } from "../../errors/index.js";
import { createKnowledge } from "../knowledge.js";
import { chunk, ingest, search } from "../operations.js";
import { parseDocument } from "../parser.js";
import type {
	DocumentChunk,
	EmbedFunction,
	SearchResult,
	VectorStore,
} from "../types.js";

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockEmbedder(dimensions = 3): EmbedFunction {
	return vi.fn(async (texts: string[]) =>
		texts.map(() => Array.from({ length: dimensions }, () => Math.random())),
	);
}

function createMockStore(): VectorStore & {
	_chunks: DocumentChunk[];
} {
	const stored: DocumentChunk[] = [];
	return {
		_chunks: stored,
		upsert: vi.fn(async (chunks: DocumentChunk[]) => {
			stored.push(...chunks);
		}),
		search: vi.fn(
			async (
				_queryVector: number[],
				options?: { limit?: number; threshold?: number },
			): Promise<SearchResult[]> => {
				const limit = options?.limit ?? 10;
				return stored.slice(0, limit).map((chunk, i) => ({
					chunk,
					similarity: 1 - i * 0.1,
				}));
			},
		),
	};
}

const LONG_TEXT =
	"This is a test document that is long enough to be split into multiple chunks. ".repeat(
		50,
	);

const SHORT_TEXT = "Hello world, this is a test.";

// ─── parseDocument() Tests ───────────────────────────────────────────────────

describe("parseDocument", () => {
	// ── Level 1: CRASH ──────────────────────────────────────────────────────
	it("does not throw on valid plain text", async () => {
		const doc = await parseDocument("Hello world");
		expect(doc).toBeDefined();
	});

	it("does not throw on valid Buffer input", async () => {
		const doc = await parseDocument(Buffer.from("Hello world"));
		expect(doc).toBeDefined();
	});

	it("does not throw on valid Uint8Array input", async () => {
		const doc = await parseDocument(new TextEncoder().encode("Hello world"));
		expect(doc).toBeDefined();
	});

	// ── Level 2: BEHAVIOR ───────────────────────────────────────────────────
	it("parses plain text string into KnowledgeDocument", async () => {
		const doc = await parseDocument("Test content");
		expect(doc.content).toBe("Test content");
		expect(doc.metadata.format).toBe("text");
	});

	it("parses Buffer as UTF-8 text", async () => {
		const doc = await parseDocument(Buffer.from("Buffer content"));
		expect(doc.content).toBe("Buffer content");
		expect(doc.metadata.format).toBe("text");
	});

	it("preserves provided metadata", async () => {
		const doc = await parseDocument("Content", { source: "test" });
		expect(doc.metadata.source).toBe("test");
	});

	it("detects PDF file path and requires LiteParse", async () => {
		await expect(parseDocument("report.pdf")).rejects.toThrow(/liteparse/i);
	});

	// ── Level 3: DATA QUALITY ───────────────────────────────────────────────
	it("returns content as string", async () => {
		const doc = await parseDocument("Test");
		expect(typeof doc.content).toBe("string");
	});

	it("returns metadata as object", async () => {
		const doc = await parseDocument("Test");
		expect(typeof doc.metadata).toBe("object");
		expect(doc.metadata).not.toBeNull();
	});

	// ── Level 4: ENVIRONMENT ────────────────────────────────────────────────
	it("throws on null input", async () => {
		await expect(parseDocument(null as unknown as string)).rejects.toThrow(
			/non-null/,
		);
	});

	it("throws on undefined input", async () => {
		await expect(parseDocument(undefined as unknown as string)).rejects.toThrow(
			/non-null/,
		);
	});

	it("throws on empty string", async () => {
		await expect(parseDocument("")).rejects.toThrow(/empty/);
	});

	it("throws on whitespace-only string", async () => {
		await expect(parseDocument("   ")).rejects.toThrow(/empty/);
	});

	it("throws on empty buffer", async () => {
		await expect(parseDocument(Buffer.from([]))).rejects.toThrow(
			/empty buffer/,
		);
	});

	// ── Level 5: PATTERN ────────────────────────────────────────────────────
	it("throws ToolkitError on invalid input", async () => {
		try {
			await parseDocument("");
		} catch (error) {
			expect(error).toBeInstanceOf(ToolkitError);
		}
	});
});

// ─── chunk() Tests ───────────────────────────────────────────────────────────

describe("chunk", () => {
	// ── Level 1: CRASH ──────────────────────────────────────────────────────
	it("does not throw on valid text", async () => {
		const result = await chunk(SHORT_TEXT);
		expect(result).toBeDefined();
	});

	it("does not throw on long text", async () => {
		const result = await chunk(LONG_TEXT);
		expect(result).toBeDefined();
	});

	// ── Level 2: BEHAVIOR ───────────────────────────────────────────────────
	it("returns single chunk for short text", async () => {
		const result = await chunk(SHORT_TEXT, { chunkSize: 1000 });
		expect(result).toHaveLength(1);
		expect(result[0].content).toBe(SHORT_TEXT);
	});

	it("returns multiple chunks for long text", async () => {
		const result = await chunk(LONG_TEXT, {
			chunkSize: 200,
			chunkOverlap: 20,
		});
		expect(result.length).toBeGreaterThan(1);
	});

	it("returns empty array for empty string", async () => {
		const result = await chunk("");
		expect(result).toEqual([]);
	});

	it("returns empty array for whitespace", async () => {
		const result = await chunk("   ");
		expect(result).toEqual([]);
	});

	it("respects custom chunkSize", async () => {
		const result = await chunk(LONG_TEXT, { chunkSize: 100, chunkOverlap: 10 });
		for (const c of result) {
			// Some chunks may slightly exceed due to separator keeping
			expect(c.content.length).toBeLessThanOrEqual(200);
		}
	});

	// ── Level 3: DATA QUALITY ───────────────────────────────────────────────
	it("each chunk has content string and metadata object", async () => {
		const result = await chunk(LONG_TEXT, {
			chunkSize: 200,
			chunkOverlap: 20,
		});
		for (const c of result) {
			expect(typeof c.content).toBe("string");
			expect(c.content.length).toBeGreaterThan(0);
			expect(typeof c.metadata).toBe("object");
		}
	});

	it("each chunk has chunkIndex metadata", async () => {
		const result = await chunk(LONG_TEXT, {
			chunkSize: 200,
			chunkOverlap: 20,
		});
		for (let i = 0; i < result.length; i++) {
			expect(result[i].metadata.chunkIndex).toBe(i);
		}
	});

	// ── Level 4: ENVIRONMENT ────────────────────────────────────────────────
	it("throws on non-string input", async () => {
		await expect(chunk(123 as unknown as string)).rejects.toThrow(/string/);
	});

	it("throws on chunkSize <= 0", async () => {
		await expect(chunk("test", { chunkSize: 0 })).rejects.toThrow(/positive/);
	});

	it("throws on chunkOverlap >= chunkSize", async () => {
		await expect(
			chunk("test", { chunkSize: 100, chunkOverlap: 100 }),
		).rejects.toThrow(/less than/);
	});

	// ── Level 5: PATTERN ────────────────────────────────────────────────────
	it("all errors are ToolkitError instances", async () => {
		try {
			await chunk(null as unknown as string);
		} catch (error) {
			expect(error).toBeInstanceOf(ToolkitError);
		}
	});
});

// ─── ingest() Tests ──────────────────────────────────────────────────────────

describe("ingest", () => {
	// ── Level 1: CRASH ──────────────────────────────────────────────────────
	it("does not throw on valid text input", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		const result = await ingest(LONG_TEXT, embedder, store);
		expect(result).toBeDefined();
	});

	// ── Level 2: BEHAVIOR ───────────────────────────────────────────────────
	it("parses text, chunks, embeds, and stores", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		const result = await ingest(LONG_TEXT, embedder, store, {
			metadata: { source: "test" },
		});

		expect(result.chunks).toBeGreaterThan(0);
		expect(result.embeddings).toBe(result.chunks);
		expect(embedder).toHaveBeenCalled();
		expect(store.upsert).toHaveBeenCalled();
	});

	it("stores chunks with embeddings attached", async () => {
		const embedder = createMockEmbedder(4);
		const store = createMockStore();
		await ingest(LONG_TEXT, embedder, store);

		const storedChunks = store._chunks;
		expect(storedChunks.length).toBeGreaterThan(0);
		for (const c of storedChunks) {
			expect(c.embedding).toBeDefined();
			expect(c.embedding).toHaveLength(4);
		}
	});

	it("passes metadata through to stored chunks", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		await ingest(LONG_TEXT, embedder, store, {
			metadata: { source: "test-doc" },
		});

		const storedChunks = store._chunks;
		for (const c of storedChunks) {
			expect(c.metadata.source).toBe("test-doc");
		}
	});

	it("returns correct ingest result shape", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		const result = await ingest(LONG_TEXT, embedder, store);

		expect(typeof result.chunks).toBe("number");
		expect(typeof result.embeddings).toBe("number");
		expect(typeof result.metadata).toBe("object");
	});

	// ── Level 3: DATA QUALITY ───────────────────────────────────────────────
	it("ingest result has correct chunk count", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		const result = await ingest(LONG_TEXT, embedder, store);

		expect(result.chunks).toBe(store._chunks.length);
	});

	it("handles short text that produces one chunk", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		const result = await ingest(SHORT_TEXT, embedder, store);

		expect(result.chunks).toBe(1);
		expect(result.embeddings).toBe(1);
	});

	// ── Level 4: ENVIRONMENT ────────────────────────────────────────────────
	it("throws on null input", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		await expect(
			ingest(null as unknown as string, embedder, store),
		).rejects.toThrow(/non-null/);
	});

	it("throws on empty string input", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		await expect(ingest("", embedder, store)).rejects.toThrow(/empty/);
	});

	it("throws on missing embedder", async () => {
		const store = createMockStore();
		await expect(
			ingest("test", null as unknown as EmbedFunction, store),
		).rejects.toThrow(/embedder/);
	});

	it("throws on missing store", async () => {
		const embedder = createMockEmbedder();
		await expect(
			ingest("test", embedder, null as unknown as VectorStore),
		).rejects.toThrow(/store/);
	});

	it("throws on embedder failure", async () => {
		const embedder = vi
			.fn()
			.mockRejectedValue(
				new TypeError("embedding API down"),
			) as unknown as EmbedFunction;
		const store = createMockStore();
		await expect(ingest(SHORT_TEXT, embedder, store)).rejects.toThrow(
			/embedding/i,
		);
	});

	it("throws on store upsert failure", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		(store.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
			new TypeError("db connection lost"),
		);
		await expect(ingest(SHORT_TEXT, embedder, store)).rejects.toThrow(
			/upsert/i,
		);
	});

	it("throws on embedding count mismatch", async () => {
		const embedder = vi.fn(async () => [
			[0.1, 0.2],
		]) as unknown as EmbedFunction;
		const store = createMockStore();
		// LONG_TEXT produces multiple chunks but embedder returns only 1 vector
		await expect(ingest(LONG_TEXT, embedder, store)).rejects.toThrow(/vectors/);
	});

	// ── Level 5: PATTERN ────────────────────────────────────────────────────
	it("all errors are ToolkitError instances", async () => {
		try {
			await ingest("", createMockEmbedder(), createMockStore());
		} catch (error) {
			expect(error).toBeInstanceOf(ToolkitError);
		}
	});
});

// ─── search() Tests ──────────────────────────────────────────────────────────

describe("search", () => {
	// ── Level 1: CRASH ──────────────────────────────────────────────────────
	it("does not throw on valid query", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		const results = await search("test query", embedder, store);
		expect(results).toBeDefined();
	});

	// ── Level 2: BEHAVIOR ───────────────────────────────────────────────────
	it("returns ranked results by similarity", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();

		// Pre-populate store
		await store.upsert([
			{ content: "first", metadata: {}, embedding: [0.1, 0.2, 0.3] },
			{ content: "second", metadata: {}, embedding: [0.4, 0.5, 0.6] },
		]);

		const results = await search("test", embedder, store);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].similarity).toBeGreaterThanOrEqual(
			results[results.length - 1].similarity,
		);
	});

	it("passes limit option to store", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		await store.upsert([
			{ content: "a", metadata: {}, embedding: [1, 0, 0] },
			{ content: "b", metadata: {}, embedding: [0, 1, 0] },
			{ content: "c", metadata: {}, embedding: [0, 0, 1] },
		]);

		const results = await search("test", embedder, store, { limit: 2 });
		expect(results).toHaveLength(2);
	});

	// ── Level 3: DATA QUALITY ───────────────────────────────────────────────
	it("search results have similarity scores between 0 and 1", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		await store.upsert([
			{ content: "test", metadata: {}, embedding: [0.1, 0.2, 0.3] },
		]);

		const results = await search("query", embedder, store);
		for (const r of results) {
			expect(r.similarity).toBeGreaterThanOrEqual(0);
			expect(r.similarity).toBeLessThanOrEqual(1);
		}
	});

	it("each result has chunk with content and metadata", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		await store.upsert([
			{
				content: "test content",
				metadata: { source: "test" },
				embedding: [0.1, 0.2, 0.3],
			},
		]);

		const results = await search("query", embedder, store);
		for (const r of results) {
			expect(typeof r.chunk.content).toBe("string");
			expect(typeof r.chunk.metadata).toBe("object");
		}
	});

	// ── Level 4: ENVIRONMENT ────────────────────────────────────────────────
	it("throws on empty query", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		await expect(search("", embedder, store)).rejects.toThrow(/non-empty/);
	});

	it("throws on whitespace query", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		await expect(search("   ", embedder, store)).rejects.toThrow(/non-empty/);
	});

	it("throws on missing embedder", async () => {
		const store = createMockStore();
		await expect(
			search("test", null as unknown as EmbedFunction, store),
		).rejects.toThrow(/embedder/);
	});

	it("throws on missing store", async () => {
		const embedder = createMockEmbedder();
		await expect(
			search("test", embedder, null as unknown as VectorStore),
		).rejects.toThrow(/store/);
	});

	it("throws on embedder failure", async () => {
		const embedder = vi
			.fn()
			.mockRejectedValue(
				new TypeError("embedding API down"),
			) as unknown as EmbedFunction;
		const store = createMockStore();
		await expect(search("test", embedder, store)).rejects.toThrow(/embedding/i);
	});

	// ── Level 5: PATTERN ────────────────────────────────────────────────────
	it("all errors are ToolkitError instances", async () => {
		try {
			await search("", createMockEmbedder(), createMockStore());
		} catch (error) {
			expect(error).toBeInstanceOf(ToolkitError);
		}
	});
});

// ─── createKnowledge() Tests ─────────────────────────────────────────────────

describe("createKnowledge", () => {
	// ── Level 1: CRASH ──────────────────────────────────────────────────────
	it("does not throw on valid config", () => {
		const client = createKnowledge({
			embedder: createMockEmbedder(),
			store: createMockStore(),
		});
		expect(client).toBeDefined();
	});

	// ── Level 2: BEHAVIOR ───────────────────────────────────────────────────
	it("client.ingest delegates to ingest()", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		const client = createKnowledge({ embedder, store });

		const result = await client.ingest(LONG_TEXT, {
			metadata: { via: "client" },
		});
		expect(result.chunks).toBeGreaterThan(0);
		expect(embedder).toHaveBeenCalled();
		expect(store.upsert).toHaveBeenCalled();
	});

	it("client.search delegates to search()", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		await store.upsert([
			{ content: "test", metadata: {}, embedding: [0.1, 0.2, 0.3] },
		]);

		const client = createKnowledge({ embedder, store });
		const results = await client.search("query");
		expect(results.length).toBeGreaterThan(0);
	});

	it("uses default chunkSize from config", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		const client = createKnowledge({
			embedder,
			store,
			chunkSize: 100,
			chunkOverlap: 10,
		});

		const result = await client.ingest(LONG_TEXT);
		// With smaller chunks, we get more of them
		expect(result.chunks).toBeGreaterThan(1);
	});

	// ── Level 4: ENVIRONMENT ────────────────────────────────────────────────
	it("throws on missing config", () => {
		expect(() =>
			createKnowledge(null as unknown as Parameters<typeof createKnowledge>[0]),
		).toThrow(/config/);
	});

	it("throws on missing embedder", () => {
		expect(() =>
			createKnowledge({
				store: createMockStore(),
			} as unknown as Parameters<typeof createKnowledge>[0]),
		).toThrow(/embedder/);
	});

	it("throws on missing store", () => {
		expect(() =>
			createKnowledge({
				embedder: createMockEmbedder(),
			} as unknown as Parameters<typeof createKnowledge>[0]),
		).toThrow(/store/);
	});

	// ── Level 5: PATTERN ────────────────────────────────────────────────────
	it("all errors are ToolkitError instances", () => {
		try {
			createKnowledge(null as unknown as Parameters<typeof createKnowledge>[0]);
		} catch (error) {
			expect(error).toBeInstanceOf(ToolkitError);
		}
	});

	// ── Level 6: CONTRACT ───────────────────────────────────────────────────
	it("KnowledgeClient implements ingest and search methods", () => {
		const client = createKnowledge({
			embedder: createMockEmbedder(),
			store: createMockStore(),
		});
		expect(typeof client.ingest).toBe("function");
		expect(typeof client.search).toBe("function");
	});

	it("IngestResult has chunks, embeddings, metadata fields", async () => {
		const client = createKnowledge({
			embedder: createMockEmbedder(),
			store: createMockStore(),
		});
		const result = await client.ingest(SHORT_TEXT);
		expect(result).toHaveProperty("chunks");
		expect(result).toHaveProperty("embeddings");
		expect(result).toHaveProperty("metadata");
	});

	// ── Level 7: PROVIDER FALLBACK ──────────────────────────────────────────
	it("ingest works without LiteParse for plain text", async () => {
		const client = createKnowledge({
			embedder: createMockEmbedder(),
			store: createMockStore(),
		});
		// Plain text doesn't need LiteParse
		const result = await client.ingest("Plain text content for testing");
		expect(result.chunks).toBeGreaterThan(0);
	});

	it("chunk works with default splitter settings", async () => {
		const result = await chunk(LONG_TEXT);
		expect(result.length).toBeGreaterThan(0);
	});

	// ── Level 8: CLEANUP ────────────────────────────────────────────────────
	it("no resources leak after ingest — store accumulates only what was ingested", async () => {
		const embedder = createMockEmbedder();
		const store = createMockStore();
		const client = createKnowledge({ embedder, store });

		const r1 = await client.ingest(SHORT_TEXT);
		const countAfterFirst = store._chunks.length;
		expect(countAfterFirst).toBe(r1.chunks);

		const r2 = await client.ingest(SHORT_TEXT);
		const countAfterSecond = store._chunks.length;
		expect(countAfterSecond).toBe(countAfterFirst + r2.chunks);

		// Embedder and store called exactly as many times as ingests
		expect(embedder).toHaveBeenCalledTimes(2);
		expect(store.upsert).toHaveBeenCalledTimes(2);
	});
});

// ─── Exports Convention Tests ────────────────────────────────────────────────

describe("knowledge module exports", () => {
	it("exports match module convention", async () => {
		const mod = await import("../index.js");

		// Functions
		expect(typeof mod.createKnowledge).toBe("function");
		expect(typeof mod.ingest).toBe("function");
		expect(typeof mod.search).toBe("function");
		expect(typeof mod.chunk).toBe("function");
		expect(typeof mod.parseDocument).toBe("function");
	});
});
