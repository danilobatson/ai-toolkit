import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ValidationError } from "../../errors/types.js";
import { McpServerBuilder } from "../server-builder.js";

describe("McpServerBuilder", () => {
	it("creates a server builder instance", () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});
		expect(builder).toBeInstanceOf(McpServerBuilder);
	});

	it("registers tool with name via defineTool", () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});
		builder.defineTool({
			name: "greet",
			description: "Say hello",
			schema: { name: z.string() },
			handler: async ({ name }) => `Hello, ${name}!`,
		});
		expect(builder.toolNames).toContain("greet");
	});

	it("rejects duplicate tool names with ValidationError", () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});
		const def = {
			name: "greet",
			description: "Say hello",
			schema: { name: z.string() },
			handler: async () => "hi",
		};
		builder.defineTool(def);
		expect(() => builder.defineTool(def)).toThrow(/already defined/i);
		try {
			builder.defineTool(def);
		} catch (err) {
			expect(err).toBeInstanceOf(ValidationError);
		}
	});

	it("test harness calls tool handler with parsed input", async () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});
		builder.defineTool({
			name: "add",
			description: "Add two numbers",
			schema: { a: z.number(), b: z.number() },
			handler: async ({ a, b }) => (a as number) + (b as number),
		});

		const harness = builder.createTestHarness();
		const result = await harness.callTool("add", { a: 2, b: 3 });
		expect(result.isError).toBeUndefined();
		expect(result.content[0].text).toBe("5");
	});
});
