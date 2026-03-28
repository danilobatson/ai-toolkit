# ADR-006: LiteParse for PDF, Custom Pipeline Over LlamaIndex Framework

## Status
Accepted

## Date
2026-03-27

## Context
The toolkit needs a knowledge module for document ingestion and semantic search. The original plan called for wrapping LlamaIndex.js as the orchestration layer, but investigation revealed that LlamaIndex.js is a heavy framework with its own opinions about embeddings, vector stores, and retrieval pipelines. We already have purpose-built modules for each of these concerns: `ai` for model calls, `database` for pgvector storage, and `chain` for text splitting. What we actually needed from LlamaIndex was PDF parsing — and their standalone `@llamaindex/liteparse` package does exactly that without pulling in the framework.

## Decision
Use `@llamaindex/liteparse` for PDF parsing only. Build the ingestion pipeline (parse → chunk → embed → store → search) from existing toolkit modules rather than wrapping the LlamaIndex framework.

The knowledge module:
- **Parses** with `@llamaindex/liteparse` (PDF) or built-in text handling (MD, TXT)
- **Chunks** with the chain module's `createSplitter()` (falls back to built-in)
- **Embeds** via a user-provided `EmbedFunction` (decoupled from any specific provider)
- **Stores/searches** via a `VectorStore` interface (decoupled from any specific database)

## Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| **LiteParse + custom pipeline** (chosen) | Minimal dependency, reuses existing modules, full control over pipeline | Users expecting LlamaIndex integration must use it directly |
| **Full LlamaIndex.js wrapper** | Rich ecosystem, built-in retrievers and agents | Massive dependency, overlaps with ai/database/chain modules, opinionated about providers |
| **pdf-parse (Mozilla pdfjs)** | Zero cloud deps, well-known | Unmaintained since 2022, no OCR, limited text quality |
| **LlamaParse cloud API** | Best parsing quality for complex layouts | Requires cloud account, not local-first, usage-based pricing |

## Consequences
**Positive:**
- Single lightweight optional peer dep (`@llamaindex/liteparse`) instead of the full LlamaIndex framework
- Pipeline composes existing toolkit modules — no duplicate abstractions
- EmbedFunction and VectorStore interfaces are provider-agnostic — works with any embedding model or database
- Plain text and markdown work with zero dependencies (LiteParse only needed for PDFs)
- Built-in fallback splitter means chunking works even without @langchain/textsplitters

**Negative:**
- Users wanting LlamaIndex's advanced retrieval strategies (sub-question, tree summarize) must use LlamaIndex directly
- No built-in OCR for scanned PDFs without LiteParse installed
- EmbedFunction must be wired up manually (no auto-detection of embedding provider)

## Interview Answer
We chose `@llamaindex/liteparse` for PDF parsing but built our own ingestion pipeline instead of wrapping the full LlamaIndex framework. Since we already had modules for text splitting (chain), vector storage (database), and model calls (ai), adding LlamaIndex would have introduced duplicate abstractions and a heavy dependency — LiteParse gives us the parsing we need at a fraction of the cost, while our custom pipeline composes the modules we already own.
