/**
 * Testing utilities — mock factories for unit tests.
 *
 * Provides mock implementations of toolkit interfaces so
 * you can test without real LLMs, Redis, databases, etc.
 *
 * @example
 * ```ts
 * import { mockCache, mockLLM, mockDb, mockAI, mockMonitor } from '@jamaalbuilds/ai-toolkit/testing';
 *
 * test('processes query', async () => {
 *   const cache = mockCache();
 *   const ai = mockAI({ text: 'Metformin is recommended.' });
 *   const db = mockDb([{ id: 1, content: 'Metformin treats diabetes.' }]);
 *
 *   const result = await processQuery('treatment for diabetes', { cache, ai, db });
 *   expect(result).toContain('Metformin');
 *   expect(ai._tracker.callCount).toBe(1);
 * });
 * ```
 */

import type { CacheClient, CacheOptions } from "../cache/client.js";
import type { DatabaseClient } from "../database/types.js";
import { LLMError } from "../errors/types.js";

/** @deprecated Use DatabaseClient instead */
type DbClient = {
	query<T = Record<string, unknown>>(
		sql: string,
		params?: unknown[],
	): Promise<T[]>;
	queryOne<T = Record<string, unknown>>(
		sql: string,
		params?: unknown[],
	): Promise<T | null>;
	end(): Promise<void>;
};

// ─── Mock Cache ─────────────────────────────────────────────────────────────

/**
 * In-memory mock cache for testing.
 * Tracks all calls for assertions.
 *
 * @example
 * ```ts
 * import { mockCache } from '@jamaalbuilds/ai-toolkit/testing';
 *
 * const cache = mockCache({ user: 'Alice' });
 * const val = await cache.get('user');
 * expect(val).toBe('Alice');
 * expect(cache._calls).toHaveLength(1);
 * ```
 */
export function mockCache(initial?: Record<string, unknown>): CacheClient & {
	_store: Map<string, unknown>;
	_calls: Array<{ method: string; args: unknown[] }>;
} {
	const store = new Map<string, unknown>(Object.entries(initial ?? {}));
	const calls: Array<{ method: string; args: unknown[] }> = [];

	return {
		_store: store,
		_calls: calls,

		async get<T = unknown>(key: string): Promise<T | null> {
			calls.push({ method: "get", args: [key] });
			return (store.get(key) as T) ?? null;
		},

		async set<T = unknown>(
			key: string,
			value: T,
			options?: CacheOptions,
		): Promise<void> {
			calls.push({ method: "set", args: [key, value, options] });
			store.set(key, value);
		},

		async invalidate(key: string): Promise<void> {
			calls.push({ method: "invalidate", args: [key] });
			store.delete(key);
		},

		async invalidatePrefix(prefix: string): Promise<void> {
			calls.push({ method: "invalidatePrefix", args: [prefix] });
			for (const key of store.keys()) {
				if (key.startsWith(prefix)) store.delete(key);
			}
		},

		async disconnect(): Promise<void> {
			calls.push({ method: "disconnect", args: [] });
			store.clear();
		},
	};
}

// ─── Mock LLM ───────────────────────────────────────────────────────────────

export interface MockLLMOptions {
	/** Fixed response to return for every call */
	response?: string;
	/** Sequence of responses — cycles through them */
	responses?: string[];
	/** Simulate latency in ms. Default: 0 */
	latencyMs?: number;
	/** Throw this error on the Nth call (0-indexed) */
	failOnCall?: number;
}

export interface MockLLMResult {
	complete(
		prompt: string,
		options?: { system?: string },
	): Promise<{
		content: string;
		model: string;
		provider: string;
		inputTokens: number;
		outputTokens: number;
		cost: number;
		latencyMs: number;
	}>;
	_calls: Array<{ prompt: string; system?: string }>;
	_callCount: number;
}

