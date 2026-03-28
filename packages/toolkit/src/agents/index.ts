/**
 * Agents — multi-agent orchestration with state graphs and conditional routing.
 *
 * Wraps LangGraph.js behind the toolkit's adapter pattern for building
 * stateful multi-agent systems with typed state, routing, and human-in-the-loop.
 *
 * @example
 * ```ts
 * import { createAgent, createGraph, route } from '@jamaalbuilds/ai-toolkit/agents';
 *
 * const researcher = createAgent({
 *   name: 'researcher',
 *   systemPrompt: 'You research topics thoroughly.',
 *   tools: [searchTool],
 * });
 *
 * const writer = createAgent({
 *   name: 'writer',
 *   systemPrompt: 'You write clear, concise content.',
 * });
 *
 * const graph = createGraph({
 *   agents: [researcher, writer],
 *   edges: [
 *     { from: '__start__', to: 'researcher' },
 *     { from: 'researcher', to: route((state) =>
 *       state.needsMoreResearch ? 'researcher' : 'writer'
 *     ) },
 *     { from: 'writer', to: '__end__' },
 *   ],
 * });
 *
 * const result = await graph.invoke({
 *   messages: [{ role: 'user', content: 'Write about AI agents' }],
 * });
 * ```
 */

export { createAgent, createGraph, route } from "./agents.js";
export type {
	AgentConfig,
	AgentNode,
	GraphConfig,
	GraphEdge,
	GraphInstance,
	GraphState,
	RouteCondition,
	RouteResult,
} from "./types.js";
