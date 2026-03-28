/**
 * Auth middleware — Neon Auth session helpers + API key validation.
 *
 * Neon Auth handles actual authentication on the frontend.
 * This module provides backend middleware for:
 * - Extracting org_id / user_id from request headers (set by BFF)
 * - Validating API keys for service-to-service auth
 * - Multi-tenant context for database queries
 *
 * @example
 * ```ts
 * // Next.js API route
 * import { getOrgId, requireApiKey } from '@jamaalbuilds/ai-toolkit/auth';
 *
 * export async function GET(request: Request) {
 *   const orgId = getOrgId(request);    // throws 401 if missing
 *   const docs = await db.query('SELECT * FROM documents WHERE org_id = $1', [orgId]);
 *   return Response.json(docs);
 * }
 *
 * // NestJS guard
 * import { createApiKeyGuard } from '@jamaalbuilds/ai-toolkit/auth';
 * const ApiKeyGuard = createApiKeyGuard(process.env.API_KEY!);
 * ```
 */

import { timingSafeEqual } from "node:crypto";
import { AuthError } from "../errors/types.js";

// ─── Header Extraction ──────────────────────────────────────────────────────

/** Extract a header value from a Request or headers-like object. */
function getHeader(
	request: Request | { headers: Record<string, string | undefined> },
	name: string,
): string | undefined {
	if (request instanceof Request) {
		return request.headers.get(name) ?? undefined;
	}
	// Plain object with headers (e.g., Express req, NestJS)
	const headers = request.headers;
	return headers[name] ?? headers[name.toLowerCase()];
}

/**
 * Extract org_id from X-Org-Id header. Throws AuthError if missing.
 *
 * @example
 * ```ts
 * const orgId = getOrgId(request); // 'org_abc123'
 * ```
 */
export function getOrgId(
	request: Request | { headers: Record<string, string | undefined> },
): string {
	const orgId = getHeader(request, "x-org-id");
	if (!orgId) {
		throw new AuthError("Missing X-Org-Id header", {
			code: "AUTH_MISSING_ORG",
			statusCode: 401,
		});
	}
	return orgId;
}

/**
 * Extract user_id from X-User-Id header. Returns undefined if missing.
 *
 * @example
 * ```ts
 * const userId = getUserId(request); // 'usr_xyz' | undefined
 * ```
 */
export function getUserId(
	request: Request | { headers: Record<string, string | undefined> },
): string | undefined {
	return getHeader(request, "x-user-id");
}

/**
 * Validate API key from Authorization header or X-API-Key header.
 * Throws AuthError if invalid.
 *
 * @example
 * ```ts
 * const key = requireApiKey(request); // validated API key string
 * ```
 */
export function requireApiKey(
	request: Request | { headers: Record<string, string | undefined> },
	expectedKey?: string,
): string {
	const expected =
		expectedKey ?? process.env.API_KEY ?? process.env.BACKEND_API_KEY;
	if (!expected) {
		throw new AuthError("API_KEY not configured", {
			code: "AUTH_NO_KEY_CONFIGURED",
			statusCode: 500,
		});
	}

	const authHeader = getHeader(request, "authorization") ?? "";
	const apiKeyHeader = getHeader(request, "x-api-key");
	const token = apiKeyHeader ?? authHeader.replace(/^Bearer\s+/i, "").trim();

	if (!token) {
		throw new AuthError("Invalid API key", {
			code: "AUTH_INVALID_KEY",
			statusCode: 401,
		});
	}

	const tokenBuffer = Buffer.from(token);
	const expectedBuffer = Buffer.from(expected);
	if (
		tokenBuffer.length !== expectedBuffer.length ||
		!timingSafeEqual(tokenBuffer, expectedBuffer)
	) {
		throw new AuthError("Invalid API key", {
			code: "AUTH_INVALID_KEY",
			statusCode: 401,
		});
	}

	return token;
}

/**
 * Create a NestJS-compatible guard class for API key validation.
 *
 * @example
 * ```ts
 * const ApiKeyGuard = createApiKeyGuard(process.env.API_KEY!);
 *
 * @UseGuards(ApiKeyGuard)
 * @Controller('api')
 * export class ApiController { ... }
 * ```
 */
export function createApiKeyGuard(expectedKey: string) {
	return class ApiKeyGuard {
		canActivate(context: {
			switchToHttp: () => {
				getRequest: () => { headers: Record<string, string | undefined> };
			};
		}): boolean {
			const request = context.switchToHttp().getRequest();
			requireApiKey(request, expectedKey);
			return true;
		}
	};
}

/**
 * Tenant context — extract and validate multi-tenant headers.
 * Convenience for routes that need both org and user.
 */
export interface TenantContext {
	orgId: string;
	userId?: string;
}

/**
 * Extract tenant context (org + user) from request headers.
 *
 * @example
 * ```ts
 * const { orgId, userId } = getTenantContext(request);
 * ```
 */
export function getTenantContext(
	request: Request | { headers: Record<string, string | undefined> },
): TenantContext {
	return {
		orgId: getOrgId(request),
		userId: getUserId(request),
	};
}
