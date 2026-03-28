import { describe, expect, it } from "vitest";
import {
	mockAgents,
	mockAI,
	mockChain,
	mockKnowledge,
	mockMonitor,
	mockWorkflow,
} from "../mocks.js";

// ─── mockAI ────────────────────────────────────────────────────────────────

describe("mockAI", () => {
	it("CRASH — does not throw on creation with no args", () => {
		expect(() => mockAI()).not.toThrow();
	});

	it("BEHAVIOR — generate returns configured text", async () => {
		const ai = mockAI({ text: "Hello world" });
		const result = await ai.generate("test");
		expect(result.text).toBe("Hello world");
	});

	it("BEHAVIOR — generate cycles through texts array", async () => {
		const ai = mockAI({ texts: ["first", "second", "third"] });
		const r1 = await ai.generate("a");
		const r2 = await ai.generate("b");
		const r3 = await ai.generate("c");
		const r4 = await ai.generate("d");
		expect(r1.text).toBe("first");
		expect(r2.text).toBe("second");
		expect(r3.text).toBe("third");
		expect(r4.text).toBe("first");
	});

	it("BEHAVIOR — stream yields configured chunks", async () => {
		const ai = mockAI({ streamChunks: ["one", "two"] });
		const result = await ai.stream("test");
		const chunks: string[] = [];
		for await (const chunk of result.textStream) {
			chunks.push(chunk);
		}
		expect(chunks).toEqual(["one", "two"]);
		expect(await result.text).toBe("onetwo");
	});

	it("BEHAVIOR — structured returns configured object", async () => {
		const ai = mockAI({ structuredResult: { name: "Alice", age: 30 } });
		const result = await ai.structured("test", {} as Record<string, unknown>);
		expect(result.object).toEqual({ name: "Alice", age: 30 });
	});

	it("DATA QUALITY — generate result has correct shape", async () => {
		const ai = mockAI();
		const result = await ai.generate("test");
		expect(result).toHaveProperty("text");
		expect(result).toHaveProperty("model");
		expect(result).toHaveProperty("provider");
		expect(result).toHaveProperty("usedFallback", false);
		expect(result).toHaveProperty("usage");
		expect(result).toHaveProperty("cost");
		expect(result).toHaveProperty("latencyMs");
		expect(result).toHaveProperty("finishReason", "stop");
		expect(result.cost).toHaveProperty("currency", "USD");
	});

	it("DATA QUALITY — stream result has correct shape", async () => {
		const ai = mockAI();
		const result = await ai.stream("test");
		expect(result).toHaveProperty("textStream");
		expect(result).toHaveProperty("text");
		expect(result).toHaveProperty("usage");
		expect(result).toHaveProperty("provider");
		expect(result).toHaveProperty("usedFallback", false);
	});

	it("DATA QUALITY — structured result has correct shape", async () => {
		const ai = mockAI();
		const result = await ai.structured("test", {} as Record<string, unknown>);
		expect(result).toHaveProperty("object");
		expect(result).toHaveProperty("model");
		expect(result).toHaveProperty("provider");
		expect(result).toHaveProperty("usage");
		expect(result).toHaveProperty("cost");
	});

	it("PATTERN — tracks calls with _tracker", async () => {
		const ai = mockAI();
		expect(ai._tracker.callCount).toBe(0);
		expect(ai._tracker.lastArgs).toBeNull();

		await ai.generate("prompt1");
		expect(ai._tracker.callCount).toBe(1);
		expect(ai._tracker.lastArgs).toEqual(["prompt1", undefined]);

		await ai.stream("prompt2", { system: "sys" });
		expect(ai._tracker.callCount).toBe(2);
		expect(ai._tracker.lastArgs).toEqual(["prompt2", { system: "sys" }]);
		expect(ai._tracker.allArgs).toHaveLength(2);
	});

	it("PATTERN — exposes provider and model", () => {
		const ai = mockAI({ provider: "groq", model: "llama-3" });
		expect(ai.provider).toBe("groq");
		expect(ai.model).toBe("llama-3");
	});

	it("ENVIRONMENT — defaults work with no config", async () => {
		const ai = mockAI();
		const result = await ai.generate("test");
		expect(result.text).toBe("Mock AI response.");
		expect(result.provider).toBe("mock");
		expect(result.model).toBe("mock-v1");
	});
});

// ─── mockMonitor ───────────────────────────────────────────────────────────

