// ─── Standalone Knowledge Operations ─────────────────────────────────────────
// Stateless functions that work with any embedder + store combination.

import { ToolkitError } from "../errors/index.js";
import { builtInSplit } from "../internal/split.js";
import { parseDocument } from "./parser.js";
import type {
	ChunkOptions,
	DocumentChunk,
	EmbedFunction,
	IngestOptions,
	IngestResult,
	SearchOptions,
	SearchResult,
	VectorStore,
} from "./types.js";

// ─── chunk() ─────────────────────────────────────────────────────────────────

/**
 * Split text into document chunks using the chain module's splitter algorithm.
 *
 * @param text - The text to split into chunks
 * @param options - Chunk size, overlap, and separator options
 * @returns Array of DocumentChunk objects with content and metadata
 *
 * @example
 * ```ts
 * import { chunk } from '@jamaalbuilds/ai-toolkit/knowledge';
 *
 * const chunks = await chunk('Long document text...', {
 *   chunkSize: 500,
 *   chunkOverlap: 50,
 * });
 * // chunks = [{ content: '...', metadata: { chunkIndex: 0 } }, ...]
 * ```
 */
export async function chunk(
	text: string,
	options?: ChunkOptions,
): Promise<DocumentChunk[]> {
	if (typeof text !== "string") {
		throw new ToolkitError("chunk() requires a string input", {
			code: "KNOWLEDGE_INVALID_INPUT",
		});
	}

	if (!text.trim()) {
		return [];
	}

	const chunkSize = options?.chunkSize ?? 1000;
	const chunkOverlap = options?.chunkOverlap ?? 200;
	const separators = options?.separators ?? ["\n\n", "\n", " ", ""];

	if (chunkSize <= 0) {
		throw new ToolkitError("chunkSize must be a positive number", {
			code: "KNOWLEDGE_INVALID_CONFIG",
		});
	}

	if (chunkOverlap >= chunkSize) {
		throw new ToolkitError("chunkOverlap must be less than chunkSize", {
			code: "KNOWLEDGE_INVALID_CONFIG",
		});
	}

	try {
		// Use chain module's createSplitter if available
		const chainModule = await tryLoadChainSplitter();
		if (chainModule) {
			const splitter = chainModule(chunkSize, chunkOverlap, separators);
			const chunks = await splitter.split(text);
			return chunks.map((content, index) => ({
				content,
				metadata: { chunkIndex: index },
			}));
		}

		// Built-in fallback: simple recursive character splitting
		const chunks = builtInSplit(text, separators, chunkSize, chunkOverlap);
		return chunks.map((content, index) => ({
			content,
			metadata: { chunkIndex: index },
		}));
	} catch (error) {
		if (error instanceof ToolkitError) throw error;
		throw new ToolkitError("Text chunking failed", {
			code: "KNOWLEDGE_CHUNK_FAILED",
			cause: error instanceof Error ? error : undefined,
		});
	}
}

// ─── ingest() ────────────────────────────────────────────────────────────────

/**
 * Ingest a file or text — parse, chunk, embed, and store.
 *
 * Pipeline: input → parse → chunk → embed → store
 *
 * @param input - File path, Buffer, or plain text string
 * @param embedder - Function to generate embeddings from text
 * @param store - Vector store for persistence
 * @param options - Ingest options (metadata, chunk size overrides)
 * @returns IngestResult with chunk and embedding counts
 *
 * @example
 * ```ts
 * import { ingest } from '@jamaalbuilds/ai-toolkit/knowledge';
 *
 * const result = await ingest('report.pdf', embedder, store, {
 *   metadata: { source: 'quarterly-report' },
 * });
 * console.log(`Ingested ${result.chunks} chunks`);
 * ```
 */
