import { ApiClientError, RateLimitError, ValidationError } from "../errors/types.js";

export interface ApiClientConfig {
	/** Base URL of the backend (e.g., http://localhost:8000) */
	baseUrl: string;

	/** API key for service-to-service auth (sent as X-API-Key header) */
	apiKey?: string;

	/** Request timeout in milliseconds. Default: 30000 (30s) */
	timeout?: number;

	/** Max retries on 5xx errors. Default: 2 */
	maxRetries?: number;

	/** Additional default headers */
	headers?: Record<string, string>;
}

interface RequestOptions {
	/** Additional headers for this specific request */
	headers?: Record<string, string>;

	/** Override timeout for this request */
	timeout?: number;

	/** AbortSignal for request cancellation */
	signal?: AbortSignal;
}

/**
 * A typed HTTP client for BFF → backend communication.
 *
 * Wraps fetch with: automatic retry on 5xx, error wrapping into
 * ToolkitError hierarchy, timeout handling, API key injection,
 * and correlation ID forwarding.
 */
export class ApiClient {
	private baseUrl: string;
	private apiKey?: string;
	private timeout: number;
	private maxRetries: number;
	private defaultHeaders: Record<string, string>;

	constructor(config: ApiClientConfig) {
		if (!config.baseUrl || typeof config.baseUrl !== "string") {
			throw new ValidationError(
				"baseUrl is required and must be a non-empty string",
				{ code: "API_CLIENT_INVALID_CONFIG", fields: { baseUrl: "required, non-empty string" } },
			);
		}
		// Strip trailing slash
		this.baseUrl = config.baseUrl.replace(/\/$/, "");
		this.apiKey = config.apiKey;
		this.timeout = config.timeout ?? 30_000;
		this.maxRetries = config.maxRetries ?? 2;
		this.defaultHeaders = {
			"Content-Type": "application/json",
			...config.headers,
		};
	}

	async get<T>(path: string, options?: RequestOptions): Promise<T> {
		return this.request<T>("GET", path, undefined, options);
	}

	async post<T>(
		path: string,
		body?: unknown,
		options?: RequestOptions,
	): Promise<T> {
		return this.request<T>("POST", path, body, options);
	}

	async put<T>(
		path: string,
		body?: unknown,
		options?: RequestOptions,
	): Promise<T> {
		return this.request<T>("PUT", path, body, options);
	}

	async patch<T>(
		path: string,
		body?: unknown,
		options?: RequestOptions,
	): Promise<T> {
		return this.request<T>("PATCH", path, body, options);
	}

	async delete<T>(path: string, options?: RequestOptions): Promise<T> {
		return this.request<T>("DELETE", path, undefined, options);
	}

	private async request<T>(
		method: string,
		path: string,
		body?: unknown,
		options?: RequestOptions,
	): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		const timeout = options?.timeout ?? this.timeout;

		const headers: Record<string, string> = {
			...this.defaultHeaders,
			...options?.headers,
		};

		if (this.apiKey) {
			headers["X-API-Key"] = this.apiKey;
		}

		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), timeout);

				const response = await fetch(url, {
					method,
					headers,
					body: body ? JSON.stringify(body) : undefined,
					signal: options?.signal ?? controller.signal,
				});

				clearTimeout(timeoutId);

				if (response.ok) {
					// Handle 204 No Content
					if (response.status === 204) return undefined as T;

					return (await response.json()) as T;
				}

				// 429 Rate Limited — wrap as RateLimitError
				if (response.status === 429) {
					const retryAfter = response.headers.get("Retry-After");
					throw new RateLimitError(`Rate limited: ${method} ${path}`, {
						retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
					});
				}

				// 4xx Client errors — don't retry
				if (response.status >= 400 && response.status < 500) {
					const errorBody = await response.text().catch(() => "Unknown error");
					throw new ApiClientError(
						`${method} ${path} failed: ${response.status} ${errorBody}`,
						{
							url,
							method,
							statusCode: response.status,
							retryable: false,
						},
					);
				}

				// 5xx Server errors — retry
				if (response.status >= 500) {
					lastError = new ApiClientError(
						`${method} ${path} failed: ${response.status}`,
						{
							url,
							method,
							statusCode: response.status,
							retryable: true,
						},
					);

					// Don't retry on last attempt
					if (attempt < this.maxRetries) {
						const delay = 2 ** attempt * 500; // 500ms, 1s, 2s
						await new Promise((resolve) => setTimeout(resolve, delay));
					}
				}
			} catch (error) {
				// Already one of our error types — rethrow
				if (
					error instanceof ApiClientError ||
					error instanceof RateLimitError
				) {
					throw error;
				}

				// AbortError = timeout
				if (error instanceof DOMException && error.name === "AbortError") {
					lastError = new ApiClientError(
						`${method} ${path} timed out after ${timeout}ms`,
						{
							url,
							method,
							code: "API_CLIENT_TIMEOUT",
							statusCode: 504,
							retryable: true,
						},
					);
				} else {
					// Network error, DNS failure, etc.
					lastError = new ApiClientError(
						`${method} ${path} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
						{
							url,
							method,
							code: "API_CLIENT_NETWORK_ERROR",
							statusCode: 502,
							retryable: true,
							cause: error instanceof Error ? error : undefined,
						},
					);
				}

				if (attempt < this.maxRetries) {
					const delay = 2 ** attempt * 500;
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}
		}

		throw (
			lastError ??
			new ApiClientError(
				`${method} ${path} failed after ${this.maxRetries + 1} attempts`,
				{ url, method, retryable: false },
			)
		);
	}
}

/**
 * Create a typed HTTP client for BFF → backend calls.
 *
 * @example
 * ```ts
 * const backend = createApiClient({
 *   baseUrl: process.env.BACKEND_URL!,
 *   apiKey: process.env.BACKEND_API_KEY,
 * });
 *
 * const patients = await backend.get<Patient[]>('/api/patients');
 * const patient = await backend.post<Patient>('/api/patients', { name: 'Jane' });
 * ```
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
	return new ApiClient(config);
}