describe("mockMonitor", () => {
	it("CRASH — does not throw on creation with no args", () => {
		expect(() => mockMonitor()).not.toThrow();
	});

	it("BEHAVIOR — recordCost tracks entries", () => {
		const monitor = mockMonitor();
		monitor.recordCost({
			model: "gpt-4o",
			module: "ai",
			usage: { totalTokens: 100 },
			traceId: "trace-1",
		});
		expect(monitor.costs).toHaveLength(1);
		expect(monitor.costs[0].model).toBe("gpt-4o");
		expect(monitor.costs[0].timestamp).toBeInstanceOf(Date);
	});

	it("BEHAVIOR — flush resolves without error", async () => {
		const monitor = mockMonitor();
		await expect(monitor.flush()).resolves.toBeUndefined();
	});

	it("BEHAVIOR — shutdown resolves without error", async () => {
		const monitor = mockMonitor();
		await expect(monitor.shutdown()).resolves.toBeUndefined();
	});

	it("DATA QUALITY — exposes MonitorClient shape", () => {
		const monitor = mockMonitor();
		expect(monitor).toHaveProperty("enabled", false);
		expect(monitor).toHaveProperty("langfuse", null);
		expect(monitor).toHaveProperty("costs");
		expect(typeof monitor.recordCost).toBe("function");
		expect(typeof monitor.flush).toBe("function");
		expect(typeof monitor.shutdown).toBe("function");
	});

	it("PATTERN — tracks calls with _tracker", () => {
		const monitor = mockMonitor();
		monitor.recordCost({
			model: "gpt-4o",
			module: "ai",
			usage: { totalTokens: 50 },
			traceId: "t-1",
		});
		expect(monitor._tracker.callCount).toBe(1);
		expect(monitor._tracker.lastArgs).toBeDefined();
	});

	it("ENVIRONMENT — enabled can be configured", () => {
		const monitor = mockMonitor({ enabled: true });
		expect(monitor.enabled).toBe(true);
	});
});

// ─── mockKnowledge ─────────────────────────────────────────────────────────

describe("mockKnowledge", () => {
	it("CRASH — does not throw on creation with no args", () => {
		expect(() => mockKnowledge()).not.toThrow();
	});

	it("BEHAVIOR — ingest returns default result", async () => {
		const knowledge = mockKnowledge();
		const result = await knowledge.ingest("Some document text");
		expect(result.chunks).toBe(3);
		expect(result.embeddings).toBe(3);
	});

	it("BEHAVIOR — ingest returns custom result", async () => {
		const knowledge = mockKnowledge({
			ingestResult: { chunks: 10, embeddings: 10, metadata: { source: "pdf" } },
		});
		const result = await knowledge.ingest("doc");
		expect(result.chunks).toBe(10);
		expect(result.metadata).toEqual({ source: "pdf" });
	});

	it("BEHAVIOR — search returns default results", async () => {
		const knowledge = mockKnowledge();
		const results = await knowledge.search("query");
		expect(results).toHaveLength(1);
		expect(results[0].similarity).toBe(0.95);
	});

	it("BEHAVIOR — search returns custom results", async () => {
		const knowledge = mockKnowledge({
			searchResults: [
				{ chunk: { content: "a", metadata: {} }, similarity: 0.8 },
				{ chunk: { content: "b", metadata: {} }, similarity: 0.6 },
			],
		});
		const results = await knowledge.search("query");
		expect(results).toHaveLength(2);
	});

	it("DATA QUALITY — search result has correct shape", async () => {
		const knowledge = mockKnowledge();
		const [result] = await knowledge.search("query");
		expect(result).toHaveProperty("chunk");
		expect(result).toHaveProperty("similarity");
		expect(result.chunk).toHaveProperty("content");
		expect(result.chunk).toHaveProperty("metadata");
	});

	it("PATTERN — tracks calls with _tracker", async () => {
		const knowledge = mockKnowledge();
		await knowledge.ingest("doc1");
		await knowledge.search("query1");
		expect(knowledge._tracker.callCount).toBe(2);
		expect(knowledge._tracker.allArgs).toHaveLength(2);
	});
});

// ─── mockChain ─────────────────────────────────────────────────────────────