export function mockLLM(options?: MockLLMOptions): MockLLMResult {
	const responses = options?.responses ?? [
		options?.response ?? "Mock LLM response.",
	];
	const latency = options?.latencyMs ?? 0;
	let callCount = 0;
	const calls: Array<{ prompt: string; system?: string }> = [];

	return {
		_calls: calls,
		get _callCount() {
			return callCount;
		},

		async complete(prompt: string, opts?: { system?: string }) {
			calls.push({ prompt, system: opts?.system });

			if (options?.failOnCall === callCount) {
				callCount++;
				throw new LLMError(`Mock LLM failure on call ${callCount - 1}`, {
					provider: "mock",
					code: "LLM_MOCK_FAILURE",
				});
			}

			if (latency > 0) {
				await new Promise((r) => setTimeout(r, latency));
			}

			const content = responses[callCount % responses.length];
			callCount++;

			return {
				content,
				model: "mock-v1",
				provider: "mock",
				inputTokens: prompt.length,
				outputTokens: content.length,
				cost: 0.001,
				latencyMs: latency,
			};
		},
	};
}

// ─── Mock Database ──────────────────────────────────────────────────────────

/**
 * Mock database client for testing.
 * Returns provided rows for any query.
 *
 * @example
 * ```ts
 * import { mockDb } from '@jamaalbuilds/ai-toolkit/testing';
 *
 * const db = mockDb([{ id: 1, name: 'Alice' }]);
 * const rows = await db.query('SELECT * FROM users');
 * expect(rows).toEqual([{ id: 1, name: 'Alice' }]);
 * expect(db._queries).toHaveLength(1);
 * ```
 */
export function mockDb(
	rows?: Record<string, unknown>[],
): DbClient & { _queries: Array<{ sql: string; params?: unknown[] }> } {
	const queries: Array<{ sql: string; params?: unknown[] }> = [];
	const defaultRows = rows ?? [];

	return {
		_queries: queries,

		async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
			queries.push({ sql, params });
			return defaultRows as T[];
		},

		async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
			queries.push({ sql, params });
			return (defaultRows[0] as T) ?? null;
		},

		async end(): Promise<void> {},
	};
}

// ─── Mock Database (v5) ────────────────────────────────────────────────────

/**
 * Mock database client for testing (v5 DatabaseClient interface).
 * Returns provided rows for any query.
 *
 * @example
 * ```ts
 * import { mockDatabase } from '@jamaalbuilds/ai-toolkit/testing';
 *
 * const db = mockDatabase([{ id: 1, content: 'test' }]);
 * const rows = await db.query('SELECT * FROM docs');
 * expect(db._queries).toHaveLength(1);
 * ```
 */
export function mockDatabase(
	rows?: Record<string, unknown>[],
): DatabaseClient & { _queries: Array<{ sql: string; params?: unknown[] }> } {
	const queries: Array<{ sql: string; params?: unknown[] }> = [];
	const defaultRows = rows ?? [];

	return {
		db: {},
		provider: "local",
		driver: "postgres-js",
		_queries: queries,

		async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
			queries.push({ sql, params });
			return defaultRows as T[];
		},

		async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
			queries.push({ sql, params });
			return (defaultRows[0] as T) ?? null;
		},

		async withTenant<T>(
			orgId: string,
			sql: string,
			params?: unknown[],
		): Promise<T[]> {
			const allParams = [...(params ?? []), orgId];
			const paramIndex = allParams.length;
			const upperSql = sql.toUpperCase();
			const separator = upperSql.includes("WHERE") ? " AND" : " WHERE";
			const scopedSql = `${sql}${separator} org_id = $${paramIndex}`;
			queries.push({ sql: scopedSql, params: allParams });
			return defaultRows as T[];
		},

		async end(): Promise<void> {},
	};
}

// ─── Call Tracker ──────────────────────────────────────────────────────────

/** Call tracking data attached to every mock. */
export interface CallTracker {
	/** Total number of calls. */
	callCount: number;
	/** Arguments from the most recent call. */
	lastArgs: unknown[] | null;
	/** Arguments from all calls in order. */
	allArgs: unknown[][];
}

function createTracker(): CallTracker {
	return { callCount: 0, lastArgs: null, allArgs: [] };
}

function recordCall(tracker: CallTracker, args: unknown[]): void {
	tracker.callCount++;
	tracker.lastArgs = args;
	tracker.allArgs.push(args);
}

// ─── Mock AI ──────────────────────────────────────────────────────────────

