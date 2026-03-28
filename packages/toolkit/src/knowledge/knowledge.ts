// ─── Knowledge Client Factory ────────────────────────────────────────────────
// Placeholder — implemented by /writer

import { ToolkitError } from "../errors/index.js";
import type { KnowledgeClient, KnowledgeConfig } from "./types.js";

/**
 * Create a knowledge client for document ingestion and semantic search.
 *
 * @param config - Knowledge configuration with embedder and optional store
 * @returns A KnowledgeClient with ingest() and search() methods
 *
 * @example
 * ```ts
 * const knowledge = createKnowledge({
 *   embedder: async (texts) => embeddings.embed(texts),
 *   store: myVectorStore,
 * });
 * ```
 */
export function createKnowledge(_config: KnowledgeConfig): KnowledgeClient {
	throw new ToolkitError("Not implemented — run /writer knowledge", {
		code: "KNOWLEDGE_NOT_IMPLEMENTED",
	});
}
