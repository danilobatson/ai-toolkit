/**
 * Testing utilities — mock factories for unit tests.
 *
 * Provides mock implementations of toolkit interfaces so
 * you can test without real LLMs, Redis, databases, etc.
 *
 * @example
 * ```ts
 * import { mockCache, mockLLM, mockDb } from '@jamaalbuilds/ai-toolkit/testing';
 *
 * test('processes query', async () => {
 *   const cache = mockCache();
 *   const llm = mockLLM({ response: 'Metformin is recommended.' });
 *   const db = mockDb([{ id: 1, content: 'Metformin treats diabetes.' }]);
 *
 *   const result = await processQuery('treatment for diabetes', { cache, llm, db });
 *   expect(result).toContain('Metformin');
 * });
 * ```
 */

import type { CacheClient, CacheOptions } from "../cache/client.js";
import type { DbClient } from "../neon/db.js";

// ─── Mock Cache ─────────────────────────────────────────────────────────────

/**
 * In-memory mock cache for testing.
 * Tracks all calls for assertions.
 */
export function mockCache(initial?: Record<string, unknown>): CacheClient & {
  _store: Map<string, unknown>;
  _calls: Array<{ method: string; args: unknown[] }>;
} {
  const store = new Map<string, unknown>(
    Object.entries(initial ?? {}),
  );
  const calls: Array<{ method: string; args: unknown[] }> = [];

  return {
    _store: store,
    _calls: calls,

    async get<T = unknown>(key: string): Promise<T | null> {
      calls.push({ method: "get", args: [key] });
      return (store.get(key) as T) ?? null;
    },

    async set<T = unknown>(key: string, value: T, options?: CacheOptions): Promise<void> {
      calls.push({ method: "set", args: [key, value, options] });
      store.set(key, value);
    },

    async invalidate(key: string): Promise<void> {
      calls.push({ method: "invalidate", args: [key] });
      store.delete(key);
    },

    async invalidatePrefix(prefix: string): Promise<void> {
      calls.push({ method: "invalidatePrefix", args: [prefix] });
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key);
      }
    },

    async disconnect(): Promise<void> {
      calls.push({ method: "disconnect", args: [] });
      store.clear();
    },
  };
}

// ─── Mock LLM ───────────────────────────────────────────────────────────────

export interface MockLLMOptions {
  /** Fixed response to return for every call */
  response?: string;
  /** Sequence of responses — cycles through them */
  responses?: string[];
  /** Simulate latency in ms. Default: 0 */
  latencyMs?: number;
  /** Throw this error on the Nth call (0-indexed) */
  failOnCall?: number;
}

export interface MockLLMResult {
  complete(prompt: string, options?: { system?: string }): Promise<{
    content: string;
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    latencyMs: number;
  }>;
  _calls: Array<{ prompt: string; system?: string }>;
  _callCount: number;
}

export function mockLLM(options?: MockLLMOptions): MockLLMResult {
  const responses = options?.responses ?? [options?.response ?? "Mock LLM response."];
  const latency = options?.latencyMs ?? 0;
  let callCount = 0;
  const calls: Array<{ prompt: string; system?: string }> = [];

  return {
    _calls: calls,
    get _callCount() { return callCount; },

    async complete(prompt: string, opts?: { system?: string }) {
      calls.push({ prompt, system: opts?.system });

      if (options?.failOnCall === callCount) {
        callCount++;
        throw new Error(`Mock LLM failure on call ${callCount - 1}`);
      }

      if (latency > 0) {
        await new Promise((r) => setTimeout(r, latency));
      }

      const content = responses[callCount % responses.length];
      callCount++;

      return {
        content,
        model: "mock-v1",
        provider: "mock",
        inputTokens: prompt.length,
        outputTokens: content.length,
        cost: 0.001,
        latencyMs: latency,
      };
    },
  };
}

// ─── Mock Database ──────────────────────────────────────────────────────────

/**
 * Mock database client for testing.
 * Returns provided rows for any query.
 */
export function mockDb(
  rows?: Record<string, unknown>[],
): DbClient & { _queries: Array<{ sql: string; params?: unknown[] }> } {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const defaultRows = rows ?? [];

  return {
    _queries: queries,

    async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
      queries.push({ sql, params });
      return defaultRows as T[];
    },

    async queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
      queries.push({ sql, params });
      return (defaultRows[0] as T) ?? null;
    },

    async end(): Promise<void> {},
  };
}
