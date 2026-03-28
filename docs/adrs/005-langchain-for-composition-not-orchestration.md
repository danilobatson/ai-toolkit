# ADR-005: LangChain.js for Composition, Not Orchestration

## Status
Accepted

## Date
2026-03-27

## Context
The toolkit needs a chain module for multi-step AI reasoning: prompt templates, output parsing, retrieval-augmented generation (RAG), and text splitting. LangChain.js is the dominant JavaScript framework for LLM application composition, but it also includes agent orchestration features that overlap with our planned agents module (LangGraph.js). We need to decide how much of LangChain to wrap and where to draw the boundary.

## Decision
Use @langchain/core and @langchain/textsplitters for composition primitives only. Agent orchestration stays in the agents module (LangGraph.js).

The chain module wraps:
- **ChatPromptTemplate** → `prompt()` — template building
- **RunnableSequence** → `createChain()` — pipeline composition
- **StructuredOutputParser** → `parse()` — Zod-validated output parsing
- **BaseRetriever pattern** → `rag()` — retrieval-augmented generation
- **RecursiveCharacterTextSplitter** → `createSplitter()` — text chunking

The chain module does NOT wrap:
- Agents, tools, or routing (→ agents module)
- Document loaders (→ knowledge module)
- Embeddings (→ knowledge module)
- Vector stores (→ database module)

## Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| **LangChain composition only** (chosen) | Clear boundary, minimal dependency surface, focused API | Users wanting full LangChain must use it directly alongside toolkit |
| **Full LangChain wrapper** | One module covers everything | Massive API surface, overlaps with agents/knowledge/database modules, hard to maintain |
| **No LangChain — custom only** | Zero dependencies, full control | Reinventing prompt templates, output parsers, and splitters from scratch |
| **LlamaIndex for everything** | Single dependency | LlamaIndex's chain/prompt APIs are less mature than LangChain's |

## Consequences
**Positive:**
- @langchain/core is optional: all chain functions have built-in fallbacks that work without it installed
- Clear module boundaries: chain = composition, agents = orchestration, knowledge = retrieval
- Small dependency footprint: only @langchain/core and @langchain/textsplitters as optional peers
- Built-in implementations mean zero dependencies required for basic prompt/parse/split usage

**Negative:**
- Users familiar with LangChain's full API may expect more features in the chain module
- Built-in fallback implementations are simpler than LangChain's (no streaming transforms, no callback managers)
- Two optional peer deps to install for full LangChain integration

## Interview Answer
We use LangChain.js specifically for composition — prompt templates, output parsing, RAG chains, and text splitting — but not for agent orchestration, which lives in our separate agents module wrapping LangGraph.js. This keeps module boundaries clean: chain handles sequential reasoning, agents handles stateful multi-step workflows. All chain functions include built-in fallbacks, so the module works with zero dependencies for basic use, with @langchain/core as an optional peer dep for advanced features.