/** Options for configuring mockAI(). */
export interface MockAIOptions {
	/** Fixed text response for generate(). Default: "Mock AI response." */
	text?: string;
	/** Sequence of text responses — cycles through them. */
	texts?: string[];
	/** Fixed object for structured(). Default: {} */
	structuredResult?: unknown;
	/** Stream chunks for stream(). Default: ["Mock ", "stream ", "response."] */
	streamChunks?: string[];
	/** Provider name. Default: "mock" */
	provider?: string;
	/** Model name. Default: "mock-v1" */
	model?: string;
}

/** Return type of mockAI() — AIClient with call tracking. */
export interface MockAIClient {
	_tracker: CallTracker;
	provider: string;
	model: string;
	generate(
		prompt: string,
		opts?: Record<string, unknown>,
	): Promise<{
		text: string;
		model: string;
		provider: string;
		usedFallback: boolean;
		usage: { inputTokens: number; outputTokens: number; totalTokens: number };
		cost: {
			inputCost: number;
			outputCost: number;
			totalCost: number;
			currency: "USD";
		};
		latencyMs: number;
		finishReason: string;
	}>;
	stream(
		prompt: string,
		opts?: Record<string, unknown>,
	): Promise<{
		textStream: AsyncIterable<string>;
		text: Promise<string>;
		usage: Promise<{
			inputTokens: number;
			outputTokens: number;
			totalTokens: number;
		}>;
		provider: string;
		usedFallback: boolean;
	}>;
	structured(
		prompt: string,
		opts?: Record<string, unknown>,
	): Promise<{
		object: unknown;
		model: string;
		provider: string;
		usedFallback: boolean;
		usage: { inputTokens: number; outputTokens: number; totalTokens: number };
		cost: {
			inputCost: number;
			outputCost: number;
			totalCost: number;
			currency: "USD";
		};
		latencyMs: number;
	}>;
}

/**
 * Mock AI client for testing (matches AIClient interface).
 * Tracks all calls for assertions. Requires zero real dependencies.
 *
 * @example
 * ```ts
 * import { mockAI } from '@jamaalbuilds/ai-toolkit/testing';
 *
 * const ai = mockAI({ text: 'Hello!' });
 * const result = await ai.generate('test prompt');
 * expect(result.text).toBe('Hello!');
 * expect(ai._tracker.callCount).toBe(1);
 * ```
 */
export function mockAI(options?: MockAIOptions): MockAIClient {
	const texts = options?.texts ?? [options?.text ?? "Mock AI response."];
	const streamChunks = options?.streamChunks ?? [
		"Mock ",
		"stream ",
		"response.",
	];
	const structuredResult = options?.structuredResult ?? {};
	const provider = options?.provider ?? "mock";
	const model = options?.model ?? "mock-v1";
	const tracker = createTracker();

	const defaultUsage = {
		inputTokens: 10,
		outputTokens: 20,
		totalTokens: 30,
	};

	const defaultCost = {
		inputCost: 0,
		outputCost: 0,
		totalCost: 0,
		currency: "USD" as const,
	};

	return {
		_tracker: tracker,
		provider,
		model,

		async generate(prompt: string, opts?: Record<string, unknown>) {
			recordCall(tracker, [prompt, opts]);
			const text = texts[(tracker.callCount - 1) % texts.length];
			return {
				text,
				model,
				provider,
				usedFallback: false,
				usage: { ...defaultUsage },
				cost: { ...defaultCost },
				latencyMs: 0,
				finishReason: "stop",
			};
		},

		async stream(prompt: string, opts?: Record<string, unknown>) {
			recordCall(tracker, [prompt, opts]);
			const chunks = [...streamChunks];
			const fullText = chunks.join("");

			async function* makeStream() {
				for (const chunk of chunks) {
					yield chunk;
				}
			}

			return {
				textStream: makeStream(),
				text: Promise.resolve(fullText),
				usage: Promise.resolve({ ...defaultUsage }),
				provider,
				usedFallback: false,
			};
		},

		async structured(prompt: string, opts?: Record<string, unknown>) {
			recordCall(tracker, [prompt, opts]);
			return {
				object: structuredResult,
				model,
				provider,
				usedFallback: false,
				usage: { ...defaultUsage },
				cost: { ...defaultCost },
				latencyMs: 0,
			};
		},
	};
}

// ─── Mock Monitor ──────────────────────────────────────────────────────────

