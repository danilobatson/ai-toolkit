// ─── Knowledge Module Types ──────────────────────────────────────────────────

/**
 * A parsed document with content and metadata.
 *
 * @example
 * ```ts
 * const doc: KnowledgeDocument = { content: 'Document text...', metadata: { source: 'file.pdf' } };
 * ```
 */
export interface KnowledgeDocument {
	/** The text content of the document */
	content: string;
	/** Document metadata (source, page number, etc.) */
	metadata: Record<string, unknown>;
}

/**
 * A document chunk with content, metadata, and optional embedding.
 *
 * @example
 * ```ts
 * const chunk: DocumentChunk = {
 *   content: 'Chunk text...',
 *   metadata: { source: 'file.pdf', chunkIndex: 0 },
 *   embedding: [0.1, 0.2, 0.3],
 * };
 * ```
 */
export interface DocumentChunk {
	/** The chunk text */
	content: string;
	/** Inherited + chunk-specific metadata */
	metadata: Record<string, unknown>;
	/** Vector embedding (populated after embedding step) */
	embedding?: number[];
}

/**
 * Configuration for the knowledge module.
 *
 * @example
 * ```ts
 * const config: KnowledgeConfig = {
 *   embedder: async (texts) => texts.map(() => [0.1, 0.2, 0.3]),
 *   store: myVectorStore,
 *   chunkSize: 500,
 * };
 * const knowledge = createKnowledge(config);
 * ```
 */
export interface KnowledgeConfig {
	/** Function to generate embeddings from text */
	embedder: EmbedFunction;
	/** Vector storage backend */
	store: VectorStore;
	/** Default chunk size for splitting */
	chunkSize?: number;
	/** Default chunk overlap for splitting */
	chunkOverlap?: number;
}

/**
 * Function that generates embeddings from text.
 * Accepts an array of strings and returns an array of number arrays (one embedding per input).
 *
 * @example
 * ```ts
 * const embedder: EmbedFunction = async (texts) => {
 *   return texts.map(() => new Array(1536).fill(0).map(() => Math.random()));
 * };
 * ```
 */
export type EmbedFunction = (texts: string[]) => Promise<number[][]>;

/**
 * Vector store interface for persisting and searching embeddings.
 *
 * @example
 * ```ts
 * const store: VectorStore = {
 *   upsert: async (chunks) => { },
 *   search: async (vector, opts) => [{ chunk: chunks[0], similarity: 0.9 }],
 * };
 * ```
 */
export interface VectorStore {
	/** Insert chunks with embeddings into the store */
	upsert(chunks: DocumentChunk[]): Promise<void>;
	/** Search for similar chunks by query vector */
	search(
		queryVector: number[],
		options?: VectorStoreSearchOptions,
	): Promise<SearchResult[]>;
}

/**
 * Options for vector store search.
 *
 * @example
 * ```ts
 * const options: VectorStoreSearchOptions = { limit: 5, threshold: 0.7 };
 * const results = await store.search(queryVector, options);
 * ```
 */
export interface VectorStoreSearchOptions {
	/** Maximum number of results */
	limit?: number;
	/** Minimum similarity threshold (0-1) */
	threshold?: number;
	/** Metadata filter */
	filter?: Record<string, unknown>;
}

/**
 * A search result with the matched chunk and similarity score.
 *
 * @example
 * ```ts
 * const results: SearchResult[] = await knowledge.search('What is AI?');
 * for (const { chunk, similarity } of results) {
 *   console.log(`${chunk.content} (score: ${similarity})`);
 * }
 * ```
 */
export interface SearchResult {
	/** The matched document chunk */
	chunk: DocumentChunk;
	/** Similarity score (0-1, higher = more similar) */
	similarity: number;
}

/**
 * Options for the ingest function.
 *
 * @example
 * ```ts
 * const options: IngestOptions = {
 *   metadata: { source: 'docs/guide.md' },
 *   chunkSize: 500,
 *   chunkOverlap: 100,
 * };
 * await knowledge.ingest('Document text...', options);
 * ```
 */
export interface IngestOptions {
	/** Document metadata to attach */
	metadata?: Record<string, unknown>;
	/** Override chunk size */
	chunkSize?: number;
	/** Override chunk overlap */
	chunkOverlap?: number;
}

/**
 * Result of an ingest operation.
 *
 * @example
 * ```ts
 * const result: IngestResult = await knowledge.ingest(fileBuffer);
 * console.log(`Created ${result.chunks} chunks, ${result.embeddings} embeddings`);
 * ```
 */
export interface IngestResult {
	/** Number of chunks created */
	chunks: number;
	/** Number of embeddings generated */
	embeddings: number;
	/** Source document metadata */
	metadata: Record<string, unknown>;
}

/**
 * Options for the search function.
 *
 * @example
 * ```ts
 * const options: SearchOptions = { limit: 5, threshold: 0.7 };
 * const results = await knowledge.search('What is AI?', options);
 * ```
 */
export interface SearchOptions {
	/** Maximum number of results */
	limit?: number;
	/** Minimum similarity threshold (0-1) */
	threshold?: number;
	/** Metadata filter */
	filter?: Record<string, unknown>;
}

/**
 * Options for the chunk function.
 *
 * @example
 * ```ts
 * const options: ChunkOptions = { chunkSize: 500, chunkOverlap: 100 };
 * const chunks = chunk(doc, options);
 * ```
 */
export interface ChunkOptions {
	/** Chunk size in characters */
	chunkSize?: number;
	/** Overlap between chunks in characters */
	chunkOverlap?: number;
	/** Custom separators for splitting */
	separators?: string[];
}

/**
 * The knowledge client returned by createKnowledge().
 *
 * @example
 * ```ts
 * const knowledge: KnowledgeClient = createKnowledge({ embedder, store });
 * await knowledge.ingest('Document text...');
 * const results = await knowledge.search('query');
 * ```
 */
export interface KnowledgeClient {
	/**
	 * Ingest a file or text — parse, chunk, embed, and store.
	 * @param input - File path, Buffer, or plain text string
	 * @param options - Ingest options
	 */
	ingest(
		input: string | Buffer | Uint8Array,
		options?: IngestOptions,
	): Promise<IngestResult>;

	/**
	 * Semantic search against stored embeddings.
	 * @param query - Natural language query
	 * @param options - Search options
	 */
	search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}
