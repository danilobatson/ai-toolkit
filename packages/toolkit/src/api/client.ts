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
		const headers = this.buildHeaders(options?.headers);

		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			try {
				const result = await this.executeRequest<T>(
					method, url, headers, body, timeout, options?.signal,
				);
				return result;
			} catch (error) {
				if (error instanceof ApiClientError || error instanceof RateLimitError) {
					if (!isRetryable(error)) throw error;
					lastError = error;
				} else {
					lastError = wrapFetchError(error, method, path, url, timeout);
				}

				if (attempt < this.maxRetries) {
					await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 500));
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

	private buildHeaders(extra?: Record<string, string>): Record<string, string> {
		const headers: Record<string, string> = {
			...this.defaultHeaders,
			...extra,
		};
		if (this.apiKey) {
			headers["X-API-Key"] = this.apiKey;
		}
		return headers;
	}

	private async executeRequest<T>(
		method: string,
		url: string,
		headers: Record<string, string>,
		body: unknown,
		timeout: number,
		signal?: AbortSignal,
	): Promise<T> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		const response = await fetch(url, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
			signal: signal ?? controller.signal,
		});

		clearTimeout(timeoutId);

		if (response.ok) {
			if (response.status === 204) return undefined as T;
			return (await response.json()) as T;
		}

		return handleErrorResponse(response, method, url);
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

// ─── Internal Helpers ───────────────────────────────────────────────────────

async function handleErrorResponse(
	response: Response,
	method: string,
	url: string,
): Promise<never> {
	const path = new URL(url).pathname;

	if (response.status === 429) {
		const retryAfter = response.headers.get("Retry-After");
		throw new RateLimitError(`Rate limited: ${method} ${path}`, {
			retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
		});
	}

	if (response.status >= 400 && response.status < 500) {
		const errorBody = await response.text().catch(() => "Unknown error");
		throw new ApiClientError(
			`${method} ${path} failed: ${response.status} ${errorBody}`,
			{ url, method, statusCode: response.status, retryable: false },
		);
	}

	throw new ApiClientError(
		`${method} ${path} failed: ${response.status}`,
		{ url, method, statusCode: response.status, retryable: true },
	);
}

function wrapFetchError(
	error: unknown,
	method: string,
	path: string,
	url: string,
	timeout: number,
): ApiClientError {
	if (error instanceof DOMException && error.name === "AbortError") {
		return new ApiClientError(
			`${method} ${path} timed out after ${timeout}ms`,
			{ url, method, code: "API_CLIENT_TIMEOUT", statusCode: 504, retryable: true },
		);
	}

	return new ApiClientError(
		`${method} ${path} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		{
			url, method,
			code: "API_CLIENT_NETWORK_ERROR",
			statusCode: 502,
			retryable: true,
			cause: error instanceof Error ? error : undefined,
		},
	);
}

function isRetryable(error: Error): boolean {
	if (error instanceof ApiClientError) return error.retryable ?? false;
	return false;
}
