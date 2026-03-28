import { describe, expect, it } from "vitest";
import { ToolkitError } from "../base.js";
import {
	ApiClientError,
	AuthError,
	CacheError,
	LLMError,
	RateLimitError,
	StorageError,
	ValidationError,
} from "../types.js";

describe("ToolkitError", () => {
	it("sets message correctly", () => {
		const err = new ToolkitError("test message", { code: "TEST" });
		expect(err.message).toBe("test message");
	});

	it("defaults code to provided value", () => {
		const err = new ToolkitError("msg", { code: "TOOLKIT_ERROR" });
		expect(err.code).toBe("TOOLKIT_ERROR");
	});

	it("defaults statusCode to 500", () => {
		const err = new ToolkitError("msg", { code: "TEST" });
		expect(err.statusCode).toBe(500);
	});

	it("defaults retryable to false", () => {
		const err = new ToolkitError("msg", { code: "TEST" });
		expect(err.retryable).toBe(false);
	});

	it("toJSON returns correct shape", () => {
		const err = new ToolkitError("msg", { code: "TEST" });
		const json = err.toJSON();
		expect(json).toEqual({
			name: "ToolkitError",
			message: "msg",
			code: "TEST",
			statusCode: 500,
			retryable: false,
			cause: undefined,
		});
	});

	it("is an instance of Error", () => {
		const err = new ToolkitError("msg", { code: "TEST" });
		expect(err).toBeInstanceOf(Error);
	});
});

describe("LLMError", () => {
	it("sets statusCode to 502 by default", () => {
		const err = new LLMError("fail", { provider: "anthropic" });
		expect(err.statusCode).toBe(502);
	});

	it("sets provider correctly", () => {
		const err = new LLMError("fail", { provider: "openai" });
		expect(err.provider).toBe("openai");
	});

	it("preserves model when provided", () => {
		const err = new LLMError("fail", {
			provider: "openai",
			model: "gpt-4o-mini",
		});
		expect(err.model).toBe("gpt-4o-mini");
	});

	it("model is undefined when not provided", () => {
		const err = new LLMError("fail", { provider: "openai" });
		expect(err.model).toBeUndefined();
	});
});

describe("RateLimitError", () => {
	it("sets retryable to true", () => {
		const err = new RateLimitError("too fast");
		expect(err.retryable).toBe(true);
	});

	it("sets statusCode to 429", () => {
		const err = new RateLimitError("too fast");
		expect(err.statusCode).toBe(429);
	});

	it("preserves retryAfter when provided", () => {
		const err = new RateLimitError("too fast", { retryAfter: 30 });
		expect(err.retryAfter).toBe(30);
	});

	it("retryAfter is undefined when not provided", () => {
		const err = new RateLimitError("too fast");
		expect(err.retryAfter).toBeUndefined();
	});
});

describe("AuthError", () => {
	it("sets statusCode to 401 by default", () => {
		const err = new AuthError("unauthorized");
		expect(err.statusCode).toBe(401);
	});
});

describe("ValidationError", () => {
	it("sets statusCode to 400", () => {
		const err = new ValidationError("invalid input");
		expect(err.statusCode).toBe(400);
	});

	it("stores fields when provided", () => {
		const err = new ValidationError("bad", { fields: { name: "required" } });
		expect(err.fields).toEqual({ name: "required" });
	});
});

describe("StorageError", () => {
	it("sets statusCode to 502 by default", () => {
		const err = new StorageError("upload failed");
		expect(err.statusCode).toBe(502);
	});

	it("defaults retryable to true", () => {
		const err = new StorageError("upload failed");
		expect(err.retryable).toBe(true);
	});

	it("respects explicit retryable=false", () => {
		const err = new StorageError("permanent failure", { retryable: false });
		expect(err.retryable).toBe(false);
	});
});

describe("CacheError", () => {
	it("sets statusCode to 500", () => {
		const err = new CacheError("redis down");
		expect(err.statusCode).toBe(500);
	});
});

describe("ApiClientError", () => {
	it("sets statusCode to 502 by default", () => {
		const err = new ApiClientError("timeout", {
			url: "https://api.example.com",
			method: "GET",
		});
		expect(err.statusCode).toBe(502);
	});

	it("stores url and method", () => {
		const err = new ApiClientError("fail", {
			url: "https://api.example.com/v1",
			method: "POST",
		});
		expect(err.url).toBe("https://api.example.com/v1");
		expect(err.method).toBe("POST");
	});
});
