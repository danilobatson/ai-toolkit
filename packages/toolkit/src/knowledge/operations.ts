// ─── Standalone Knowledge Operations ─────────────────────────────────────────
// Placeholder — implemented by /writer

import { ToolkitError } from "../errors/index.js";
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

/**
 * Ingest a file or text — parse, chunk, embed, and store.
 *
 * @param input - File path, Buffer, or plain text string
 * @param embedder - Function to generate embeddings
 * @param store - Vector store for persistence
 * @param options - Ingest options
 *
 * @example
 * ```ts
 * const result = await ingest('report.pdf', embedder, store, {
 *   metadata: { source: 'quarterly-report' },
 * });
 * ```
 */
export async function ingest(
	_input: string | Buffer | Uint8Array,
	_embedder: EmbedFunction,
	_store: VectorStore,
	_options?: IngestOptions,
): Promise<IngestResult> {
	throw new ToolkitError("Not implemented — run /writer knowledge", {
		code: "KNOWLEDGE_NOT_IMPLEMENTED",
	});
}

/**
 * Semantic search against stored embeddings.
 *
 * @param query - Natural language query
 * @param embedder - Function to generate query embedding
 * @param store - Vector store to search
 * @param options - Search options
 *
 * @example
 * ```ts
 * const results = await search('revenue growth', embedder, store, { limit: 5 });
 * ```
 */
export async function search(
	_query: string,
	_embedder: EmbedFunction,
	_store: VectorStore,
	_options?: SearchOptions,
): Promise<SearchResult[]> {
	throw new ToolkitError("Not implemented — run /writer knowledge", {
		code: "KNOWLEDGE_NOT_IMPLEMENTED",
	});
}

/**
 * Split text into chunks using the chain module's splitter.
 *
 * @param text - Text to split
 * @param options - Chunk size, overlap, and separator options
 *
 * @example
 * ```ts
 * const chunks = await chunk('Long document text...', { chunkSize: 500 });
 * ```
 */
export async function chunk(
	_text: string,
	_options?: ChunkOptions,
): Promise<DocumentChunk[]> {
	throw new ToolkitError("Not implemented — run /writer knowledge", {
		code: "KNOWLEDGE_NOT_IMPLEMENTED",
	});
}