/** Options for configuring mockMonitor(). */
export interface MockMonitorOptions {
	/** Whether monitor is enabled. Default: false */
	enabled?: boolean;
}

/**
 * Mock monitor client for testing (matches MonitorClient interface).
 * Tracks cost entries and provides trace/evaluate/getCostReport helpers.
 *
 * @example
 * ```ts
 * import { mockMonitor } from '@jamaalbuilds/ai-toolkit/testing';
 *
 * const monitor = mockMonitor();
 * monitor.recordCost({ model: 'gpt-4o', module: 'ai', usage: { totalTokens: 100 }, traceId: 'trace-1' });
 * expect(monitor.costs).toHaveLength(1);
 * expect(monitor._tracker.callCount).toBe(1);
 * ```
 */
export function mockMonitor(options?: MockMonitorOptions) {
	const enabled = options?.enabled ?? false;
	const costs: Array<{
		timestamp: Date;
		model: string;
		module: string;
		usage: {
			promptTokens?: number;
			completionTokens?: number;
			totalTokens?: number;
		};
		estimatedCostUsd?: number;
		traceId: string;
	}> = [];
	const tracker = createTracker();

	const traces: Array<{
		traceId: string;
		name: string;
		startedAt: Date;
		durationMs: number;
		attributes: Record<string, unknown>;
		error: boolean;
		errorMessage?: string;
	}> = [];
	const onTraceCallbacks: Array<(trace: unknown) => void> = [];

	return {
		_tracker: tracker,
		enabled,
		langfuse: null,
		costs,
		traces,
		onTraceCallbacks,
		maxTraces: 1000,

		recordCost(entry: {
			model: string;
			module: string;
			usage: {
				promptTokens?: number;
				completionTokens?: number;
				totalTokens?: number;
			};
			estimatedCostUsd?: number;
			traceId: string;
		}): void {
			recordCall(tracker, [entry]);
			costs.push({ ...entry, timestamp: new Date() });
		},

		async flush(): Promise<void> {
			recordCall(tracker, []);
		},

		async shutdown(): Promise<void> {
			recordCall(tracker, []);
		},
	};
}

// ─── Mock Knowledge ────────────────────────────────────────────────────────

/** Options for configuring mockKnowledge(). */
export interface MockKnowledgeOptions {
	/** Custom ingest result. Default: { chunks: 3, embeddings: 3, metadata: {} } */
	ingestResult?: {
		chunks: number;
		embeddings: number;
		metadata: Record<string, unknown>;
	};
	/** Custom search results. Default: one result with similarity 0.95 */
	searchResults?: Array<{
		chunk: {
			content: string;
			metadata: Record<string, unknown>;
			embedding?: number[];
		};
		similarity: number;
	}>;
}

/**
 * Mock knowledge client for testing (matches KnowledgeClient interface).
 * Returns configurable results for ingest and search operations.
 *
 * @example
 * ```ts
 * import { mockKnowledge } from '@jamaalbuilds/ai-toolkit/testing';
 *
 * const knowledge = mockKnowledge({
 *   searchResults: [{ chunk: { content: 'result', metadata: {} }, similarity: 0.9 }],
 * });
 * const results = await knowledge.search('query');
 * expect(results).toHaveLength(1);
 * expect(knowledge._tracker.callCount).toBe(1);
 * ```
 */
export function mockKnowledge(options?: MockKnowledgeOptions) {
	const defaultIngestResult = options?.ingestResult ?? {
		chunks: 3,
		embeddings: 3,
		metadata: {},
	};

	const defaultSearchResults = options?.searchResults ?? [
		{
			chunk: {
				content: "Mock search result content.",
				metadata: { source: "mock" },
			},
			similarity: 0.95,
		},
	];

	const tracker = createTracker();

	return {
		_tracker: tracker,

		async ingest(
			input: string | Buffer | Uint8Array,
			opts?: Record<string, unknown>,
		) {
			recordCall(tracker, [input, opts]);
			return { ...defaultIngestResult };
		},

		async search(query: string, opts?: Record<string, unknown>) {
			recordCall(tracker, [query, opts]);
			return [...defaultSearchResults];
		},
	};
}

// ─── Mock Chain ────────────────────────────────────────────────────────────

