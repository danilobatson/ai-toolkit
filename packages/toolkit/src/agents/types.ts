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

/** Schema for an agent node passed to createGraph. */
export const GraphAgentNodeSchema = z.object({
	/** Agent name (graph node key). */
	name: z.string().min(1),
	/** System prompt defining the agent's behavior. */
	systemPrompt: z.string().min(1),
	/** Node handler function. */
	handler: z.function(),
}).passthrough();

/** Schema for a graph edge. */
export const GraphEdgeSchema = z.object({
	/** Source node name (or '__start__'). */
	from: z.string().min(1),
	/** Target node name, '__end__', or a route result. */
	to: z.union([
		z.string().min(1),
		z.object({ __isRoute: z.literal(true) }).passthrough(),
	]),
});

/** Configuration for creating a graph. */
export const GraphConfigSchema = z.object({
	/** Array of agents to include in the graph. */
	agents: z.array(GraphAgentNodeSchema).min(1),
	/** Edges connecting agents (static or conditional). */
	edges: z.array(GraphEdgeSchema).min(1),
});

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Configuration for creating an agent node (inferred from AgentConfigSchema).
 *
 * @example
 * ```ts
 * const config: AgentConfig = {
 *   name: 'researcher',
 *   systemPrompt: 'You are a research assistant.',
 *   model: 'gpt-4o',
 * };
 * ```
 */
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * A message in the agent graph state.
 *
 * @example
 * ```ts
 * const msg: GraphMessage = { role: 'user', content: 'Hello' };
 * ```
 */
export interface GraphMessage {
	/** Message role. */
	role: "system" | "user" | "assistant" | "tool";
	/** Message content. */
	content: string;
	/** Optional tool call metadata. */
	toolCalls?: Record<string, unknown>[];
}

/**
 * The shared state object passed between agents in a graph.
 *
 * @example
 * ```ts
 * const state: GraphState = {
 *   messages: [{ role: 'user', content: 'Hello' }],
 *   currentAgent: 'router',
 * };
 * ```
 */
export interface GraphState {
	/** Conversation messages. */
	messages: GraphMessage[];
	/** Current active agent name. */
	currentAgent?: string;
	/** Arbitrary metadata shared between agents. */
	metadata?: Record<string, unknown>;
}

/**
 * A defined agent node for use in a graph.
 *
 * @example
 * ```ts
 * const node: AgentNode = createAgent({
 *   name: 'writer',
 *   systemPrompt: 'You write content.',
 *   handler: async (state) => ({ messages: [...state.messages, { role: 'assistant', content: 'Done' }] }),
 * });
 * ```
 */
export interface AgentNode {
	/** The agent name (graph node key). */
	name: string;
	/** The system prompt. */
	systemPrompt: string;
	/** Optional model override. */
	model?: string;
	/** Optional tools. */
	tools?: Record<string, unknown>[];
	/** The node handler function. */
	handler: (state: GraphState) => Promise<Partial<GraphState>>;
}

/**
 * A static or conditional edge in the graph.
 *
 * @example
 * ```ts
 * const edge: GraphEdge = { from: '__start__', to: 'router' };
 * ```
 */
export interface GraphEdge {
	/** Source node name (or '__start__'). */
	from: string;
	/** Target node name, '__end__', or a route result. */
	to: string | RouteResult;
}

/**
 * Configuration for building a graph from agents and edges.
 *
 * @example
 * ```ts
 * const config: GraphConfig = {
 *   agents: [routerAgent, writerAgent],
 *   edges: [
 *     { from: '__start__', to: 'router' },
 *     { from: 'router', to: route((s) => s.currentAgent ?? '__end__', ['writer', '__end__']) },
 *   ],
 * };
 * ```
 */
export interface GraphConfig {
	/** Agent nodes to include in the graph. */
	agents: AgentNode[];
	/** Edges connecting agents (static or conditional). */
	edges: GraphEdge[];
}

/**
 * The result of a route() call — a conditional routing descriptor.
 *
 * @example
 * ```ts
 * const routeResult: RouteResult = route(
 *   (state) => state.currentAgent ?? '__end__',
 *   ['writer', 'reviewer', '__end__'],
 * );
 * ```
 */
export interface RouteResult {
	/** Marker to identify this as a route result. */
	__isRoute: true;
	/** The routing condition function. */
	condition: RouteCondition;
	/** Possible destination node names (for graph validation). */
	destinations: string[];
}

/**
 * A function that evaluates state and returns the next node name.
 *
 * @example
 * ```ts
 * const condition: RouteCondition = (state) => state.currentAgent ?? '__end__';
 * ```
 */
export type RouteCondition = (state: GraphState) => string | Promise<string>;

/**
 * A compiled, invokable graph instance.
 *
 * @example
 * ```ts
 * const graph: GraphInstance = await createGraph(config);
 * const result = await graph.invoke({ messages: [{ role: 'user', content: 'Hello' }] });
 * ```
 */
export interface GraphInstance {
	/** Invoke the graph with initial state and get the final state. */
	invoke: (input: Partial<GraphState>) => Promise<GraphState>;
	/** The underlying LangGraph compiled graph (for advanced usage). */
	compiledGraph: unknown;
}
