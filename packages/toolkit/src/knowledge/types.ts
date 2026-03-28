// ─── Knowledge Module Types ──────────────────────────────────────────────────

/**
 * A parsed document with content and metadata.
 */
export interface KnowledgeDocument {
	/** The text content of the document */
	content: string;
	/** Document metadata (source, page number, etc.) */
	metadata: Record<string, unknown>;
}

/**
 * A document chunk with content, metadata, and optional embedding.
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
 */
export type EmbedFunction = (texts: string[]) => Promise<number[][]>;

/**
 * Vector store interface for persisting and searching embeddings.
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
 */
export interface SearchResult {
	/** The matched document chunk */
	chunk: DocumentChunk;
	/** Similarity score (0-1, higher = more similar) */
	similarity: number;
}

/**
 * Options for the ingest function.
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
