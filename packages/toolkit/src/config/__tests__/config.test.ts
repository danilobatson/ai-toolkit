import { describe, expect, it } from "vitest";
import { ValidationError } from "../../errors/types.js";
import { initToolkit, parseConfig } from "../index.js";
import { toolkitConfigSchema } from "../schema.js";

describe("parseConfig", () => {
	it("parses valid env and returns config", () => {
		const config = parseConfig({
			ANTHROPIC_API_KEY: "sk-test-123",
			NODE_ENV: "test",
		});
		expect(config.ANTHROPIC_API_KEY).toBe("sk-test-123");
		expect(config.NODE_ENV).toBe("test");
	});

	it("applies defaults for optional fields", () => {
		const config = parseConfig({});
		expect(config.LOG_LEVEL).toBe("info");
		expect(config.CACHE_DEFAULT_TTL).toBe(300);
		expect(config.NODE_ENV).toBe("development");
	});

	it("throws ValidationError on invalid required field", () => {
		expect(() => parseConfig({ DATABASE_URL: "not-a-url" })).toThrow(
			/validation failed/i,
		);
	});

	it("throws an instance of ValidationError", () => {
		expect.assertions(1);
		try {
			parseConfig({ DATABASE_URL: "not-a-url" });
		} catch (err) {
			expect(err).toBeInstanceOf(ValidationError);
		}
	});

	it("rejects invalid NODE_ENV value", () => {
		expect(() => parseConfig({ NODE_ENV: "staging" })).toThrow(
			/validation failed/i,
		);
	});

	it("rejects invalid LOG_LEVEL value", () => {
		expect(() => parseConfig({ LOG_LEVEL: "verbose" })).toThrow(
			/validation failed/i,
		);
	});

	it("ignores extra unknown fields without error", () => {
		const config = parseConfig({
			TOTALLY_UNKNOWN_FIELD: "hello",
			ANOTHER_EXTRA: "world",
		});
		// Zod strips unknown keys by default — config should still parse
		expect(config.NODE_ENV).toBe("development");
	});

	it("coerces CACHE_DEFAULT_TTL from string to number", () => {
		const config = parseConfig({ CACHE_DEFAULT_TTL: "600" });
		expect(config.CACHE_DEFAULT_TTL).toBe(600);
		expect(typeof config.CACHE_DEFAULT_TTL).toBe("number");
	});
});

describe("initToolkit", () => {
	it("returns object with config and has() method", () => {
		const toolkit = initToolkit({});
		expect(typeof toolkit.config).toBe("object");
		expect(toolkit.config).not.toBeNull();
		expect(typeof toolkit.has).toBe("function");
	});

	it("has() returns true for configured features", () => {
		const toolkit = initToolkit({
			ANTHROPIC_API_KEY: "sk-test",
		});
		expect(toolkit.has("anthropic")).toBe(true);
	});

	it("has() returns false for unconfigured features", () => {
		const toolkit = initToolkit({});
		expect(toolkit.has("anthropic")).toBe(false);
		expect(toolkit.has("redis")).toBe(false);
	});
});

describe("toolkitConfigSchema", () => {
	it("BEHAVIOR — safeParse returns success for valid env", () => {
		const result = toolkitConfigSchema.safeParse({
			ANTHROPIC_API_KEY: "sk-ant-test",
			NODE_ENV: "test",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.ANTHROPIC_API_KEY).toBe("sk-ant-test");
			expect(result.data.NODE_ENV).toBe("test");
		}
	});

	it("BEHAVIOR — safeParse returns failure for invalid DATABASE_URL", () => {
		const result = toolkitConfigSchema.safeParse({
			DATABASE_URL: "not-a-url",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.length).toBeGreaterThan(0);
		}
	});

	it("DATA QUALITY — applies defaults for optional fields", () => {
		const result = toolkitConfigSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.LOG_LEVEL).toBe("info");
			expect(result.data.CACHE_DEFAULT_TTL).toBe(300);
			expect(result.data.NODE_ENV).toBe("development");
			expect(result.data.MCP_SERVER_VERSION).toBe("1.0.0");
		}
	});

	it("ENVIRONMENT — rejects invalid NODE_ENV via safeParse", () => {
		const result = toolkitConfigSchema.safeParse({ NODE_ENV: "staging" });
		expect(result.success).toBe(false);
	});
});
