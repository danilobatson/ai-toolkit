// ─── Knowledge Client Factory ────────────────────────────────────────────────
// Creates a stateful knowledge client bound to an embedder + vector store.

import { ToolkitError } from "../errors/index.js";
import { ingest, search } from "./operations.js";
import type {
	IngestOptions,
	IngestResult,
	KnowledgeClient,
	KnowledgeConfig,
	SearchOptions,
	SearchResult,
} from "./types.js";

/**
 * Create a knowledge client for document ingestion and semantic search.
 *
 * The client binds an embedder function and vector store together,
 * providing a simplified API for ingest and search operations.
 *
 * @param config - Knowledge configuration with embedder and store
 * @returns A KnowledgeClient with ingest() and search() methods
 *
 * @example
 * ```ts
 * import { createKnowledge } from '@jamaalbuilds/ai-toolkit/knowledge';
 *
 * const knowledge = createKnowledge({
 *   embedder: async (texts) => embeddings.embed(texts),
 *   store: myVectorStore,
 * });
 *
 * await knowledge.ingest('report.pdf', {
 *   metadata: { source: 'quarterly-report' },
 * });
 *
 * const results = await knowledge.search('revenue growth', { limit: 5 });
 * ```
 */
export function createKnowledge(config: KnowledgeConfig): KnowledgeClient {
	if (!config) {
		throw new ToolkitError("createKnowledge() requires a config object", {
			code: "KNOWLEDGE_INVALID_CONFIG",
		});
	}

	if (typeof config.embedder !== "function") {
		throw new ToolkitError("createKnowledge() requires an embedder function", {
			code: "KNOWLEDGE_INVALID_CONFIG",
		});
	}

	if (!config.store || typeof config.store.upsert !== "function") {
		throw new ToolkitError(
			"createKnowledge() requires a valid vector store with upsert() and search()",
			{ code: "KNOWLEDGE_INVALID_CONFIG" },
		);
	}

	const { embedder, store, chunkSize, chunkOverlap } = config;

	return {
		async ingest(
			input: string | Buffer | Uint8Array,
			options?: IngestOptions,
		): Promise<IngestResult> {
			return ingest(input, embedder, store, {
				...options,
				chunkSize: options?.chunkSize ?? chunkSize,
				chunkOverlap: options?.chunkOverlap ?? chunkOverlap,
			});
		},

		async search(
			query: string,
			options?: SearchOptions,
		): Promise<SearchResult[]> {
			return search(query, embedder, store, options);
		},
	};
}
