/**
 * Cross-module integration tests.
 *
 * These tests verify that toolkit modules compose correctly together,
 * using mock factories from the testing module. Zero external connections.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { rag } from "../chain/index.js";
import { chunk } from "../knowledge/index.js";
import { McpServerBuilder } from "../mcp/index.js";
import { getCostReport, trace } from "../monitor/monitor.js";
import { checkOutput, detectPII, sanitizeForLLM } from "../security/index.js";

import {
	mockAgents,
	mockAI,
	mockDatabase,
	mockKnowledge,
	mockMonitor,
	mockWorkflow,
} from "../testing/mocks.js";

// ─── 1. AI + Security Pipeline ──────────────────────────────────────────────

describe("AI + Security pipeline", () => {
	it("sanitizes PII before sending to AI, then validates output", async () => {
		const ai = mockAI({ text: "The patient should take medication daily." });
		const inputText = "Patient John Smith (SSN: 123-45-6789) needs treatment.";

		// Step 1: Sanitize input
		const sanitized = sanitizeForLLM(inputText);
		expect(sanitized).not.toContain("John Smith");
		expect(sanitized).not.toContain("123-45-6789");
		expect(sanitized).toContain("[REDACTED_NAME]");
		expect(sanitized).toContain("[REDACTED_SSN]");

		// Step 2: Generate with sanitized text
		const result = await ai.generate(sanitized);
		expect(ai._tracker.callCount).toBe(1);

		// Verify the prompt sent to AI contains no PII
		const sentPrompt = ai._tracker.lastArgs?.[0] as string;
		const piiInPrompt = detectPII(sentPrompt);
		expect(piiInPrompt).toHaveLength(0);

		// Step 3: Check output with guardrails
		const outputCheck = checkOutput(result.text, [
			{
				id: "no-pii-leak",
				description: "Output must not contain PII",
				test: (text) => detectPII(text).length > 0,
			},
			{
				id: "no-diagnosis",
				description: "Must not provide medical diagnosis",
				test: /you have been diagnosed/i,
			},
		]);

		expect(outputCheck.allowed).toBe(true);
		expect(outputCheck.violations).toHaveLength(0);
	});

	it("guardrails block dangerous AI output", async () => {
		const ai = mockAI({
			text: "You have been diagnosed with a serious condition. Your SSN 123-45-6789 is on file.",
		});

		const result = await ai.generate("medical query");

		const outputCheck = checkOutput(result.text, [
			{
				id: "no-pii-leak",
				description: "Output must not contain PII",
				test: (text) => detectPII(text).length > 0,
			},
			{
				id: "no-diagnosis",
				description: "Must not provide medical diagnosis",
				test: /you have been diagnosed/i,
			},
		]);

		expect(outputCheck.allowed).toBe(false);
		expect(outputCheck.violations).toContain("no-pii-leak");
		expect(outputCheck.violations).toContain("no-diagnosis");
		expect(outputCheck.reasons).toHaveLength(2);
	});
});

// ─── 2. Knowledge + Database + AI Pipeline ──────────────────────────────────

describe("Knowledge + Database + AI pipeline", () => {
	it("chunks text, embeds via mock AI, stores in mock DB, and searches", async () => {
		const ai = mockAI({ text: "Relevant answer based on context." });
		const db = mockDatabase([
			{ id: 1, content: "chunk about AI safety", similarity: 0.92 },
			{ id: 2, content: "chunk about AI ethics", similarity: 0.87 },
		]);

		const sourceText =
			"Artificial intelligence safety is a critical field of study. " +
			"AI ethics involves fairness, transparency, and accountability in machine learning. " +
			"Researchers study alignment to ensure AI systems act as intended by their designers. " +
			"Robustness testing verifies that models behave correctly under adversarial conditions. " +
			"Interpretability research aims to make AI decision-making transparent and understandable.";

		// Step 1: Chunk the text
		const chunks = await chunk(sourceText, { chunkSize: 100, chunkOverlap: 10 });
		expect(chunks.length).toBeGreaterThan(1);

		for (const c of chunks) {
			expect(c.content.length).toBeGreaterThan(0);
			expect(c.metadata).toHaveProperty("chunkIndex");
		}

		// Step 2: Embed each chunk via mock AI
		const embeddings: number[][] = [];
		for (const c of chunks) {
			await ai.generate(c.content);
			// Simulate embedding as a fixed vector
			embeddings.push([0.1, 0.2, 0.3]);
		}
		expect(ai._tracker.callCount).toBe(chunks.length);

		// Step 3: Store in mock database
		for (let i = 0; i < chunks.length; i++) {
			await db.query(
				"INSERT INTO documents (content, embedding) VALUES ($1, $2)",
				[chunks[i].content, embeddings[i]],
			);
		}
		expect(db._queries).toHaveLength(chunks.length);

		// Step 4: Search via mock database
		const searchResults = await db.query(
			"SELECT content, 1 - (embedding <=> $1) as similarity FROM documents ORDER BY similarity DESC LIMIT $2",
			[[0.1, 0.2, 0.3], 5],
		);

		expect(searchResults.length).toBeGreaterThan(0);
		expect(searchResults[0]).toHaveProperty("content");
		expect(searchResults[0]).toHaveProperty("similarity");
	});

	it("full ingest pipeline produces searchable results via mockKnowledge", async () => {
		const knowledge = mockKnowledge({
			ingestResult: { chunks: 5, embeddings: 5, metadata: { source: "test.pdf" } },
			searchResults: [
				{ chunk: { content: "AI safety overview", metadata: { page: 1 } }, similarity: 0.95 },
				{ chunk: { content: "Alignment research", metadata: { page: 3 } }, similarity: 0.88 },
			],
		});

		// Ingest
		const ingestResult = await knowledge.ingest("full document text here");
		expect(ingestResult.chunks).toBe(5);
		expect(ingestResult.embeddings).toBe(5);

		// Search
		const results = await knowledge.search("what is AI safety?");
		expect(results).toHaveLength(2);
		expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
		expect(results[0].chunk.content).toBe("AI safety overview");

		expect(knowledge._tracker.callCount).toBe(2);
	});
});

// ─── 3. Chain + AI + Knowledge Pipeline (RAG) ──────────────────────────────

describe("Chain + AI + Knowledge pipeline", () => {
	it("RAG chain retrieves context, builds prompt, and generates answer with sources", async () => {
		const docs = [
			{ content: "RAG combines retrieval with generation for grounded answers.", metadata: { source: "paper.pdf", page: 1 } },
			{ content: "Vector databases enable semantic search over embeddings.", metadata: { source: "docs.md", page: 5 } },
		];

		const modelCalls: string[] = [];

		const ragChain = rag({
			retriever: {
				retrieve: async (query: string) => {
					expect(query).toBe("What is RAG?");
					return docs;
				},
			},
			promptTemplate: "Context:\n{context}\n\nQuestion: {question}\n\nAnswer:",
			model: async (prompt: string) => {
				modelCalls.push(prompt);
				return "RAG is Retrieval-Augmented Generation.";
			},
		});

		const result = await ragChain.invoke({ question: "What is RAG?" });

		// Verify answer
		expect(result.answer).toBe("RAG is Retrieval-Augmented Generation.");

		// Verify sources are passed through
		expect(result.sources).toHaveLength(2);
		expect(result.sources[0].metadata.source).toBe("paper.pdf");
		expect(result.sources[1].metadata.source).toBe("docs.md");

		// Verify retrieved context appears in the prompt sent to model
		expect(modelCalls).toHaveLength(1);
		expect(modelCalls[0]).toContain("RAG combines retrieval with generation");
		expect(modelCalls[0]).toContain("Vector databases enable semantic search");
		expect(modelCalls[0]).toContain("What is RAG?");
	});

	it("RAG chain with mockKnowledge retriever", async () => {
		const knowledge = mockKnowledge({
			searchResults: [
				{ chunk: { content: "TypeScript is a typed superset of JavaScript.", metadata: { source: "ts-docs" } }, similarity: 0.96 },
			],
		});

		const ragChain = rag({
			retriever: {
				retrieve: async (query: string) => {
					const results = await knowledge.search(query);
					return results.map((r) => ({
						content: r.chunk.content,
						metadata: r.chunk.metadata,
					}));
				},
			},
			promptTemplate: "Context:\n{context}\n\nQuestion: {question}\n\nAnswer:",
			model: async (prompt: string) => {
				expect(prompt).toContain("TypeScript is a typed superset");
				return "TypeScript adds static types to JavaScript.";
			},
		});

		const result = await ragChain.invoke({ question: "What is TypeScript?" });
		expect(result.answer).toContain("TypeScript");
		expect(result.sources).toHaveLength(1);
		expect(knowledge._tracker.callCount).toBe(1);
	});
});

// ─── 4. Workflow + AI Pipeline ──────────────────────────────────────────────

describe("Workflow + AI pipeline", () => {
	it("defineJob with aiStep — mock step.run executes AI with correct params", async () => {
		const wf = mockWorkflow();
		const client = wf.createWorkflow({ id: "summarizer-app" });
		expect(client.id).toBe("summarizer-app");

		const step = wf.createMockStep();
		const aiCalls: Array<{ stepId: string; prompt: string }> = [];

		// Simulate what a job handler would do with aiStep-like logic
		const result = await step.run("generate-summary", async () => {
			const prompt = "Summarize this document about AI safety.";
			aiCalls.push({ stepId: "generate-summary", prompt });

			const ai = mockAI({ text: "AI safety ensures systems act as intended." });
			const genResult = await ai.generate(prompt);
			return {
				text: genResult.text,
				usedFallback: false,
				cost: genResult.cost.totalCost,
			};
		});

		expect(result.text).toBe("AI safety ensures systems act as intended.");
		expect(result.usedFallback).toBe(false);
		expect(aiCalls).toHaveLength(1);
		expect(aiCalls[0].prompt).toContain("AI safety");
		expect(step._tracker.callCount).toBe(1);
	});

	it("humanInTheLoop — mock approval continues workflow", async () => {
		const wf = mockWorkflow({ hitlResponse: { approved: true, reviewer: "alice" } });
		const step = wf.createMockStep();

		// Simulate workflow that waits for approval
		const approval = await step.waitForEvent("wait-approval", {
			event: "app/request.approved",
			timeout: "7d",
		});

		expect(approval).not.toBeNull();
		expect(approval?.approved).toBe(true);
		expect(approval?.reviewer).toBe("alice");

		// Continue workflow after approval
		const result = await step.run("process-after-approval", async () => {
			return { status: "processed", approvedBy: approval?.reviewer };
		});

		expect(result.status).toBe("processed");
		expect(result.approvedBy).toBe("alice");
		expect(step._tracker.callCount).toBe(2);
	});

	it("humanInTheLoop — timeout returns null and workflow handles gracefully", async () => {
		const wf = mockWorkflow({ hitlResponse: null });
		const step = wf.createMockStep();

		const approval = await step.waitForEvent("wait-approval", {
			event: "app/request.approved",
			timeout: "1d",
		});

		expect(approval).toBeNull();

		// Workflow falls back on timeout
		const result = await step.run("handle-timeout", async () => {
			if (!approval) {
				return { status: "timed_out" };
			}
			return { status: "approved" };
		});

		expect(result.status).toBe("timed_out");
	});
});

// ─── 5. Agents + AI Pipeline ────────────────────────────────────────────────

describe("Agents + AI pipeline", () => {
	it("createGraph with 2 agents — both called, messages accumulate", async () => {
		const agents = mockAgents({
			invokeResult: {
				messages: [
					{ role: "user", content: "Write about AI" },
					{ role: "assistant", content: "Response from researcher" },
					{ role: "assistant", content: "Response from writer" },
				],
				currentAgent: "writer",
				metadata: { lastAgent: "writer" },
			},
		});

		const researcher = agents.createAgent({
			name: "researcher",
			systemPrompt: "You research topics thoroughly.",
		});
		const writer = agents.createAgent({
			name: "writer",
			systemPrompt: "You write clear, concise content.",
		});

		expect(researcher.name).toBe("researcher");
		expect(writer.name).toBe("writer");

		const graph = agents.createGraph({
			agents: [researcher, writer],
			edges: [
				{ from: "__start__", to: "researcher" },
				{ from: "researcher", to: "writer" },
				{ from: "writer", to: "__end__" },
			],
		});

		const result = await graph.invoke({
			messages: [{ role: "user", content: "Write about AI" }],
		});

		// Verify both agents contributed messages
		expect(result.messages).toHaveLength(3);
		expect(result.messages[0].content).toBe("Write about AI");
		expect(result.messages[1].content).toBe("Response from researcher");
		expect(result.messages[2].content).toBe("Response from writer");
		expect(result.currentAgent).toBe("writer");

		// createAgent x2 + createGraph + invoke = 4 calls
		expect(agents._tracker.callCount).toBe(4);
	});

	it("routing condition directs to correct agent", async () => {
		const agents = mockAgents();

		const routeResult = agents.route(
			(state) => {
				const lastMessage = state.messages?.[state.messages.length - 1];
				if (lastMessage && typeof lastMessage === "object" && "content" in lastMessage) {
					return (lastMessage as { content: string }).content.includes("research")
						? "researcher"
						: "writer";
				}
				return "researcher";
			},
			["researcher", "writer"],
		);

		expect(routeResult.__isRoute).toBe(true);
		expect(routeResult.destinations).toEqual(["researcher", "writer"]);

		// Test the condition function
		const researchResult = await routeResult.condition({
			messages: [{ role: "user", content: "I need research on AI" }],
		});
		expect(researchResult).toBe("researcher");

		const writeResult = await routeResult.condition({
			messages: [{ role: "user", content: "Write me an article" }],
		});
		expect(writeResult).toBe("writer");
	});

	it("agent handler accumulates messages correctly", async () => {
		const agents = mockAgents();
		const agent = agents.createAgent({
			name: "helper",
			systemPrompt: "You are a helpful assistant.",
		});

		// Test the actual handler on the mock agent
		const state = {
			messages: [{ role: "user" as const, content: "Hello" }],
			currentAgent: undefined,
			metadata: {},
		};

		const result = await agent.handler(state);
		expect(result.messages).toHaveLength(2);
		expect(result.messages[0].role).toBe("user");
		expect(result.messages[0].content).toBe("Hello");
		expect(result.messages[1].role).toBe("assistant");
		expect(result.messages[1].content).toBe("Response from helper");
		expect(result.currentAgent).toBe("helper");
	});
});

// ─── 6. Monitor + AI Pipeline ──────────────────────────────────────────────

describe("Monitor + AI pipeline", () => {
	it("trace wraps AI generate and records cost", async () => {
		const monitor = mockMonitor();
		const ai = mockAI({ text: "The answer is 42." });

		const { result, traceId } = await trace(monitor, "ai/generate", async (span) => {
			span.update({ input: "What is the answer?", model: "gpt-4o" });
			const genResult = await ai.generate("What is the answer?");
			span.update({
				output: genResult.text,
				usage: {
					promptTokens: genResult.usage.inputTokens,
					completionTokens: genResult.usage.outputTokens,
					totalTokens: genResult.usage.totalTokens,
				},
				model: "gpt-4o",
			});
			return genResult;
		});

		expect(result.text).toBe("The answer is 42.");
		expect(traceId).toBeDefined();
		expect(typeof traceId).toBe("string");
		expect(ai._tracker.callCount).toBe(1);

		// Verify cost was recorded (trace records cost when attrs have model + usage)
		expect(monitor.costs).toHaveLength(1);
		expect(monitor.costs[0].model).toBe("gpt-4o");
		expect(monitor.costs[0].module).toBe("ai");
		expect(monitor.costs[0].traceId).toBe(traceId);
	});

	it("getCostReport aggregates multiple trace calls", async () => {
		const monitor = mockMonitor();

		// Simulate multiple AI operations being traced
		await trace(monitor, "ai/generate", async (span) => {
			span.update({
				model: "gpt-4o",
				usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
			});
			return "result 1";
		});

		await trace(monitor, "ai/generate", async (span) => {
			span.update({
				model: "gpt-4o",
				usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
			});
			return "result 2";
		});

		await trace(monitor, "chain/rag", async (span) => {
			span.update({
				model: "gpt-3.5-turbo",
				usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
			});
			return "result 3";
		});

		const report = getCostReport(monitor);

		expect(report.totalOperations).toBe(3);
		expect(report.totalTokens).toBe(525); // 150 + 300 + 75

		// By model breakdown
		expect(report.byModel["gpt-4o"]).toBeDefined();
		expect(report.byModel["gpt-4o"].operations).toBe(2);
		expect(report.byModel["gpt-4o"].totalTokens).toBe(450);

		expect(report.byModel["gpt-3.5-turbo"]).toBeDefined();
		expect(report.byModel["gpt-3.5-turbo"].operations).toBe(1);
		expect(report.byModel["gpt-3.5-turbo"].totalTokens).toBe(75);

		// By module breakdown
		expect(report.byModule.ai).toBeDefined();
		expect(report.byModule.ai.operations).toBe(2);
		expect(report.byModule.chain).toBeDefined();
		expect(report.byModule.chain.operations).toBe(1);

		// Time range
		expect(report.timeRange).not.toBeNull();
		expect(report.timeRange?.from).toBeInstanceOf(Date);
		expect(report.timeRange?.to).toBeInstanceOf(Date);
	});
});

// ─── 7. MCP + Knowledge Pipeline ───────────────────────────────────────────

describe("MCP + Knowledge pipeline", () => {
	it("MCP server exposes knowledge search as a tool", async () => {
		const knowledge = mockKnowledge({
			searchResults: [
				{ chunk: { content: "AI safety is about alignment.", metadata: { source: "paper.pdf" } }, similarity: 0.95 },
				{ chunk: { content: "Robustness testing is essential.", metadata: { source: "guide.md" } }, similarity: 0.82 },
			],
		});

		const builder = new McpServerBuilder({
			name: "knowledge-server",
			version: "1.0.0",
		});

		builder.defineTool({
			name: "search_knowledge",
			description: "Search the knowledge base",
			schema: { query: z.string(), limit: z.number().default(5) },
			handler: async (params) => {
				const results = await knowledge.search(params.query as string);
				return results.map((r) => ({
					content: r.chunk.content,
					source: r.chunk.metadata.source,
					similarity: r.similarity,
				}));
			},
		});

		expect(builder.toolNames).toContain("search_knowledge");

		// Test via harness
		const harness = builder.createTestHarness();
		const response = await harness.callTool("search_knowledge", {
			query: "AI safety",
			limit: 5,
		});

		expect(response.isError).toBeUndefined();
		expect(response.content).toHaveLength(1);
		expect(response.content[0].type).toBe("text");

		const text = response.content[0].text;
		expect(text).toBeDefined();
		const parsed = JSON.parse(text as string);
		expect(parsed).toHaveLength(2);
		expect(parsed[0].content).toBe("AI safety is about alignment.");
		expect(parsed[0].source).toBe("paper.pdf");
		expect(parsed[0].similarity).toBe(0.95);
		expect(parsed[1].content).toBe("Robustness testing is essential.");

		expect(knowledge._tracker.callCount).toBe(1);
	});

	it("MCP tool handles knowledge search errors gracefully", async () => {
		const builder = new McpServerBuilder({
			name: "error-server",
			version: "1.0.0",
		});

		builder.defineTool({
			name: "search_knowledge",
			description: "Search the knowledge base",
			schema: { query: z.string() },
			handler: async () => {
				throw new Error("Vector store unavailable");
			},
		});

		const harness = builder.createTestHarness();
		const response = await harness.callTool("search_knowledge", {
			query: "test",
		});

		expect(response.isError).toBe(true);
		expect(response.content[0].text).toContain("Vector store unavailable");
	});
});
