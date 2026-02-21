/**
 * Security — rate limiting and audit logging.
 *
 * Rate limiter uses the toolkit CacheClient (Redis or in-memory).
 * Audit logger produces structured JSON for compliance.
 *
 * @example
 * ```ts
 * import { createRateLimiter, createAuditLogger } from '@jamaalbuilds/ai-toolkit/security';
 * import { createCache } from '@jamaalbuilds/ai-toolkit';
 *
 * const cache = createCache();
 * const limiter = createRateLimiter(cache, { max: 100, windowSeconds: 60 });
 * const audit = createAuditLogger('rag-assistant');
 *
 * // In route handler:
 * const result = await limiter.check(`user:${userId}`);
 * if (!result.allowed) throw new RateLimitError('Too many requests');
 *
 * audit.log('query_executed', { orgId, userId, resource: 'rag-search' });
 * ```
 */

import type { CacheClient } from "../cache/client.js";
import { RateLimitError } from "../errors/types.js";

// ─── Rate Limiter ───────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Max requests per window. Default: 100 */
  max?: number;
  /** Window duration in seconds. Default: 60 */
  windowSeconds?: number;
  /** Redis key prefix. Default: "ratelimit" */
  keyPrefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
}

export interface RateLimiter {
  check(identifier: string): Promise<RateLimitResult>;
  reset(identifier: string): Promise<void>;
}

export function createRateLimiter(
  cache: CacheClient,
  config?: RateLimitConfig,
): RateLimiter {
  const max = config?.max ?? 100;
  const windowSeconds = config?.windowSeconds ?? 60;
  const prefix = config?.keyPrefix ?? "ratelimit";

  return {
    async check(identifier: string): Promise<RateLimitResult> {
      const key = `${prefix}:${identifier}`;
      const now = Date.now();

      try {
        const current = await cache.get<number>(key);
        const count = current ?? 0;

        if (count >= max) {
          return {
            allowed: false,
            remaining: 0,
            limit: max,
            resetAt: now + windowSeconds * 1000,
          };
        }

        await cache.set(key, count + 1, { ttl: windowSeconds });

        return {
          allowed: true,
          remaining: max - count - 1,
          limit: max,
          resetAt: now + windowSeconds * 1000,
        };
      } catch {
        // Fail open — allow the request if cache is down
        return { allowed: true, remaining: max, limit: max, resetAt: now + windowSeconds * 1000 };
      }
    },

    async reset(identifier: string): Promise<void> {
      await cache.invalidate(`${prefix}:${identifier}`);
    },
  };
}

// ─── Audit Logger ───────────────────────────────────────────────────────────

export interface AuditEvent {
  action: string;
  orgId?: string;
  userId?: string;
  resource?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogger {
  log(action: string, event?: Omit<AuditEvent, "action">): void;
  logAccess(params: { orgId: string; userId: string; resource: string }): void;
}

export function createAuditLogger(serviceName: string): AuditLogger {
  return {
    log(action: string, event?: Omit<AuditEvent, "action">): void {
      const entry = {
        service: serviceName,
        action,
        timestamp: new Date().toISOString(),
        ...event,
      };
      // Structured JSON to stdout — compatible with CloudWatch, Datadog, etc.
      console.log(JSON.stringify(entry));
    },

    logAccess({ orgId, userId, resource }): void {
      this.log("data_accessed", { orgId, userId, resource });
    },
  };
}
