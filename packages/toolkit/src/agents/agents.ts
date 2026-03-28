// ─── Agents — Multi-Agent Orchestration ─────────────────────────────────────
// Wraps LangGraph.js behind the toolkit adapter pattern.
// Implementation pending — see /writer agents.

import { ToolkitError } from "../errors/index.js";
import type {
	AgentConfig,
	AgentNode,
	GraphConfig,
	GraphInstance,
	RouteCondition,
	RouteResult,
} from "./types.js";

export function createAgent(_config: AgentConfig): AgentNode {
	throw new ToolkitError("Not implemented — run /writer agents", {
		code: "AGENTS_NOT_IMPLEMENTED",
	});
}

export function createGraph(_config: GraphConfig): Promise<GraphInstance> {
	throw new ToolkitError("Not implemented — run /writer agents", {
		code: "AGENTS_NOT_IMPLEMENTED",
	});
}

export function route(_condition: RouteCondition): RouteResult {
	throw new ToolkitError("Not implemented — run /writer agents", {
		code: "AGENTS_NOT_IMPLEMENTED",
	});
}
