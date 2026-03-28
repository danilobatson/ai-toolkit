/**
 * Knowledge — document ingestion, chunking, embedding, and semantic search.
 *
 * Wraps @llamaindex/liteparse for PDF parsing and integrates with the chain
 * module for text splitting. Provides a pipeline: parse → chunk → embed → store → search.
 *
 * @example
 * ```ts
 * import { createKnowledge, chunk, ingest, search } from '@jamaalbuilds/ai-toolkit/knowledge';
 *
 * // Create a knowledge client with embedder + vector store
 * const knowledge = createKnowledge({
 *   embedder: async (texts) => embeddings.embed(texts),
 *   store: myVectorStore,
 * });
 *
 * // Ingest a PDF — parse, chunk, embed, store in one call
 * const result = await knowledge.ingest('report.pdf', {
 *   metadata: { source: 'quarterly-report' },
 * });
 *
 * // Semantic search
 * const results = await knowledge.search('revenue growth', { limit: 5 });
 *
 * // Standalone chunking (no embedder or store needed)
 * const chunks = await chunk('Long document text...', { chunkSize: 500 });
 * ```
 */

export { createKnowledge } from "./knowledge.js";
export { chunk, ingest, search } from "./operations.js";
export { parseDocument } from "./parser.js";
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
