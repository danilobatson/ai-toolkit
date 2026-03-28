import { describe, it } from "vitest";

describe("monitor", () => {
	// Level 1: CRASH
	it.todo("createMonitor does not throw with valid config");
	it.todo("createLogger does not throw with valid service name");

	// Level 2: BEHAVIOR
	it.todo("trace creates a traced span and returns result");
	it.todo("evaluate records a score for a trace");
	it.todo("getCostReport aggregates costs by model");

	// Level 3: DATA QUALITY
	it.todo("trace captures input/output metadata");
	it.todo("getCostReport returns correct cost structure");

	// Level 4: ENVIRONMENT
	it.todo("createMonitor returns noop monitor when keys missing");
	it.todo("trace works with noop monitor (no Langfuse)");
	it.todo("evaluate is silently skipped with noop monitor");

	// Level 5: PATTERN
	it.todo("all exports match toolkit conventions");

	// Level 6: CONTRACT
	it.todo("MonitorClient interface is honored");

	// Level 7: PROVIDER FALLBACK
	it.todo("graceful degradation when Langfuse unavailable");

	// Level 8: CLEANUP
	it.todo("shutdown flushes pending data");
});
