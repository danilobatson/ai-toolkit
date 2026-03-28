/**
 * Health check endpoint factory.
 *
 * Creates a health check handler that reports the status of
 * all connected services (database, cache, external APIs).
 *
 * @example
 * ```ts
 * // Next.js API route
 * import { createHealthCheck } from '@jamaalbuilds/ai-toolkit/health';
 *
 * const check = createHealthCheck({
 *   checks: {
 *     database: async () => { await db.query('SELECT 1'); },
 *     cache: async () => { await cache.set('health', 'ok', { ttl: 10 }); },
 *   },
 * });
 *
 * export async function GET() {
 *   const report = await check();
 *   return Response.json(report, { status: report.status === 'healthy' ? 200 : 503 });
 * }
 * ```
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HealthCheckResult {
	status: "pass" | "fail";
	latencyMs?: number;
	message?: string;
}

/**
 * Matches the HealthReport shape from data/api-types.ts.
 * This is the wire format returned by health endpoints.
 */
export interface HealthReport {
	status: "healthy" | "degraded" | "unhealthy";
	timestamp: string;
	uptime: number;
	checks: Record<string, HealthCheckResult>;
}

export interface HealthCheckConfig {
	/** Named health check functions. Each should throw on failure. */
	checks: Record<string, () => Promise<void>>;
	/** Timeout per check in ms. Default: 5000 */
	timeoutMs?: number;
}

// ─── Factory ────────────────────────────────────────────────────────────────

const startTime = Date.now();

/**
 * Create a health check function.
 *
 * Returns an async function that runs all checks and returns a HealthReport.
 *
 * @example
 * ```ts
 * import { createHealthCheck } from '@jamaalbuilds/ai-toolkit/health';
 *
 * const check = createHealthCheck({
 *   checks: { db: async () => { await db.query('SELECT 1'); } },
 * });
 * const report = await check();
 * // report.status === 'healthy' | 'degraded' | 'unhealthy'
 * ```
 */
export function createHealthCheck(
	config: HealthCheckConfig,
): () => Promise<HealthReport> {
	const timeoutMs = config.timeoutMs ?? 5000;

	return async function healthCheck(): Promise<HealthReport> {
		const checks: Record<string, HealthCheckResult> = {};

		for (const [name, checkFn] of Object.entries(config.checks)) {
			const start = Date.now();
			try {
				await Promise.race([
					checkFn(),
					new Promise((_, reject) =>
						setTimeout(() => reject(new Error("Timeout")), timeoutMs),
					),
				]);
				checks[name] = {
					status: "pass",
					latencyMs: Date.now() - start,
				};
			} catch (error) {
				checks[name] = {
					status: "fail",
					latencyMs: Date.now() - start,
					message: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}

		const allPass = Object.values(checks).every((c) => c.status === "pass");
		const anyPass = Object.values(checks).some((c) => c.status === "pass");

		return {
			status: allPass ? "healthy" : anyPass ? "degraded" : "unhealthy",
			timestamp: new Date().toISOString(),
			uptime: Math.floor((Date.now() - startTime) / 1000),
			checks,
		};
	};
}
