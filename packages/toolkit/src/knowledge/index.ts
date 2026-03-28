/**
 * Knowledge — document ingestion, chunking, embedding, and semantic search.
 *
 * Wraps LiteParse for PDF parsing and integrates with the chain module for
 * text splitting, ai module for embeddings, and database module for vector storage.
 *
 * @example
 * ```ts
 * import { createKnowledge, ingest, search, chunk } from '@jamaalbuilds/ai-toolkit/knowledge';
 *
 * // Create a knowledge client
 * const knowledge = createKnowledge({
 *   embedder: async (texts) => embeddings.embed(texts),
 *   store: myVectorStore,
 * });
 *
 * // Ingest a PDF
 * const result = await knowledge.ingest('report.pdf', {
 *   metadata: { source: 'quarterly-report' },
 * });
 *
 * // Search
 * const results = await knowledge.search('revenue growth', { limit: 5 });
 *
 * // Chunk text directly
 * const chunks = await chunk('Long document text...', { chunkSize: 500 });
 * ```
 */

export { createKnowledge } from "./knowledge.js";
export { chunk, ingest, search } from "./operations.js";
export type {
	ChunkOptions,
	DocumentChunk,
	EmbedFunction,
	IngestOptions,
	IngestResult,
	KnowledgeClient,
	KnowledgeConfig,
	KnowledgeDocument,
	SearchOptions,
	SearchResult,
	VectorStore,
	VectorStoreSearchOptions,
} from "./types.js";
