import { describe, it } from "vitest";

describe("knowledge", () => {
	// ── Level 1: CRASH ──────────────────────────────────────────────────────
	it.todo("createKnowledge does not throw on valid config");
	it.todo("ingest does not throw on valid text input");
	it.todo("chunk does not throw on valid text");

	// ── Level 2: BEHAVIOR ───────────────────────────────────────────────────
	it.todo("ingest parses text, chunks, embeds, and stores");
	it.todo("search returns ranked results by similarity");
	it.todo("chunk splits text into sized chunks");

	// ── Level 3: DATA QUALITY ───────────────────────────────────────────────
	it.todo("ingest result has correct chunk count");
	it.todo("search results have similarity scores between 0 and 1");

	// ── Level 4: ENVIRONMENT ────────────────────────────────────────────────
	it.todo("createKnowledge throws on missing embedder");
	it.todo("ingest throws on empty input");
	it.todo("search throws on empty query");

	// ── Level 5: PATTERN ────────────────────────────────────────────────────
	it.todo("all errors are ToolkitError instances");
	it.todo("exports match module convention");

	// ── Level 6: CONTRACT ───────────────────────────────────────────────────
	it.todo("KnowledgeClient implements ingest and search methods");
	it.todo("IngestResult has chunks, embeddings, metadata fields");

	// ── Level 7: PROVIDER FALLBACK ──────────────────────────────────────────
	it.todo("ingest works without LiteParse for plain text");
	it.todo("chunk works with default splitter settings");

	// ── Level 8: CLEANUP ────────────────────────────────────────────────────
	it.todo("no resources leak after ingest");
});
