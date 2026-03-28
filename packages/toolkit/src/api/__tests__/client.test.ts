import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, RateLimitError } from "../../errors/types.js";
import { ApiClient, createApiClient } from "../client.js";

// ─── Mock fetch ────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
	vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
	vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: new Headers(),
		json: async () => data,
		text: async () => JSON.stringify(data),
	} as unknown as Response;
}

function errorResponse(
	status: number,
	body = "error",
	headers?: Record<string, string>,
): Response {
	return {
		ok: false,
		status,
		headers: new Headers(headers),
		json: async () => ({ error: body }),
		text: async () => body,
	} as unknown as Response;
}

describe("api/client", () => {
	// ─── LEVEL 1: CRASH ─────────────────────────────────────────────────

	describe("CRASH", () => {
		it("createApiClient does not throw on valid config", () => {
			const client = createApiClient({ baseUrl: "http://localhost:3000" });
			expect(client).toBeDefined();
		});

		it("createApiClient returns an ApiClient instance", () => {
			const client = createApiClient({ baseUrl: "http://localhost:3000" });
			expect(client).toBeInstanceOf(ApiClient);
		});
	});

	// ─── LEVEL 2: BEHAVIOR ──────────────────────────────────────────────

	describe("BEHAVIOR", () => {
		it("get() sends GET request to correct URL", async () => {
			mockFetch.mockResolvedValue(jsonResponse({ id: 1 }));
			const client = createApiClient({ baseUrl: "http://api.test" });

			const result = await client.get<{ id: number }>("/users/1");

			expect(result).toEqual({ id: 1 });
			expect(mockFetch).toHaveBeenCalledTimes(1);
			const [url, opts] = mockFetch.mock.calls[0];
			expect(url).toBe("http://api.test/users/1");
			expect(opts.method).toBe("GET");
		});

		it("post() sends body as JSON", async () => {
			mockFetch.mockResolvedValue(jsonResponse({ id: 2, name: "Alice" }));
			const client = createApiClient({ baseUrl: "http://api.test" });

			const result = await client.post("/users", { name: "Alice" });

			expect(result).toEqual({ id: 2, name: "Alice" });
			const [, opts] = mockFetch.mock.calls[0];
			expect(opts.method).toBe("POST");
			expect(opts.body).toBe('{"name":"Alice"}');
		});

		it("put() sends PUT request", async () => {
			mockFetch.mockResolvedValue(jsonResponse({ updated: true }));
			const client = createApiClient({ baseUrl: "http://api.test" });

			await client.put("/users/1", { name: "Bob" });

			const [, opts] = mockFetch.mock.calls[0];
			expect(opts.method).toBe("PUT");
		});

		it("delete() sends DELETE request", async () => {
			mockFetch.mockResolvedValue(jsonResponse(undefined, 204));
			const client = createApiClient({ baseUrl: "http://api.test" });

			await client.delete("/users/1");

			const [, opts] = mockFetch.mock.calls[0];
			expect(opts.method).toBe("DELETE");
		});

		it("patch() sends PATCH request", async () => {
			mockFetch.mockResolvedValue(jsonResponse({ patched: true }));
			const client = createApiClient({ baseUrl: "http://api.test" });

			await client.patch("/users/1", { name: "Updated" });

			const [, opts] = mockFetch.mock.calls[0];
			expect(opts.method).toBe("PATCH");
		});

		it("injects X-API-Key header when apiKey configured", async () => {
			mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
			const client = createApiClient({
				baseUrl: "http://api.test",
				apiKey: "secret-key",
			});

			await client.get("/protected");

			const [, opts] = mockFetch.mock.calls[0];
			expect(opts.headers["X-API-Key"]).toBe("secret-key");
		});

		it("strips trailing slash from baseUrl", async () => {
			mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
			const client = createApiClient({ baseUrl: "http://api.test/" });

			await client.get("/path");

			const [url] = mockFetch.mock.calls[0];
			expect(url).toBe("http://api.test/path");
		});

		it("retries on 5xx errors", async () => {
			mockFetch
				.mockResolvedValueOnce(errorResponse(500))
				.mockResolvedValueOnce(errorResponse(500))
				.mockResolvedValueOnce(jsonResponse({ ok: true }));

			const client = createApiClient({
				baseUrl: "http://api.test",
				maxRetries: 2,
			});

			const result = await client.get("/flaky");
			expect(result).toEqual({ ok: true });
			expect(mockFetch).toHaveBeenCalledTimes(3);
		});

		it("throws after exhausting retries on 5xx", async () => {
			mockFetch.mockResolvedValue(errorResponse(503));

			const client = createApiClient({
				baseUrl: "http://api.test",
				maxRetries: 1,
			});

			await expect(client.get("/down")).rejects.toThrow(/503/);
		});
	});

	// ─── LEVEL 3: DATA QUALITY ──────────────────────────────────────────

	describe("DATA QUALITY", () => {
		it("client has get, post, put, patch, delete methods", () => {
			const client = createApiClient({ baseUrl: "http://api.test" });
			expect(typeof client.get).toBe("function");
			expect(typeof client.post).toBe("function");
			expect(typeof client.put).toBe("function");
			expect(typeof client.patch).toBe("function");
			expect(typeof client.delete).toBe("function");
		});

		it("merges custom headers with defaults", async () => {
			mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
			const client = createApiClient({
				baseUrl: "http://api.test",
				headers: { "X-Custom": "value" },
			});

			await client.get("/test", { headers: { "X-Request": "req" } });

			const [, opts] = mockFetch.mock.calls[0];
			expect(opts.headers["Content-Type"]).toBe("application/json");
			expect(opts.headers["X-Custom"]).toBe("value");
			expect(opts.headers["X-Request"]).toBe("req");
		});
	});

	// ─── LEVEL 4: ENVIRONMENT ───────────────────────────────────────────

	describe("ENVIRONMENT", () => {
		it("wraps network errors as ApiClientError", async () => {
			mockFetch.mockRejectedValue(new TypeError("fetch failed"));

			const client = createApiClient({
				baseUrl: "http://api.test",
				maxRetries: 0,
			});

			await expect(client.get("/fail")).rejects.toThrow(ApiClientError);
		});

		it("network error has correct code", async () => {
			mockFetch.mockRejectedValue(new TypeError("fetch failed"));

			const client = createApiClient({
				baseUrl: "http://api.test",
				maxRetries: 0,
			});

			try {
				await client.get("/fail");
			} catch (err) {
				expect(err).toBeInstanceOf(ApiClientError);
				expect((err as ApiClientError).code).toBe("API_CLIENT_NETWORK_ERROR");
				expect((err as ApiClientError).retryable).toBe(true);
			}
		});

		it("429 response throws RateLimitError", async () => {
			mockFetch.mockResolvedValue(
				errorResponse(429, "Too many requests", {
					"Retry-After": "30",
				}),
			);

			const client = createApiClient({ baseUrl: "http://api.test" });

			await expect(client.get("/limited")).rejects.toThrow(RateLimitError);
		});

		it("429 RateLimitError includes retryAfter", async () => {
			mockFetch.mockResolvedValue(
				errorResponse(429, "Too many requests", {
					"Retry-After": "60",
				}),
			);

			const client = createApiClient({ baseUrl: "http://api.test" });

			try {
				await client.get("/limited");
			} catch (err) {
				expect(err).toBeInstanceOf(RateLimitError);
				expect((err as RateLimitError).retryAfter).toBe(60);
			}
		});

		it("4xx errors throw ApiClientError and do not retry", async () => {
			mockFetch.mockResolvedValue(errorResponse(404, "Not found"));

			const client = createApiClient({
				baseUrl: "http://api.test",
				maxRetries: 2,
			});

			await expect(client.get("/missing")).rejects.toThrow(ApiClientError);
			// Should not retry on 4xx
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it("4xx ApiClientError is not retryable", async () => {
			expect.assertions(2);
			mockFetch.mockResolvedValue(errorResponse(400, "Bad request"));

			const client = createApiClient({
				baseUrl: "http://api.test",
				maxRetries: 0,
			});

			try {
				await client.post("/bad");
			} catch (err) {
				expect(err).toBeInstanceOf(ApiClientError);
				expect((err as ApiClientError).retryable).toBe(false);
			}
		});
	});

	// ─── LEVEL 5: PATTERN ───────────────────────────────────────────────

	describe("PATTERN", () => {
		it("all errors are ToolkitError subclasses", async () => {
			mockFetch.mockRejectedValue(new TypeError("network down"));

			const client = createApiClient({
				baseUrl: "http://api.test",
				maxRetries: 0,
			});

			try {
				await client.get("/err");
			} catch (err) {
				expect(err).toBeInstanceOf(ApiClientError);
				expect((err as ApiClientError).code).toMatch(/^API_CLIENT_/);
			}
		});

		it("exports createApiClient factory function", async () => {
			const mod = await import("../index.js");
			expect(typeof mod.createApiClient).toBe("function");
			expect(mod.ApiClient).toBeDefined();
		});
	});

	// ─── LEVEL 6: CONTRACT ──────────────────────────────────────────────

	describe("CONTRACT", () => {
		it("createApiClient accepts full config", () => {
			const client = createApiClient({
				baseUrl: "http://api.test",
				apiKey: "key",
				timeout: 5000,
				maxRetries: 3,
				headers: { "X-Org": "acme" },
			});
			expect(client).toBeInstanceOf(ApiClient);
		});

		it("handles 204 No Content response", async () => {
			mockFetch.mockResolvedValue(jsonResponse(undefined, 204));
			const client = createApiClient({ baseUrl: "http://api.test" });

			const result = await client.delete("/resource/1");
			expect(result).toBeUndefined();
		});
	});
});
