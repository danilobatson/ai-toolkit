# ADR-008: LangGraph.js for Graph-Based Agent Orchestration

## Status
Accepted

## Date
2026-03-27

## Context
The toolkit needs an agents module for multi-agent orchestration: defining agents with system prompts and tools, connecting them into state graphs with conditional routing, and invoking the graph with shared state. This complements the chain module (ADR-005), which handles sequential composition but not stateful multi-step agent workflows. We need graph-based execution with typed state, conditional branching, and the ability to route between agents dynamically.

## Decision
Use @langchain/langgraph as an optional peer dependency for the agents module, wrapping its StateGraph, Annotation, and conditional edge APIs behind three toolkit functions: `createAgent()`, `createGraph()`, and `route()`.

The agents module wraps:
- **StateGraph** → `createGraph()` — build and compile a state graph from agents
- **Annotation** → internal state definition (messages, currentAgent, metadata)
- **addNode / addEdge / addConditionalEdges** → `createGraph()` edges config
- **START / END constants** → `'__start__'` / `'__end__'` string literals in edges

The agents module does NOT wrap:
- LangGraph's prebuilt agents (createReactAgent) — too opinionated for a toolkit
- LangGraph Platform / deployment features
- Checkpointing / persistence (future enhancement)
- LangGraph's functional API (task/entrypoint) — graph API is more explicit

## Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|
| **LangGraph StateGraph wrapper** (chosen) | Proven graph execution engine, typed state, conditional routing, active ecosystem | Peer dep adds install complexity, LangGraph API surface is large |
| **Custom graph engine** | Zero dependencies, full control over execution | Reinventing graph traversal, state management, and conditional routing from scratch |
| **LangChain agents (from chain module)** | Already have @langchain/core as peer dep | LangChain agents are being deprecated in favor of LangGraph; ADR-005 explicitly excludes orchestration |
| **AutoGen / CrewAI pattern** | Higher-level multi-agent abstractions | No mature JS implementations; too opinionated for a toolkit |

## Consequences
**Positive:**
- Clean separation: chain = composition (ADR-005), agents = orchestration
- `createAgent()` is synchronous and works without LangGraph installed (just creates a handler)
- `createGraph()` only imports LangGraph when actually building a graph
- Dynamic import with variable trick prevents TypeScript from resolving the peer dep at compile time
- Three-function API (createAgent, createGraph, route) is beginner-friendly vs raw LangGraph
- Typed GraphState interface ensures agents share context predictably

**Negative:**
- @langchain/langgraph brings @langchain/core as a transitive peer dep (already in our deps)
- No built-in checkpointing — graph state is ephemeral per invocation
- Users wanting streaming, human-in-the-loop interrupts, or persistence need raw LangGraph access via `compiledGraph`

## Interview Answer
We use LangGraph.js for agent orchestration because it provides a battle-tested graph execution engine with typed state management and conditional routing — the same infrastructure used by Replit and Uber. Our wrapper reduces the API to three functions (createAgent, createGraph, route) while exposing the compiled graph for advanced use cases, keeping the boundary clean: the chain module handles sequential composition, while agents handles stateful multi-step workflows.
