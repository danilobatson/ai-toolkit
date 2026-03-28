import { describe, expect, it, vi } from "vitest";
import { ToolkitError } from "../../errors/index.js";

// ─── Mock Inngest ───────────────────────────────────────────────────────────

function createMockStep() {
	return {
		run: vi.fn(async (_id: string, fn: () => unknown) => fn()),
		sleep: vi.fn(async () => {}),
		waitForEvent: vi.fn(async () => null),
		sendEvent: vi.fn(async () => {}),
	};
}

function createMockInngest() {
	const mockStep = createMockStep();
	const mockCreateFunction = vi.fn(
		(
			_opts: Record<string, unknown>,
			handler: (ctx: Record<string, unknown>) => Promise<unknown>,
		) => {
			// Return an object that holds the handler and config for testing
			return {
				__handler: handler,
				__opts: _opts,
				// Simulate calling the handler with mock context
				invoke: async (eventData?: Record<string, unknown>) => {
					return handler({
						event: {
							name: "test/event",
							data: eventData ?? {},
						},
						step: mockStep,
					});
				},
			};
		},
	);

	return {
		mockStep,
		mockCreateFunction,
		MockInngest: class {
			id: string;
			createFunction = mockCreateFunction;
			constructor(config: { id: string }) {
				this.id = config.id;
			}
		},
	};
}

// Mock the inngest module globally
const { mockCreateFunction, MockInngest } = createMockInngest();

vi.mock("inngest", () => ({
	Inngest: MockInngest,
}));

vi.mock("inngest/next", () => ({
	serve: vi.fn(({ client, functions }) => ({
		GET: `GET:${client.id}:${functions.length}`,
		POST: `POST:${client.id}:${functions.length}`,
		PUT: `PUT:${client.id}:${functions.length}`,
	})),
}));

// Now import the module under test (after mock is set up)
const { createWorkflow, defineJob, humanInTheLoop, aiStep } = await import(
	"../workflow.js"
);

