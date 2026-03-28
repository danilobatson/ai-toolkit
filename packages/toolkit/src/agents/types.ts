import { z } from "zod";

/**
 * Agents module types — multi-agent orchestration with LangGraph.
 */

// ─── Schemas ────────────────────────────────────────────────────────────────

/** Configuration for creating an agent node. */
export const AgentConfigSchema = z.object({
	/** Unique agent name (used as graph node key). */
	name: z.string().min(1),
	/** System prompt defining the agent's role and behavior. */
	systemPrompt: z.string().min(1),
	/** Optional model identifier override. */
	model: z.string().optional(),
	/** Optional tool definitions the agent can use. */
	tools: z.array(z.record(z.unknown())).optional(),
});

/** Configuration for creating a graph. */
export const GraphConfigSchema = z.object({
	/** Array of agents to include in the graph. */
	agents: z.array(z.record(z.unknown())).min(1),
	/** Edges connecting agents (static or conditional). */
	edges: z.array(z.record(z.unknown())).min(1),
});

// ─── Types ──────────────────────────────────────────────────────────────────

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export type GraphConfig = {
	/** Array of agent nodes to include in the graph. */
	agents: AgentNode[];
	/** Edges connecting agents (static or conditional). */
	edges: GraphEdge[];
};

/** A defined agent node for use in a graph. */
export interface AgentNode {
	/** The agent name (graph node key). */
	name: string;
	/** The system prompt. */
	systemPrompt: string;
	/** Optional model override. */
	model?: string;
	/** Optional tools. */
	tools?: Record<string, unknown>[];
	/** The node handler (internal). */
	handler: (state: GraphState) => Promise<Partial<GraphState>>;
}

/** A message in the agent graph state. */
export interface GraphMessage {
	/** Message role. */
	role: "system" | "user" | "assistant" | "tool";
	/** Message content. */
	content: string;
	/** Optional tool call metadata. */
	toolCalls?: Record<string, unknown>[];
}

/** The shared state object passed between agents in a graph. */
export interface GraphState {
	/** Conversation messages. */
	messages: GraphMessage[];
	/** Current active agent name. */
	currentAgent?: string;
	/** Arbitrary metadata shared between agents. */
	metadata?: Record<string, unknown>;
}

/** A static or conditional edge in the graph. */
export type GraphEdge = {
	/** Source node name (or '__start__'). */
	from: string;
	/** Target node name, '__end__', or a route result. */
	to: string | RouteResult;
};

/** The result of a route() call — a conditional routing function. */
export interface RouteResult {
	/** Marker to identify this as a route result. */
	__isRoute: true;
	/** The routing condition function. */
	condition: RouteCondition;
	/** Possible destination node names (for graph validation). */
	destinations: string[];
}

/** A function that evaluates state and returns the next node name. */
export type RouteCondition = (state: GraphState) => string | Promise<string>;

/** A compiled, invokable graph instance. */
export interface GraphInstance {
	/** Invoke the graph with initial state. */
	invoke: (input: Partial<GraphState>) => Promise<GraphState>;
	/** The underlying LangGraph compiled graph (for advanced usage). */
	compiledGraph: unknown;
}
