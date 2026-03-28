import { describe, it } from "vitest";

describe("agents module", () => {
	// Level 1: CRASH
	it.todo("createAgent does not throw on valid config");
	it.todo("createGraph does not throw on valid config");
	it.todo("route does not throw on valid condition");

	// Level 2: BEHAVIOR
	it.todo("createAgent returns an AgentNode with handler");
	it.todo("createGraph returns a GraphInstance with invoke");
	it.todo("route returns a RouteResult with condition");

	// Level 3: DATA QUALITY
	it.todo("graph invoke returns GraphState with messages");

	// Level 4: ENVIRONMENT
	it.todo("createAgent rejects empty name");
	it.todo("createAgent rejects empty systemPrompt");
	it.todo("createGraph rejects empty agents array");
	it.todo("createGraph rejects empty edges array");
	it.todo("route rejects non-function condition");

	// Level 5: PATTERN
	it.todo("all errors are ToolkitError instances");
	it.todo("error codes use AGENTS_ prefix");

	// Level 6: CONTRACT
	it.todo("AgentNode has required properties");
	it.todo("GraphInstance has invoke method");

	// Level 7: PROVIDER FALLBACK
	it.todo("works without @langchain/langgraph installed (graceful error)");

	// Level 8: CLEANUP
	it.todo("graph does not leak state between invocations");
});