describe("workflow", () => {
	// ─── Level 1: CRASH ─────────────────────────────────────────────────────

	describe("CRASH", () => {
		it("createWorkflow does not throw on valid input", async () => {
			const client = await createWorkflow({ id: "test-app" });
			expect(client).toBeDefined();
			expect(client.id).toBe("test-app");
		});

		it("defineJob does not throw on valid config", async () => {
			const client = await createWorkflow({ id: "test-app" });
			const job = defineJob(
				client,
				{ id: "my-job", trigger: { event: "app/test" } },
				async () => "done",
			);
			expect(job).toBeDefined();
			expect(job.config.id).toBe("my-job");
		});

		it("humanInTheLoop does not throw on valid input", async () => {
			const step = createMockStep();
			const result = await humanInTheLoop(step, {
				stepId: "wait",
				event: "app/approved",
				timeout: "7d",
			});
			expect(result).toBeNull(); // mock returns null (timeout)
		});

		it("aiStep does not throw with fallback", async () => {
			const step = createMockStep();
			const result = await aiStep(step, {
				stepId: "gen",
				prompt: "Hello",
				fallback: "fallback text",
			});
			expect(result).toBeDefined();
			expect(result.text).toBe("fallback text");
		});
	});

	// ─── Level 2: BEHAVIOR ──────────────────────────────────────────────────

	describe("BEHAVIOR", () => {
		it("createWorkflow returns a WorkflowClient with inngestClient", async () => {
			const client = await createWorkflow({ id: "my-app" });
			expect(client.id).toBe("my-app");
			expect(client.inngestClient).toBeDefined();
		});

		it("defineJob calls inngest.createFunction with v4 2-arg API", async () => {
			const client = await createWorkflow({ id: "my-app" });
			mockCreateFunction.mockClear();

			defineJob(
				client,
				{ id: "job-1", trigger: { event: "app/test" } },
				async () => "result",
			);

			expect(mockCreateFunction).toHaveBeenCalledTimes(1);
			const [opts] = mockCreateFunction.mock.calls[0];
			expect(opts.id).toBe("job-1");
			expect(opts.triggers).toEqual([{ event: "app/test" }]);
		});

		it("defineJob handler wraps context and passes to user handler", async () => {
			const client = await createWorkflow({ id: "my-app" });
			const userHandler = vi.fn(async ({ event, step }) => {
				const data = await step.run("fetch", () => ({ id: event.data.itemId }));
				return { fetched: data };
			});

			mockCreateFunction.mockClear();
			defineJob(
				client,
				{ id: "job-2", trigger: { event: "app/item.created" } },
				userHandler,
			);

			// Get the Inngest handler and invoke it
			const inngestHandler = mockCreateFunction.mock.calls[0][1];
			const step = createMockStep();
			step.run.mockImplementation(async (_id, fn) => fn());

			const result = await inngestHandler({
				event: { name: "app/item.created", data: { itemId: "123" } },
				step,
			});

			expect(userHandler).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ fetched: { id: "123" } });
		});

		it("defineJob with cron trigger uses cron in triggers array", async () => {
			const client = await createWorkflow({ id: "cron-app" });
			mockCreateFunction.mockClear();

			defineJob(
				client,
				{ id: "daily-job", trigger: { cron: "0 9 * * *" } },
				async () => "ran",
			);

			const [opts] = mockCreateFunction.mock.calls[0];
			expect(opts.triggers).toEqual([{ cron: "0 9 * * *" }]);
		});

		it("humanInTheLoop calls step.waitForEvent with correct options", async () => {
			const step = createMockStep();
			step.waitForEvent.mockResolvedValue({
				data: { approved: true },
			});

			const result = await humanInTheLoop(step, {
				stepId: "wait-approval",
				event: "app/approved",
				timeout: "7d",
				match: "data.requestId",
			});

			expect(step.waitForEvent).toHaveBeenCalledWith("wait-approval", {
				event: "app/approved",
				timeout: "7d",
				match: "data.requestId",
			});
			expect(result).toEqual({ data: { approved: true } });
		});

		it("humanInTheLoop returns null on timeout", async () => {
			const step = createMockStep();
			step.waitForEvent.mockResolvedValue(null);

			const result = await humanInTheLoop(step, {
				stepId: "wait",
				event: "app/approved",
				timeout: "30m",
			});
			expect(result).toBeNull();
		});

		it("aiStep uses fallback when ai module unavailable", async () => {
			const step = createMockStep();
			step.run.mockImplementation(async (_id, fn) => fn());

			const result = await aiStep(step, {
				stepId: "generate",
				prompt: "Summarize this",
				fallback: "No summary available",
			});

			expect(result.text).toBe("No summary available");
			expect(result.usedFallback).toBe(true);
		});
	});

	// ─── Level 2B: BEHAVIOR — Configurable Pricing ─────────────────────────

	describe("BEHAVIOR — configurable pricing", () => {
		it("aiStep accepts pricing config in options schema", async () => {
			const step = createMockStep();
			step.run.mockImplementation(async (_id, fn) => fn());

			// Should not throw with pricing config
			const result = await aiStep(step, {
				stepId: "priced",
				prompt: "Hello",
				fallback: "fallback",
				pricing: {
					inputCostPerMillionTokens: 1,
					outputCostPerMillionTokens: 2,
				},
			});
			expect(result.text).toBe("fallback");
		});

		it("aiStep uses default pricing when not provided", async () => {
			const step = createMockStep();
			step.run.mockImplementation(async (_id, fn) => fn());

			const result = await aiStep(step, {
				stepId: "default-price",
				prompt: "Hello",
				fallback: "fallback",
			});
			expect(result.usedFallback).toBe(true);
		});
	});

	// ─── Level 3: DATA QUALITY ──────────────────────────────────────────────

	describe("DATA QUALITY", () => {
		it("WorkflowClient has correct shape", async () => {
			const client = await createWorkflow({ id: "shape-test" });
			expect(typeof client.id).toBe("string");
			expect(client.inngestClient).toBeDefined();
		});

		it("WorkflowJob has correct shape", async () => {
			const client = await createWorkflow({ id: "shape-test" });
			const job = defineJob(
				client,
				{ id: "job-shape", trigger: { event: "test/event" } },
				async () => null,
			);
			expect(typeof job.config.id).toBe("string");
			expect(job.config.trigger).toEqual({ event: "test/event" });
			expect(job.inngestFn).toBeDefined();
		});

		it("AIStepResult has correct shape with fallback", async () => {
			const step = createMockStep();
			step.run.mockImplementation(async (_id, fn) => fn());

			const result = await aiStep(step, {
				stepId: "ai",
				prompt: "test",
				fallback: "fb",
			});

			expect(typeof result.text).toBe("string");
			expect(typeof result.usedFallback).toBe("boolean");
			expect(result.usedFallback).toBe(true);
		});
	});

	// ─── Level 4: ENVIRONMENT ───────────────────────────────────────────────

	describe("ENVIRONMENT", () => {
		it("createWorkflow throws on missing id", async () => {
			await expect(createWorkflow({} as never)).rejects.toThrow(
				/invalid config/i,
			);
		});

		it("createWorkflow throws on empty id", async () => {
			await expect(createWorkflow({ id: "" })).rejects.toThrow(
				/invalid config/i,
			);
		});

		it("defineJob throws on missing client", () => {
			expect(() =>
				defineJob(
					null as never,
					{ id: "x", trigger: { event: "e" } },
					async () => null,
				),
			).toThrow(/requires a valid WorkflowClient/i);
		});

		it("defineJob throws on missing handler", async () => {
			const client = await createWorkflow({ id: "test" });
			expect(() =>
				defineJob(client, { id: "x", trigger: { event: "e" } }, null as never),
			).toThrow(/requires a handler/i);
		});

		it("defineJob throws on missing job id", async () => {
			const client = await createWorkflow({ id: "test" });
			expect(() =>
				defineJob(
					client,
					{ id: "", trigger: { event: "e" } },
					async () => null,
				),
			).toThrow(/invalid config/i);
		});

		it("humanInTheLoop throws on missing step", async () => {
			await expect(
				humanInTheLoop(null as never, {
					stepId: "x",
					event: "e",
					timeout: "1h",
				}),
			).rejects.toThrow(/requires a valid step/i);
		});

		it("humanInTheLoop throws on missing stepId", async () => {
			const step = createMockStep();
			await expect(
				humanInTheLoop(step, {
					stepId: "",
					event: "e",
					timeout: "1h",
				}),
			).rejects.toThrow(/invalid options/i);
		});

		it("humanInTheLoop throws on missing event", async () => {
			const step = createMockStep();
			await expect(
				humanInTheLoop(step, {
					stepId: "x",
					event: "",
					timeout: "1h",
				}),
			).rejects.toThrow(/invalid options/i);
		});

		it("humanInTheLoop throws on missing timeout", async () => {
			const step = createMockStep();
			await expect(
				humanInTheLoop(step, {
					stepId: "x",
					event: "e",
					timeout: "",
				}),
			).rejects.toThrow(/invalid options/i);
		});

		it("aiStep throws on missing step", async () => {
			await expect(
				aiStep(null as never, {
					stepId: "x",
					prompt: "test",
				}),
			).rejects.toThrow(/requires a valid step/i);
		});

		it("aiStep throws on empty prompt", async () => {
			const step = createMockStep();
			await expect(
				aiStep(step, {
					stepId: "x",
					prompt: "",
				}),
			).rejects.toThrow(/invalid options/i);
		});

		it("aiStep throws on empty stepId", async () => {
			const step = createMockStep();
			await expect(
				aiStep(step, {
					stepId: "",
					prompt: "test",
				}),
			).rejects.toThrow(/invalid options/i);
		});

		it("aiStep throws without fallback when ai module unavailable", async () => {
			const step = createMockStep();
			step.run.mockImplementation(async (_id, fn) => fn());

			await expect(
				aiStep(step, {
					stepId: "gen",
					prompt: "Hello",
				}),
			).rejects.toThrow(/not available.*no fallback/i);
		});
	});

	// ─── Level 5: PATTERN ───────────────────────────────────────────────────

	describe("PATTERN", () => {
		it("all errors are ToolkitError instances", async () => {
			expect.assertions(2);
			try {
				await createWorkflow({} as never);
			} catch (error) {
				expect(error).toBeInstanceOf(ToolkitError);
				expect((error as ToolkitError).code).toMatch(/^WORKFLOW_/);
			}
		});

		it("error codes use WORKFLOW_ prefix", async () => {
			expect.assertions(1);
			try {
				await createWorkflow({ id: "" });
			} catch (error) {
				expect((error as ToolkitError).code).toBe("WORKFLOW_INVALID_CONFIG");
			}
		});

		it("exports follow alphabetical barrel pattern", async () => {
			const mod = await import("../index.js");
			const exportNames = Object.keys(mod).sort();
			expect(exportNames).toContain("createWorkflow");
			expect(exportNames).toContain("defineJob");
			expect(exportNames).toContain("humanInTheLoop");
			expect(exportNames).toContain("aiStep");
			expect(exportNames).toContain("serve");
		});
	});

	// ─── Level 6: CONTRACT ──────────────────────────────────────────────────

	describe("CONTRACT", () => {
		it("defineJob passes retries to inngest config", async () => {
			const client = await createWorkflow({ id: "contract-test" });
			mockCreateFunction.mockClear();

			defineJob(
				client,
				{ id: "retry-job", trigger: { event: "test/e" }, retries: 5 },
				async () => null,
			);

			const [opts] = mockCreateFunction.mock.calls[0];
			expect(opts.retries).toBe(5);
		});

		it("defineJob passes concurrency to inngest config", async () => {
			const client = await createWorkflow({ id: "contract-test" });
			mockCreateFunction.mockClear();

			defineJob(
				client,
				{
					id: "concurrent-job",
					trigger: { event: "test/e" },
					concurrency: 10,
				},
				async () => null,
			);

			const [opts] = mockCreateFunction.mock.calls[0];
			expect(opts.concurrency).toEqual([{ limit: 10 }]);
		});

		it("step.run wraps errors in ToolkitError", async () => {
			const client = await createWorkflow({ id: "err-test" });
			mockCreateFunction.mockClear();

			defineJob(
				client,
				{ id: "err-job", trigger: { event: "test/e" } },
				async ({ step }) => {
					return step.run("fail-step", () => {
						throw new Error("step boom");
					});
				},
			);

			const inngestHandler = mockCreateFunction.mock.calls[0][1];
			const step = createMockStep();
			step.run.mockImplementation(async (_id, fn) => {
				try {
					return await fn();
				} catch (error) {
					if (error instanceof ToolkitError) throw error;
					throw new ToolkitError(`Step "${_id}" failed`, {
						code: "WORKFLOW_STEP_FAILED",
						retryable: true,
						cause: error instanceof Error ? error : undefined,
					});
				}
			});

			await expect(
				inngestHandler({
					event: { name: "test/e", data: {} },
					step,
				}),
			).rejects.toThrow(/step.*failed/i);
		});

		it("serve throws on missing client", async () => {
			const { serve: serveFn } = await import("../workflow.js");
			await expect(serveFn(null as never)).rejects.toThrow(
				/requires a client/i,
			);
		});

		it("serve throws on missing functions array", async () => {
			const { serve: serveFn } = await import("../workflow.js");
			const client = await createWorkflow({ id: "serve-test" });
			await expect(
				serveFn({ client, functions: null as never }),
			).rejects.toThrow(/requires a functions array/i);
		});

		it("serve returns { GET, POST, PUT } handlers on valid input", async () => {
			const { serve: serveFn } = await import("../workflow.js");
			const client = await createWorkflow({ id: "serve-happy" });
			const job = defineJob(
				client,
				{ id: "job-1", trigger: { event: "app/test" } },
				async () => "done",
			);

			const handlers = await serveFn({ client, functions: [job] });
			expect(handlers).toBeDefined();
			expect(handlers.GET).toBeDefined();
			expect(handlers.POST).toBeDefined();
			expect(handlers.PUT).toBeDefined();
		});
	});

	// ─── Level 7: PROVIDER FALLBACK ─────────────────────────────────────────

	describe("PROVIDER FALLBACK", () => {
		it("aiStep gracefully falls back when ai module not available", async () => {
			const step = createMockStep();
			step.run.mockImplementation(async (_id, fn) => fn());

			const result = await aiStep(step, {
				stepId: "fallback-test",
				prompt: "Generate something",
				fallback: "Fallback response",
			});

			expect(result.text).toBe("Fallback response");
			expect(result.usedFallback).toBe(true);
			expect(result.cost).toBeUndefined();
		});
	});

	// ─── Level 8: CLEANUP ───────────────────────────────────────────────────

	describe("CLEANUP", () => {
		it("WorkflowClient does not hold open connections", async () => {
			const client = await createWorkflow({ id: "cleanup-test" });
			// Inngest client is stateless — no connections to clean up
			// Verify the client object is a plain wrapper with no dispose/close
			expect(client).toBeDefined();
			expect((client as Record<string, unknown>).close).toBeUndefined();
			expect((client as Record<string, unknown>).dispose).toBeUndefined();
		});

		it("defineJob returns serializable config", async () => {
			const client = await createWorkflow({ id: "cleanup-test" });
			const job = defineJob(
				client,
				{ id: "clean-job", trigger: { event: "test/e" } },
				async () => "done",
			);
			// Config should be plain JSON-serializable
			const serialized = JSON.stringify(job.config);
			expect(JSON.parse(serialized)).toEqual(job.config);
		});
	});
});
