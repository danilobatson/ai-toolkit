/**
 * Standard paginated response shape.
 * Used by all list endpoints across all projects.
 *
 * @example
 * ```ts
 * const response: PaginatedResponse<User> = {
 *   data: [{ id: 1, name: 'Alice' }],
 *   pagination: { total: 50, page: 1, pageSize: 10, totalPages: 5, hasMore: true },
 * };
 * ```
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
 *
 * @example
 * ```ts
 * const err: ErrorResponse = {
 *   error: { code: 'NOT_FOUND', message: 'User not found', statusCode: 404, retryable: false },
 * };
 * ```
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
 *
 * @example
 * ```ts
 * const result: ApiResult<User> = { success: true, data: { id: 1, name: 'Alice' } };
 * if (result.success) console.log(result.data.name);
 * ```
 */
export type ApiResult<T> =
	| { success: true; data: T }
	| { success: false; error: ErrorResponse["error"] };

/**
 * HealthReport is defined in health/check.ts.
 * Re-exported here for backward compatibility.
 */
export type { HealthReport } from "../health/check.js";
