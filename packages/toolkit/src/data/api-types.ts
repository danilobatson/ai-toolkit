/**
 * Standard paginated response shape.
 * Used by all list endpoints across all projects.
 */
export interface PaginatedResponse<T> {
	data: T[];
	pagination: {
		total: number;
		page: number;
		pageSize: number;
		totalPages: number;
		hasMore: boolean;
	};
}

/**
 * Standard error response shape.
 * Matches the ToolkitError.toJSON() output.
 */
export interface ErrorResponse {
	error: {
		code: string;
		message: string;
		statusCode: number;
		retryable: boolean;
		fields?: Record<string, string>;
	};
}

/**
 * Result type for operations that can succeed or fail.
 * Avoids try/catch for expected errors (validation, not-found).
 */
export type ApiResult<T> =
	| { success: true; data: T }
	| { success: false; error: ErrorResponse["error"] };

/**
 * HealthReport is defined in health/check.ts.
 * Re-exported here for backward compatibility.
 */
export type { HealthReport } from "../health/check.js";