/** Options for configuring mockChain(). */
export interface MockChainOptions {
	/** Custom chain invoke result. Default: "Mock chain output." */
	invokeResult?: unknown;
	/** Custom RAG answer. Default: "Mock RAG answer." */
	ragAnswer?: string;
	/** Custom RAG sources. Default: one document. */
	ragSources?: Array<{ content: string; metadata: Record<string, unknown> }>;
	/** Custom parse result. Default: {} */
	parseResult?: unknown;
	/** Custom prompt format output. Default: "Mock formatted prompt." */
	promptOutput?: string;
}

/**
 * Mock chain functions for testing (matches chain module exports).
 * Returns mock implementations of createChain, rag, prompt, and parse.
 *
 * @example
 * ```ts
 * import { mockChain } from '@jamaalbuilds/ai-toolkit/testing';
 *
 * const chain = mockChain({ invokeResult: { answer: 42 } });
 * const c = chain.createChain({ name: 'test', steps: [] });
 * const result = await c.invoke({ input: 'data' });
 * expect(result).toEqual({ answer: 42 });
 * expect(chain._tracker.callCount).toBe(2);
 * ```
 */
export function mockChain(options?: MockChainOptions) {
	const invokeResult = options?.invokeResult ?? "Mock chain output.";
	const ragAnswer = options?.ragAnswer ?? "Mock RAG answer.";
	const ragSources = options?.ragSources ?? [
		{ content: "Mock source document.", metadata: { source: "mock" } },
	];
	const parseResult = options?.parseResult ?? {};
	const promptOutput = options?.promptOutput ?? "Mock formatted prompt.";
	const tracker = createTracker();

	return {
		_tracker: tracker,

		createChain(config: { name?: string; steps?: unknown[] }) {
			recordCall(tracker, [config]);
			return {
				name: config.name ?? "mock-chain",
				length: config.steps?.length ?? 0,
				async invoke(input: unknown) {
					recordCall(tracker, [input]);
					return invokeResult;
				},
			};
		},

		rag(config: Record<string, unknown>) {
			recordCall(tracker, [config]);
			return {
				name: "mock-rag",
				length: 3,
				async invoke(input: { question: string } | Record<string, unknown>) {
					recordCall(tracker, [input]);
					return {
						answer: ragAnswer,
						sources: [...ragSources],
					};
				},
			};
		},

		prompt(config: Record<string, unknown>) {
			recordCall(tracker, [config]);
			return {
				inputVariables: [] as string[],
				async format(_values: Record<string, string>) {
					recordCall(tracker, [_values]);
					return promptOutput;
				},
				async formatMessages(_values: Record<string, string>) {
					recordCall(tracker, [_values]);
					return [{ role: "human" as const, content: promptOutput }];
				},
			};
		},

		parse(config: Record<string, unknown>) {
			recordCall(tracker, [config]);
			return {
				async parse(_text: string) {
					recordCall(tracker, [_text]);
					return parseResult;
				},
				getFormatInstructions() {
					return "Respond with JSON matching the schema.";
				},
			};
		},
	};
}

// ─── Mock Workflow ──────────────────────────────────────────────────────────

/** Options for configuring mockWorkflow(). */
export interface MockWorkflowOptions {
	/** Client ID. Default: "mock-app" */
	id?: string;
	/** Custom job handler results. Default: { status: "complete" } */
	jobResult?: unknown;
	/** HITL event data returned by waitForEvent. Default: { approved: true } or null. */
	hitlResponse?: Record<string, unknown> | null;
}

/**
 * Mock workflow client and helpers for testing (matches workflow module exports).
 * Returns mock createWorkflow, defineJob, and humanInTheLoop.
 *
 * @example
 * ```ts
 * import { mockWorkflow } from '@jamaalbuilds/ai-toolkit/testing';
 *
 * const wf = mockWorkflow({ hitlResponse: { approved: true } });
 * const client = wf.createWorkflow({ id: 'test' });
 * expect(client.id).toBe('test');
 * expect(wf._tracker.callCount).toBe(1);
 * ```
 */