describe("mockChain", () => {
	it("CRASH — does not throw on creation with no args", () => {
		expect(() => mockChain()).not.toThrow();
	});

	it("BEHAVIOR — createChain returns invokable chain", async () => {
		const chain = mockChain({ invokeResult: "result!" });
		const c = chain.createChain({ name: "test", steps: [] });
		expect(c.name).toBe("test");
		const result = await c.invoke({ input: "data" });
		expect(result).toBe("result!");
	});

	it("BEHAVIOR — rag returns chain with answer and sources", async () => {
		const chain = mockChain({
			ragAnswer: "The answer is 42.",
			ragSources: [{ content: "doc", metadata: { page: 1 } }],
		});
		const ragChain = chain.rag({
			retriever: {},
			promptTemplate: "",
			model: () => "",
		});
		const result = await ragChain.invoke({ question: "What?" });
		expect(result.answer).toBe("The answer is 42.");
		expect(result.sources).toHaveLength(1);
	});

	it("BEHAVIOR — prompt returns template with format and formatMessages", async () => {
		const chain = mockChain({ promptOutput: "Formatted!" });
		const p = chain.prompt({ template: "Hello {name}" });
		expect(await p.format({ name: "Alice" })).toBe("Formatted!");
		const msgs = await p.formatMessages({ name: "Alice" });
		expect(msgs[0].role).toBe("human");
		expect(msgs[0].content).toBe("Formatted!");
	});

	it("BEHAVIOR — parse returns parser with parse and getFormatInstructions", async () => {
		const chain = mockChain({ parseResult: { name: "Alice" } });
		const parser = chain.parse({ schema: {} });
		const result = await parser.parse('{"name":"Alice"}');
		expect(result).toEqual({ name: "Alice" });
		expect(typeof parser.getFormatInstructions()).toBe("string");
	});

	it("DATA QUALITY — chain has name and length", () => {
		const chain = mockChain();
		const c = chain.createChain({
			name: "my-chain",
			steps: [() => {}, () => {}],
		});
		expect(c.name).toBe("my-chain");
		expect(c.length).toBe(2);
	});

	it("PATTERN — tracks all calls across functions", async () => {
		const chain = mockChain();
		chain.createChain({ name: "a", steps: [] });
		chain.rag({});
		chain.prompt({});
		chain.parse({});
		expect(chain._tracker.callCount).toBe(4);
		expect(chain._tracker.allArgs).toHaveLength(4);
	});

	it("ENVIRONMENT — defaults work with no config", async () => {
		const chain = mockChain();
		const c = chain.createChain({ steps: [] });
		expect(c.name).toBe("mock-chain");
		const result = await c.invoke({});
		expect(result).toBe("Mock chain output.");
	});
});

// ─── mockWorkflow ──────────────────────────────────────────────────────────

describe("mockWorkflow", () => {
	it("CRASH — does not throw on creation with no args", () => {
		expect(() => mockWorkflow()).not.toThrow();
	});

	it("BEHAVIOR — createWorkflow returns client with id", () => {
		const wf = mockWorkflow();
		const client = wf.createWorkflow({ id: "my-app" });
		expect(client.id).toBe("my-app");
		expect(client.inngestClient).toBeDefined();
	});

	it("BEHAVIOR — defineJob returns job config and inngestFn", () => {
		const wf = mockWorkflow();
		const client = wf.createWorkflow({ id: "app" });
		const job = wf.defineJob(
			client,
			{ id: "process", trigger: { event: "upload" } },
			() => {},
		);
		expect(job.config).toHaveProperty("id", "process");
		expect(job.inngestFn).toBeDefined();
	});

	it("BEHAVIOR — humanInTheLoop returns configured response", async () => {
		const wf = mockWorkflow({
			hitlResponse: { approved: true, reviewer: "alice" },
		});
		const result = await wf.humanInTheLoop(
			{},
			{ stepId: "approve", event: "approved", timeout: "7d" },
		);
		expect(result).toEqual({ approved: true, reviewer: "alice" });
	});

	it("BEHAVIOR — humanInTheLoop supports null (timeout)", async () => {
		const wf = mockWorkflow({ hitlResponse: null });
		const result = await wf.humanInTheLoop(
			{},
			{ stepId: "approve", event: "approved", timeout: "7d" },
		);
		expect(result).toBeNull();
	});

	it("BEHAVIOR — createMockStep.run executes handler", async () => {
		const wf = mockWorkflow();
		const step = wf.createMockStep();
		const result = await step.run("transform", () => 42);
		expect(result).toBe(42);
		expect(step._tracker.callCount).toBe(1);
	});

	it("BEHAVIOR — createMockStep.sleep resolves", async () => {
		const wf = mockWorkflow();
		const step = wf.createMockStep();
		await expect(step.sleep("wait", "1h")).resolves.toBeUndefined();
	});

	it("BEHAVIOR — createMockStep.waitForEvent returns hitlResponse", async () => {
		const wf = mockWorkflow({ hitlResponse: { status: "approved" } });
		const step = wf.createMockStep();
		const result = await step.waitForEvent("wait-approval", {
			event: "approved",
			timeout: "7d",
		});
		expect(result).toEqual({ status: "approved" });
	});

	it("BEHAVIOR — createMockStep.sendEvent resolves", async () => {
		const wf = mockWorkflow();
		const step = wf.createMockStep();
		await expect(
			step.sendEvent("notify", { name: "event", data: {} }),
		).resolves.toBeUndefined();
	});

	it("PATTERN — tracks calls with _tracker", () => {
		const wf = mockWorkflow();
		wf.createWorkflow({ id: "a" });
		wf.defineJob({}, {}, () => {});
		expect(wf._tracker.callCount).toBe(2);
	});

	it("ENVIRONMENT — defaults work with no config", () => {
		const wf = mockWorkflow();
		const client = wf.createWorkflow({});
		expect(client.id).toBe("mock-app");
	});
});