export async function ingest(
	input: string | Buffer | Uint8Array,
	embedder: EmbedFunction,
	store: VectorStore,
	options?: IngestOptions,
): Promise<IngestResult> {
	if (input === null || input === undefined) {
		throw new ToolkitError("ingest() requires a non-null input", {
			code: "KNOWLEDGE_INVALID_INPUT",
		});
	}

	if (typeof input === "string" && !input.trim()) {
		throw new ToolkitError("ingest() received empty input", {
			code: "KNOWLEDGE_INVALID_INPUT",
		});
	}

	if (typeof embedder !== "function") {
		throw new ToolkitError("ingest() requires an embedder function", {
			code: "KNOWLEDGE_INVALID_CONFIG",
		});
	}

	if (!store || typeof store.upsert !== "function") {
		throw new ToolkitError("ingest() requires a valid vector store", {
			code: "KNOWLEDGE_INVALID_CONFIG",
		});
	}

	const metadata = options?.metadata ?? {};

	// Step 1: Parse
	const doc = await parseDocument(input, metadata);

	// Step 2: Chunk
	const chunks = await chunk(doc.content, {
		chunkSize: options?.chunkSize,
		chunkOverlap: options?.chunkOverlap,
	});

	if (chunks.length === 0) {
		return { chunks: 0, embeddings: 0, metadata: doc.metadata };
	}

	// Step 3: Embed
	const texts = chunks.map((c) => c.content);
	let vectors: number[][];
	try {
		vectors = await embedder(texts);
	} catch (error) {
		throw new ToolkitError("Embedding generation failed", {
			code: "KNOWLEDGE_EMBED_FAILED",
			cause: error instanceof Error ? error : undefined,
		});
	}

	if (vectors.length !== chunks.length) {
		throw new ToolkitError(
			`Embedder returned ${vectors.length} vectors for ${chunks.length} chunks`,
			{ code: "KNOWLEDGE_EMBED_MISMATCH" },
		);
	}

	// Step 4: Attach embeddings and merge metadata
	const enrichedChunks: DocumentChunk[] = chunks.map((c, i) => ({
		content: c.content,
		metadata: { ...doc.metadata, ...c.metadata },
		embedding: vectors[i],
	}));

	// Step 5: Store
	try {
		await store.upsert(enrichedChunks);
	} catch (error) {
		throw new ToolkitError("Vector store upsert failed", {
			code: "KNOWLEDGE_STORE_FAILED",
			cause: error instanceof Error ? error : undefined,
		});
	}

	return {
		chunks: chunks.length,
		embeddings: vectors.length,
		metadata: doc.metadata,
	};
}

// ─── search() ────────────────────────────────────────────────────────────────

/**
 * Semantic search against stored embeddings.
 *
 * Embeds the query text, then performs cosine similarity search against the store.
 *
 * @param query - Natural language query
 * @param embedder - Function to generate query embedding
 * @param store - Vector store to search
 * @param options - Search options (limit, threshold, filter)
 * @returns Array of SearchResult sorted by similarity (highest first)
 *
 * @example
 * ```ts
 * import { search } from '@jamaalbuilds/ai-toolkit/knowledge';
 *
 * const results = await search('revenue growth', embedder, store, {
 *   limit: 5,
 *   threshold: 0.7,
 * });
 * for (const r of results) {
 *   console.log(`${r.similarity}: ${r.chunk.content}`);
 * }
 * ```
 */
export async function search(
	query: string,
	embedder: EmbedFunction,
	store: VectorStore,
	options?: SearchOptions,
): Promise<SearchResult[]> {
	if (typeof query !== "string" || !query.trim()) {
		throw new ToolkitError("search() requires a non-empty query string", {
			code: "KNOWLEDGE_INVALID_INPUT",
		});
	}

	if (typeof embedder !== "function") {
		throw new ToolkitError("search() requires an embedder function", {
			code: "KNOWLEDGE_INVALID_CONFIG",
		});
	}

	if (!store || typeof store.search !== "function") {
		throw new ToolkitError("search() requires a valid vector store", {
			code: "KNOWLEDGE_INVALID_CONFIG",
		});
	}

	// Embed the query
	let queryVector: number[];
	try {
		const vectors = await embedder([query]);
		queryVector = vectors[0];
	} catch (error) {
		throw new ToolkitError("Query embedding failed", {
			code: "KNOWLEDGE_EMBED_FAILED",
			cause: error instanceof Error ? error : undefined,
		});
	}

	if (!queryVector || !Array.isArray(queryVector)) {
		throw new ToolkitError("Embedder returned invalid query vector", {
			code: "KNOWLEDGE_EMBED_FAILED",
		});
	}

	// Search the store
	try {
		return await store.search(queryVector, {
			limit: options?.limit,
			threshold: options?.threshold,
			filter: options?.filter,
		});
	} catch (error) {
		if (error instanceof ToolkitError) throw error;
		throw new ToolkitError("Vector store search failed", {
			code: "KNOWLEDGE_SEARCH_FAILED",
			cause: error instanceof Error ? error : undefined,
		});
	}
}

// ─── Internal: Chain Splitter Loader ─────────────────────────────────────────

type SplitterFactory = (
	chunkSize: number,
	chunkOverlap: number,
	separators: string[],
) => { split(text: string): Promise<string[]> };

async function tryLoadChainSplitter(): Promise<SplitterFactory | null> {
	try {
		const moduleName = "../chain/splitter.js";
		const mod = await import(moduleName);
		if (typeof mod.createSplitter === "function") {
			return (chunkSize: number, chunkOverlap: number, separators: string[]) =>
				mod.createSplitter({ chunkSize, chunkOverlap, separators });
		}
		return null;
	} catch {
		return null;
	}
}
