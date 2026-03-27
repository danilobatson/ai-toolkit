/**
 * Base error class for the AI Toolkit.
 *
 * Every module wraps underlying errors (AxiosError, AnthropicError, etc.)
 * into this hierarchy. Callers handle one error type, not ten.
 */
export class ToolkitError extends Error {
	/** Machine-readable error code (e.g., 'LLM_RATE_LIMITED', 'AUTH_INVALID_KEY') */
	readonly code: string;

	/** HTTP status code to return to the client */
	readonly statusCode: number;

	/** Whether the operation can be safely retried */
	readonly retryable: boolean;

	/** The original error that caused this one */
	readonly cause?: Error;

	constructor(
		message: string,
		options: {
			code: string;
			statusCode?: number;
			retryable?: boolean;
			cause?: Error;
		},
	) {
		super(message);
		this.name = "ToolkitError";
		this.code = options.code;
		this.statusCode = options.statusCode ?? 500;
		this.retryable = options.retryable ?? false;
		this.cause = options.cause;

		// Maintains proper stack trace in V8
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	/** Serialize for structured logging */
	toJSON() {
		return {
			name: this.name,
			message: this.message,
			code: this.code,
			statusCode: this.statusCode,
			retryable: this.retryable,
			cause: this.cause?.message,
		};
	}
}