// ─── mockAgents ────────────────────────────────────────────────────────────

describe("mockAgents", () => {
	it("CRASH — does not throw on creation with no args", () => {
		expect(() => mockAgents()).not.toThrow();
	});

	it("BEHAVIOR — createAgent returns agent node with handler", async () => {
		const agents = mockAgents();
		const agent = agents.createAgent({
			name: "researcher",
			systemPrompt: "You research topics.",
		});
		expect(agent.name).toBe("researcher");
		expect(agent.systemPrompt).toBe("You research topics.");

		const state = await agent.handler({
			messages: [{ role: "user", content: "Hello" }],
		});
		expect(state.messages).toHaveLength(2);
		expect(state.messages[1].content).toBe("Response from researcher");
		expect(state.currentAgent).toBe("researcher");
	});

	it("BEHAVIOR — createGraph returns invokable graph", async () => {
		const agents = mockAgents();
		const agent = agents.createAgent({ name: "a", systemPrompt: "sys" });
		const graph = agents.createGraph({
			agents: [agent],
			edges: [{ from: "__start__", to: "a" }],
		});

		const result = await graph.invoke({ messages: [] });
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0].role).toBe("assistant");
	});

	it("BEHAVIOR — createGraph returns custom invokeResult", async () => {
		const agents = mockAgents({
			invokeResult: {
				messages: [
					{ role: "assistant", content: "Custom!" },
					{ role: "assistant", content: "Second!" },
				],
				currentAgent: "writer",
			},
		});
		const graph = agents.createGraph({ agents: [], edges: [] });
		const result = await graph.invoke({ messages: [] });
		expect(result.messages).toHaveLength(2);
		expect(result.currentAgent).toBe("writer");
	});

	it("BEHAVIOR — route returns RouteResult shape", () => {
		const agents = mockAgents();
		const condition = (state: Record<string, unknown>) =>
			state.needsMore ? "researcher" : "writer";
		const result = agents.route(condition, ["researcher", "writer"]);
		expect(result.__isRoute).toBe(true);
		expect(result.destinations).toEqual(["researcher", "writer"]);
		expect(typeof result.condition).toBe("function");
	});

	it("DATA QUALITY — agent node has correct shape", () => {
		const agents = mockAgents();
		const agent = agents.createAgent({
			name: "writer",
			systemPrompt: "Write well.",
			model: "gpt-4o",
			tools: [{ name: "search" }],
		});
		expect(agent).toHaveProperty("name", "writer");
		expect(agent).toHaveProperty("systemPrompt", "Write well.");
		expect(agent).toHaveProperty("model", "gpt-4o");
		expect(agent).toHaveProperty("tools");
		expect(typeof agent.handler).toBe("function");
	});

	it("DATA QUALITY — graph has compiledGraph property", () => {
		const agents = mockAgents();
		const graph = agents.createGraph({ agents: [], edges: [] });
		expect(graph).toHaveProperty("compiledGraph");
		expect(typeof graph.invoke).toBe("function");
	});

	it("PATTERN — tracks calls with _tracker", async () => {
		const agents = mockAgents();
		agents.createAgent({ name: "a", systemPrompt: "s" });
		agents.createGraph({ agents: [], edges: [] });
		agents.route(() => "a", ["a"]);
		expect(agents._tracker.callCount).toBe(3);
		expect(agents._tracker.allArgs).toHaveLength(3);
	});

	it("ENVIRONMENT — defaults work with no config", async () => {
		const agents = mockAgents();
		const graph = agents.createGraph({ agents: [], edges: [] });
		const result = await graph.invoke({ messages: [] });
		expect(result.messages[0].content).toBe("Mock agent response.");
		expect(result.currentAgent).toBe("mock-agent");
	});
});
