import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ValidationError } from "../../errors/types.js";
import type { McpContent } from "../server-builder.js";
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

describe("McpTestHarness error paths", () => {
	it("ENVIRONMENT — callTool throws ValidationError for unknown tool", async () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});
		const harness = builder.createTestHarness();
		await expect(harness.callTool("nonexistent")).rejects.toThrow(/not found/i);

		expect.assertions(2);
		try {
			await harness.callTool("nonexistent");
		} catch (err) {
			expect(err).toBeInstanceOf(ValidationError);
		}
	});

	it("BEHAVIOR — callTool error message lists available tools", async () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});
		builder.defineTool({
			name: "greet",
			description: "Greet",
			schema: { name: z.string() },
			handler: async () => "hi",
		});
		const harness = builder.createTestHarness();
		await expect(harness.callTool("missing")).rejects.toThrow(/greet/);
	});
});

describe("McpContent type variants", () => {
	it("DATA QUALITY — McpContent supports text type", () => {
		const content: McpContent = {
			type: "text",
			text: "Hello world",
		};
		expect(content.type).toBe("text");
		expect(content.text).toBe("Hello world");
	});

	it("DATA QUALITY — McpContent supports image type", () => {
		const content: McpContent = {
			type: "image",
			data: "iVBORw0KGgo=",
			mimeType: "image/png",
		};
		expect(content.type).toBe("image");
		expect(content.data).toBe("iVBORw0KGgo=");
		expect(content.mimeType).toBe("image/png");
	});

	it("DATA QUALITY — McpContent supports resource type", () => {
		const content: McpContent = {
			type: "resource",
			text: '{"key": "value"}',
			mimeType: "application/json",
		};
		expect(content.type).toBe("resource");
		expect(content.text).toBe('{"key": "value"}');
		expect(content.mimeType).toBe("application/json");
	});

	it("BEHAVIOR — tool handler error returns McpContent with isError", async () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});
		builder.defineTool({
			name: "fail_tool",
			description: "Always fails",
			schema: {},
			handler: async () => {
				throw new Error("intentional failure");
			},
		});

		const harness = builder.createTestHarness();
		const result = await harness.callTool("fail_tool");
		expect(result.isError).toBe(true);
		expect(result.content[0].type).toBe("text");
		expect(result.content[0].text).toMatch(/intentional failure/);
	});
});
