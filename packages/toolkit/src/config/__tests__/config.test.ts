import { describe, it, expect } from "vitest";
import { parseConfig, initToolkit } from "../index.js";
import { ValidationError } from "../../errors/types.js";

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
    expect(() =>
      parseConfig({ DATABASE_URL: "not-a-url" }),
    ).toThrow(/validation failed/i);
  });

  it("throws an instance of ValidationError", () => {
    try {
      parseConfig({ DATABASE_URL: "not-a-url" });
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
    }
  });
});

describe("initToolkit", () => {
  it("returns object with config and has() method", () => {
    const toolkit = initToolkit({});
    expect(toolkit.config).toBeDefined();
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
