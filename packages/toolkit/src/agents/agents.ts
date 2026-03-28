// ─── Agents — Multi-Agent Orchestration ─────────────────────────────────────
// Wraps LangGraph.js behind the toolkit adapter pattern.

import { ToolkitError } from "../errors/index.js";
import type {
	AgentConfig,
	AgentNode,
	GraphConfig,
	GraphInstance,
	GraphState,
	RouteCondition,
	RouteResult,
} from "./types.js";
import { AgentConfigSchema, GraphConfigSchema } from "./types.js";

// ─── Dynamic Import ─────────────────────────────────────────────────────────

interface LangGraphModule {
	StateGraph: new (
		config: Record<string, unknown>,
	) => {
		addNode: (
			name: string,
			handler: (
				state: Record<string, unknown>,
			) => Promise<Record<string, unknown>>,
		) => unknown;
		addEdge: (from: string, to: string) => unknown;
		addConditionalEdges: (
			source: string,
			path: (state: Record<string, unknown>) => string | Promise<string>,
			pathMap?: Record<string, string> | string[],
		) => unknown;
		compile: () => {
			invoke: (
				input: Record<string, unknown>,
			) => Promise<Record<string, unknown>>;
		};
	};
	Annotation: {
		Root: (def: Record<string, unknown>) => Record<string, unknown>;
		(config?: Record<string, unknown>): unknown;
	};
	START: string;
	END: string;
	messagesStateReducer: unknown;
}

async function loadLangGraph(): Promise<LangGraphModule> {
	try {
		const moduleName = "@langchain/langgraph";
		const mod = (await import(moduleName)) as Record<string, unknown>;
		if (!mod.StateGraph) {
			throw new ToolkitError(
				"@langchain/langgraph module found but StateGraph not exported — check version",
				{ code: "AGENTS_IMPORT_FAILED" },
			);
		}
		return mod as unknown as LangGraphModule;
	} catch (error) {
		if (error instanceof ToolkitError) throw error;
		throw new ToolkitError(
			"@langchain/langgraph is required for the agents module. Install it with: yarn add @langchain/langgraph",
			{
				code: "AGENTS_IMPORT_FAILED",
				cause: error instanceof Error ? error : undefined,
			},
		);
	}
}

// ─── createAgent() ──────────────────────────────────────────────────────────

/**
 * Define an agent with a system prompt, optional tools, and model override.
 *
 * Creates an agent node that can be composed into a graph with createGraph().
 * The agent's handler appends the system prompt and delegates to the next step.
 *
 * @param config - Agent configuration (name, systemPrompt, model, tools)
 * @returns An AgentNode ready for graph composition
 *
 * @example
 * ```ts
 * import { createAgent } from '@jamaalbuilds/ai-toolkit/agents';
 *
 * const researcher = createAgent({
 *   name: 'researcher',
 *   systemPrompt: 'You research topics thoroughly using available tools.',
 *   tools: [searchTool, fetchTool],
 * });
 *
 * const writer = createAgent({
 *   name: 'writer',
 *   systemPrompt: 'You write clear, concise content based on research.',
 * });
 * ```
 */