export function mockWorkflow(options?: MockWorkflowOptions) {
	const id = options?.id ?? "mock-app";
	const hitlResponse =
		options && "hitlResponse" in options
			? (options.hitlResponse ?? null)
			: { approved: true };
	const tracker = createTracker();

	return {
		_tracker: tracker,

		createWorkflow(config: { id?: string }) {
			recordCall(tracker, [config]);
			return {
				id: config.id ?? id,
				inngestClient: {},
			};
		},

		defineJob(
			_client: unknown,
			_config: Record<string, unknown>,
			_handler: unknown,
		) {
			recordCall(tracker, [_client, _config, _handler]);
			return {
				config: _config,
				inngestFn: {},
			};
		},

		async humanInTheLoop(_step: unknown, _options: Record<string, unknown>) {
			recordCall(tracker, [_step, _options]);
			return hitlResponse;
		},

		/** Mock step object for passing to job handlers. */
		createMockStep() {
			const stepTracker = createTracker();
			return {
				_tracker: stepTracker,
				async run<T>(
					stepId: string,
					handler: () => T | Promise<T>,
				): Promise<T> {
					recordCall(stepTracker, [stepId]);
					return handler();
				},
				async sleep(stepId: string, _duration: string): Promise<void> {
					recordCall(stepTracker, [stepId, _duration]);
				},
				async waitForEvent(
					stepId: string,
					_opts: Record<string, unknown>,
				): Promise<Record<string, unknown> | null> {
					recordCall(stepTracker, [stepId, _opts]);
					return hitlResponse;
				},
				async sendEvent(
					stepId: string,
					_event: Record<string, unknown>,
				): Promise<void> {
					recordCall(stepTracker, [stepId, _event]);
				},
			};
		},
	};
}

// ─── Mock Agents ──────────────────────────────────────────────────────────

/** Options for configuring mockAgents(). */
export interface MockAgentsOptions {
	/** Custom graph invoke result. Default: a simple GraphState with one assistant message. */
	invokeResult?: {
		messages: Array<{
			role: string;
			content: string;
			toolCalls?: Record<string, unknown>[];
		}>;
		currentAgent?: string;
		metadata?: Record<string, unknown>;
	};
}

/**
 * Mock agents functions for testing (matches agents module exports).
 * Returns mock createAgent, createGraph, and route.
 *
 * @example
 * ```ts
 * import { mockAgents } from '@jamaalbuilds/ai-toolkit/testing';
 *
 * const agents = mockAgents();
 * const agent = agents.createAgent({ name: 'researcher', systemPrompt: 'Research.' });
 * expect(agent.name).toBe('researcher');
 *
 * const graph = agents.createGraph({ agents: [agent], edges: [] });
 * const result = await graph.invoke({ messages: [] });
 * expect(result.messages).toHaveLength(1);
 * ```
 */
export function mockAgents(options?: MockAgentsOptions) {
	const defaultInvokeResult = options?.invokeResult ?? {
		messages: [
			{
				role: "assistant",
				content: "Mock agent response.",
			},
		],
		currentAgent: "mock-agent",
		metadata: {},
	};

	const tracker = createTracker();

	return {
		_tracker: tracker,

		createAgent(config: {
			name: string;
			systemPrompt: string;
			model?: string;
			tools?: Record<string, unknown>[];
		}) {
			recordCall(tracker, [config]);
			return {
				name: config.name,
				systemPrompt: config.systemPrompt,
				model: config.model,
				tools: config.tools,
				async handler(state: {
					messages: Array<{ role: string; content: string }>;
					currentAgent?: string;
					metadata?: Record<string, unknown>;
				}) {
					return {
						messages: [
							...state.messages,
							{ role: "assistant", content: `Response from ${config.name}` },
						],
						currentAgent: config.name,
					};
				},
			};
		},

		createGraph(config: { agents: unknown[]; edges: unknown[] }) {
			recordCall(tracker, [config]);
			return {
				compiledGraph: {},
				async invoke(input: Record<string, unknown>) {
					recordCall(tracker, [input]);
					return { ...defaultInvokeResult };
				},
			};
		},

		route(
			condition: (state: Record<string, unknown>) => string | Promise<string>,
			destinations: string[],
		) {
			recordCall(tracker, [condition, destinations]);
			return {
				__isRoute: true as const,
				condition,
				destinations,
			};
		},
	};
}
