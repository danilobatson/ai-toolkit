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
 *   return Response.json(report, { status: report.healthy ? 200 : 503 });
 * }
 * ```
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HealthCheckResult {
  name: string;
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  healthy: boolean;
  timestamp: string;
  uptime: number;
  checks: HealthCheckResult[];
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
 */
export function createHealthCheck(
  config: HealthCheckConfig,
): () => Promise<HealthReport> {
  const timeoutMs = config.timeoutMs ?? 5000;

  return async function healthCheck(): Promise<HealthReport> {
    const results: HealthCheckResult[] = [];

    for (const [name, checkFn] of Object.entries(config.checks)) {
      const start = Date.now();
      try {
        await Promise.race([
          checkFn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), timeoutMs),
          ),
        ]);
        results.push({
          name,
          healthy: true,
          latencyMs: Date.now() - start,
        });
      } catch (error) {
        results.push({
          name,
          healthy: false,
          latencyMs: Date.now() - start,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      healthy: results.every((r) => r.healthy),
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks: results,
    };
  };
}
