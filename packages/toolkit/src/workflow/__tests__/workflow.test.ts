import { describe, it } from "vitest";

describe("workflow", () => {
	// Level 1: CRASH
	it.todo("createWorkflow does not throw on valid input");

	// Level 2: BEHAVIOR
	it.todo("defineJob creates a durable job with correct config");

	// Level 3: DATA QUALITY
	it.todo("humanInTheLoop returns approval event or null on timeout");

	// Level 4: ENVIRONMENT
	it.todo("createWorkflow throws on missing id");

	// Level 5: PATTERN
	it.todo("all exports follow toolkit conventions");

	// Level 6: CONTRACT
	it.todo("defineJob honors retry and concurrency config");

	// Level 7: PROVIDER FALLBACK
	it.todo("works without Inngest installed (graceful error)");

	// Level 8: CLEANUP
	it.todo("workflow resources are released on cleanup");
});