export function createAgent(config: AgentConfig): AgentNode {
	const parsed = AgentConfigSchema.safeParse(config);
	if (!parsed.success) {
		throw new ToolkitError(
			`createAgent() invalid config: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
			{ code: "AGENTS_INVALID_CONFIG" },
		);
	}

	const handler = async (state: GraphState): Promise<Partial<GraphState>> => {
		const systemMessage = {
			role: "system" as const,
			content: parsed.data.systemPrompt,
		};

		const hasSystem = state.messages.some(
			(m) => m.role === "system" && m.content === parsed.data.systemPrompt,
		);

		// Return only new messages (delta) — the reducer accumulates them
		const newMessages = hasSystem ? [] : [systemMessage];

		return {
			messages: newMessages,
			currentAgent: parsed.data.name,
			metadata: {
				...state.metadata,
				lastAgent: parsed.data.name,
				...(parsed.data.model ? { model: parsed.data.model } : {}),
				...(parsed.data.tools?.length
					? { toolCount: parsed.data.tools.length }
					: {}),
			},
		};
	};

	return {
		name: parsed.data.name,
		systemPrompt: parsed.data.systemPrompt,
		model: parsed.data.model,
		tools: parsed.data.tools,
		handler,
	};
}

// ─── route() ────────────────────────────────────────────────────────────────

/**
 * Create a conditional routing descriptor for graph edges.
 *
 * The condition function receives the current graph state and returns
 * the name of the next agent node to route to. Use with createGraph() edges.
 *
 * @param condition - Function that evaluates state and returns next node name
 * @param destinations - Array of possible destination node names (for validation)
 * @returns A RouteResult descriptor for use in graph edges
 *
 * @example
 * ```ts
 * import { route } from '@jamaalbuilds/ai-toolkit/agents';
 *
 * const edge = {
 *   from: 'researcher',
 *   to: route(
 *     (state) => state.metadata?.needsMoreResearch ? 'researcher' : 'writer',
 *     ['researcher', 'writer'],
 *   ),
 * };
 * ```
 */
export function route(
	condition: RouteCondition,
	destinations?: string[],
): RouteResult {
	if (typeof condition !== "function") {
		throw new ToolkitError("route() requires a condition function", {
			code: "AGENTS_INVALID_CONFIG",
		});
	}

	return {
		__isRoute: true,
		condition,
		destinations: destinations ?? [],
	};
}

// ─── createGraph() ──────────────────────────────────────────────────────────

/**
 * Build a state graph from agents and edges, then compile it for invocation.
 *
 * Wraps LangGraph's StateGraph with the toolkit's adapter pattern. Agents
 * are added as nodes, edges define the flow. Use '__start__' and '__end__'
 * for graph entry and exit points.
 *
 * @param config - Graph configuration with agents and edges
 * @returns A compiled GraphInstance with an invoke() method
 *
 * @example
 * ```ts
 * import { createAgent, createGraph, route } from '@jamaalbuilds/ai-toolkit/agents';
 *
 * const researcher = createAgent({
 *   name: 'researcher',
 *   systemPrompt: 'You research topics.',
 * });
 *
 * const writer = createAgent({
 *   name: 'writer',
 *   systemPrompt: 'You write content.',
 * });
 *
 * const graph = await createGraph({
 *   agents: [researcher, writer],
 *   edges: [
 *     { from: '__start__', to: 'researcher' },
 *     { from: 'researcher', to: 'writer' },
 *     { from: 'writer', to: '__end__' },
 *   ],
 * });
 *
 * const result = await graph.invoke({
 *   messages: [{ role: 'user', content: 'Write about AI' }],
 * });
 * ```
 */
export async function createGraph(config: GraphConfig): Promise<GraphInstance> {
	const parsed = GraphConfigSchema.safeParse(config);
	if (!parsed.success) {
		throw new ToolkitError(
			`createGraph() invalid config: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
			{ code: "AGENTS_INVALID_CONFIG" },
		);
	}

	validateUniqueAgentNames(config.agents);

	const langGraph = await loadLangGraph();

	try {
		const graph = buildStateGraph(langGraph);
		addAgentNodes(graph, config.agents);
		addGraphEdges(graph, config.edges, config.agents, langGraph);

		const compiled = graph.compile();
		return {
			invoke: createGraphInvoker(compiled),
			compiledGraph: compiled,
		};
	} catch (error) {
		if (error instanceof ToolkitError) throw error;
		throw new ToolkitError("Failed to build agent graph", {
			code: "AGENTS_BUILD_FAILED",
			cause: error instanceof Error ? error : undefined,
		});
	}
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function validateUniqueAgentNames(agents: AgentNode[]): void {
	const names = new Set<string>();
	for (const agent of agents) {
		if (names.has(agent.name)) {
			throw new ToolkitError(
				`createGraph() duplicate agent name: "${agent.name}"`,
				{ code: "AGENTS_INVALID_CONFIG" },
			);
		}
		names.add(agent.name);
	}
}

function buildStateGraph(langGraph: LangGraphModule) {
	const stateDefinition: Record<string, unknown> = {
		messages: langGraph.Annotation({
			reducer: (
				current: GraphState["messages"],
				update: GraphState["messages"],
			) => [...(current ?? []), ...(update ?? [])],
			default: () => [],
		}),
		currentAgent: langGraph.Annotation({
			reducer: (_current: string | undefined, update: string | undefined) =>
				update,
			default: () => undefined,
		}),
		metadata: langGraph.Annotation({
			reducer: (
				current: Record<string, unknown> | undefined,
				update: Record<string, unknown> | undefined,
			) => ({ ...current, ...update }),
			default: () => ({}),
		}),
	};

	const stateSchema = langGraph.Annotation.Root(stateDefinition);
	return new langGraph.StateGraph(stateSchema as Record<string, unknown>);
}

function addAgentNodes(
	graph: ReturnType<typeof buildStateGraph>,
	agents: AgentNode[],
): void {
	for (const agent of agents) {
		graph.addNode(agent.name, async (state: Record<string, unknown>) => {
			try {
				return await agent.handler(state as unknown as GraphState);
			} catch (error) {
				if (error instanceof ToolkitError) throw error;
				throw new ToolkitError(`Agent "${agent.name}" failed`, {
					code: "AGENTS_NODE_FAILED",
					retryable: true,
					cause: error instanceof Error ? error : undefined,
				});
			}
		});
	}
}

function addGraphEdges(
	graph: ReturnType<typeof buildStateGraph>,
	edges: GraphConfig["edges"],
	agents: AgentNode[],
	langGraph: LangGraphModule,
): void {
	for (const edge of edges) {
		const fromKey = edge.from === "__start__" ? langGraph.START : edge.from;

		if (isRouteResult(edge.to)) {
			addConditionalEdge(graph, fromKey, edge.to, agents, langGraph);
		} else {
			const toKey = edge.to === "__end__" ? langGraph.END : edge.to;
			graph.addEdge(fromKey, toKey);
		}
	}
}

function addConditionalEdge(
	graph: ReturnType<typeof buildStateGraph>,
	fromKey: string,
	routeResult: RouteResult,
	agents: AgentNode[],
	langGraph: LangGraphModule,
): void {
	const destinations =
		routeResult.destinations.length > 0
			? routeResult.destinations
			: agents.map((a) => a.name);

	const pathTargets = [...destinations];
	if (!pathTargets.includes(langGraph.END)) {
		pathTargets.push(langGraph.END);
	}

	graph.addConditionalEdges(
		fromKey,
		async (state: Record<string, unknown>) => {
			const result = await routeResult.condition(
				state as unknown as GraphState,
			);
			return result === "__end__" ? langGraph.END : result;
		},
		pathTargets,
	);
}

function createGraphInvoker(
	compiled: { invoke: (input: Record<string, unknown>) => Promise<Record<string, unknown>> },
): (input: Partial<GraphState>) => Promise<GraphState> {
	return async (input: Partial<GraphState>): Promise<GraphState> => {
		try {
			const initialState = {
				messages: input.messages ?? [],
				currentAgent: input.currentAgent,
				metadata: input.metadata ?? {},
			};

			const result = await compiled.invoke(
				initialState as unknown as Record<string, unknown>,
			);

			return {
				messages:
					((result as Record<string, unknown>)
						.messages as GraphState["messages"]) ?? [],
				currentAgent: (result as Record<string, unknown>).currentAgent as
					| string
					| undefined,
				metadata: (result as Record<string, unknown>).metadata as
					| Record<string, unknown>
					| undefined,
			};
		} catch (error) {
			if (error instanceof ToolkitError) throw error;
			throw new ToolkitError("Graph invocation failed", {
				code: "AGENTS_INVOKE_FAILED",
				cause: error instanceof Error ? error : undefined,
			});
		}
	};
}

function isRouteResult(value: unknown): value is RouteResult {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as RouteResult).__isRoute === true
	);
}
