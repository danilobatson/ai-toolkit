import { describe, expect, it } from "vitest";
import { ValidationError } from "../../errors/types.js";
import { McpServerBuilder } from "../server-builder.js";

describe("defineResource()", () => {
	it("CRASH — does not throw on valid resource definition", () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});

		expect(() =>
			builder.defineResource({
				uri: "config://settings",
				name: "Settings",
				handler: async () => ({ theme: "dark" }),
			}),
		).not.toThrow();
	});

	it("BEHAVIOR — registers resource URI", () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});

		builder.defineResource({
			uri: "config://settings",
			name: "Settings",
			handler: async () => ({ theme: "dark" }),
		});

		expect(builder.resourceUris).toContain("config://settings");
	});

	it("BEHAVIOR — supports method chaining", () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});

		const result = builder.defineResource({
			uri: "data://users",
			name: "Users",
			handler: async () => [],
		});

		expect(result).toBe(builder);
	});

	it("BEHAVIOR — registers multiple resources", () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});

		builder
			.defineResource({
				uri: "config://settings",
				name: "Settings",
				handler: async () => ({}),
			})
			.defineResource({
				uri: "data://patients",
				name: "Patients",
				handler: async () => [],
			});

		expect(builder.resourceUris).toEqual([
			"config://settings",
			"data://patients",
		]);
	});

	it("ENVIRONMENT — rejects duplicate URI with ValidationError", () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});

		builder.defineResource({
			uri: "config://settings",
			name: "Settings",
			handler: async () => ({}),
		});

		expect(() =>
			builder.defineResource({
				uri: "config://settings",
				name: "Settings Duplicate",
				handler: async () => ({}),
			}),
		).toThrow(/already defined/i);

		try {
			builder.defineResource({
				uri: "config://settings",
				name: "Again",
				handler: async () => ({}),
			});
		} catch (err) {
			expect(err).toBeInstanceOf(ValidationError);
		}
	});
});

describe("readResource()", () => {
	it("CRASH — does not throw for registered resource", async () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});

		builder.defineResource({
			uri: "config://app",
			name: "App Config",
			handler: async () => ({ version: "2.0", debug: false }),
		});

		const harness = builder.createTestHarness();
		await expect(harness.readResource("config://app")).resolves.toBeDefined();
	});

	it("BEHAVIOR — returns handler output directly", async () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});

		const data = { theme: "dark", lang: "en" };
		builder.defineResource({
			uri: "config://settings",
			name: "Settings",
			handler: async () => data,
		});

		const harness = builder.createTestHarness();
		const result = await harness.readResource("config://settings");
		expect(result).toEqual(data);
	});

	it("BEHAVIOR — returns array data from handler", async () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});

		const patients = [
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
		];
		builder.defineResource({
			uri: "data://patients",
			name: "Patients",
			handler: async () => patients,
		});

		const harness = builder.createTestHarness();
		const result = await harness.readResource("data://patients");
		expect(result).toEqual(patients);
	});

	it("DATA QUALITY — returns string data as-is", async () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});

		builder.defineResource({
			uri: "text://readme",
			name: "README",
			handler: async () => "# Hello World",
		});

		const harness = builder.createTestHarness();
		const result = await harness.readResource("text://readme");
		expect(result).toBe("# Hello World");
	});

	it("ENVIRONMENT — throws ValidationError for unknown URI", async () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});
		const harness = builder.createTestHarness();

		await expect(harness.readResource("config://nonexistent")).rejects.toThrow(
			/not found/i,
		);

		try {
			await harness.readResource("config://nonexistent");
		} catch (err) {
			expect(err).toBeInstanceOf(ValidationError);
		}
	});

	it("ENVIRONMENT — propagates handler errors", async () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});

		builder.defineResource({
			uri: "data://failing",
			name: "Failing Resource",
			handler: async () => {
				throw new Error("database connection lost");
			},
		});

		const harness = builder.createTestHarness();
		await expect(harness.readResource("data://failing")).rejects.toThrow(
			/database connection lost/i,
		);
	});

	it("CONTRACT — harness lists resource URIs", () => {
		const builder = new McpServerBuilder({
			name: "test-server",
			version: "1.0.0",
		});

		builder.defineResource({
			uri: "config://a",
			name: "A",
			handler: async () => ({}),
		});
		builder.defineResource({
			uri: "config://b",
			name: "B",
			handler: async () => ({}),
		});

		const harness = builder.createTestHarness();
		expect(harness.resourceUris).toEqual(["config://a", "config://b"]);
	});
});
