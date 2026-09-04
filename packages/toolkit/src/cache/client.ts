import { CacheError } from "../errors/types.js";

// Node's ESM resolver (and CJS require, for the rare transpiled consumer)
// tags an unresolvable specifier with one of these codes. Any other error
// means the module exists but failed to load — a different problem with a
// different fix.
function isMissingModuleError(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException | undefined)?.code;
	return code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND";
}

/**
 * Options for cache operations.
 *
 * @example
 * ```ts
 * await cache.set('key', value, { ttl: 600 }); // 10 minutes
 * ```
 */
export interface CacheOptions {
	/** Time-to-live in seconds. Default: 300 (5 minutes) */
	ttl?: number;
}

/**
 * Cache client interface for get/set/invalidate operations.
 *
 * @example
 * ```ts
 * const cache: CacheClient = createCache();
 * await cache.set('user:1', { name: 'Alice' }, { ttl: 300 });
 * const user = await cache.get<{ name: string }>('user:1');
 * ```
 */
export interface CacheClient {
	get<T = unknown>(key: string): Promise<T | null>;
	set<T = unknown>(
		key: string,
		value: T,
		options?: CacheOptions,
	): Promise<void>;
	/**
	 * Atomically increment a numeric counter and return the new value.
	 * The TTL is applied only when the counter is created (first increment
	 * in the window); later increments do not extend it.
	 *
	 * Required for correct concurrent rate limiting — a read-then-write
	 * (`get` then `set`) is not atomic and lets concurrent callers race
	 * past the same count.
	 */
	incr(key: string, options?: CacheOptions): Promise<number>;
	invalidate(key: string): Promise<void>;
	invalidatePrefix(prefix: string): Promise<void>;
	disconnect(): Promise<void>;
}

/**
 * In-memory cache adapter for development and testing.
 * Uses a Map with TTL tracking. No external dependencies.
 *
 * @example
 * ```ts
 * const cache = new MemoryCacheAdapter({ defaultTtl: 60 });
 * await cache.set('key', 'value');
 * ```
 */
export class MemoryCacheAdapter implements CacheClient {
	private store = new Map<string, { value: string; expiresAt: number }>();
	private defaultTtl: number;

	constructor(options?: { defaultTtl?: number }) {
		this.defaultTtl = options?.defaultTtl ?? 300;
	}

	async get<T = unknown>(key: string): Promise<T | null> {
		const entry = this.store.get(key);
		if (!entry) return null;

		if (Date.now() > entry.expiresAt) {
			this.store.delete(key);
			return null;
		}

		return JSON.parse(entry.value) as T;
	}

	async set<T = unknown>(
		key: string,
		value: T,
		options?: CacheOptions,
	): Promise<void> {
		const ttl = options?.ttl ?? this.defaultTtl;
		this.store.set(key, {
			value: JSON.stringify(value),
			expiresAt: Date.now() + ttl * 1000,
		});
	}

	async incr(key: string, options?: CacheOptions): Promise<number> {
		// No `await` before the write below — the whole body runs to
		// completion in one microtask, so concurrent callers can't
		// interleave between the read and the write.
		const ttl = options?.ttl ?? this.defaultTtl;
		const now = Date.now();
		const entry = this.store.get(key);
		const isFresh = !entry || now > entry.expiresAt;
		const count = isFresh ? 1 : (JSON.parse(entry.value) as number) + 1;

		this.store.set(key, {
			value: JSON.stringify(count),
			expiresAt: isFresh ? now + ttl * 1000 : entry.expiresAt,
		});

		return count;
	}

	async invalidate(key: string): Promise<void> {
		this.store.delete(key);
	}

	async invalidatePrefix(prefix: string): Promise<void> {
		for (const key of this.store.keys()) {
			if (key.startsWith(prefix)) {
				this.store.delete(key);
			}
		}
	}

	async disconnect(): Promise<void> {
		this.store.clear();
	}
}

/**
 * Redis cache adapter for production.
 * Requires ioredis as a peer dependency.
 */
interface RedisLike {
	get(key: string): Promise<string | null>;
	set(
		key: string,
		value: string,
		mode: string,
		ttl: number,
	): Promise<unknown>;
	del(...keys: string[]): Promise<number>;
	keys(pattern: string): Promise<string[]>;
	eval(
		script: string,
		numKeys: number,
		...args: Array<string | number>
	): Promise<unknown>;
	quit(): Promise<string>;
}

export class RedisCacheAdapter implements CacheClient {
	private redis: RedisLike | undefined;
	private ready: Promise<void>;
	private defaultTtl: number;

	constructor(redisUrl: string, options?: { defaultTtl?: number }) {
		this.defaultTtl = options?.defaultTtl ?? 300;
		this.ready = this.connect(redisUrl);
		// Avoid unhandled rejection noise if the adapter is constructed but
		// never used before the missing-dependency failure is reported.
		this.ready.catch(() => {});
	}

	private async connect(redisUrl: string): Promise<void> {
		try {
			// ioredis is a peer dependency — fail clearly if missing
			// Variable indirection prevents TS from resolving the peer dep
			const ioredisPath = "ioredis";
			const mod = await import(ioredisPath);
			const Redis = mod.default ?? mod;
			this.redis = new Redis(redisUrl, {
				maxRetriesPerRequest: 3,
				lazyConnect: true,
			});
		} catch (error) {
			if (isMissingModuleError(error)) {
				throw new CacheError(
					"Redis cache requires ioredis. Install it: yarn add ioredis",
					{
						code: "CACHE_MISSING_DEPENDENCY",
						cause: error instanceof Error ? error : undefined,
					},
				);
			}
			throw new CacheError(
				`Failed to load ioredis: ${error instanceof Error ? error.message : "Unknown error"}`,
				{
					code: "CACHE_LOAD_FAILED",
					cause: error instanceof Error ? error : undefined,
				},
			);
		}
	}

	private async getRedis(): Promise<RedisLike> {
		await this.ready;
		return this.redis as RedisLike;
	}

	async get<T = unknown>(key: string): Promise<T | null> {
		const redis = await this.getRedis();
		try {
			const value = await redis.get(key);
			if (!value) return null;
			return JSON.parse(value) as T;
		} catch (error) {
			throw new CacheError(`Cache get failed for key: ${key}`, {
				code: "CACHE_GET_FAILED",
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	async set<T = unknown>(
		key: string,
		value: T,
		options?: CacheOptions,
	): Promise<void> {
		const ttl = options?.ttl ?? this.defaultTtl;
		const redis = await this.getRedis();
		try {
			await redis.set(key, JSON.stringify(value), "EX", ttl);
		} catch (error) {
			throw new CacheError(`Cache set failed for key: ${key}`, {
				code: "CACHE_SET_FAILED",
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	async incr(key: string, options?: CacheOptions): Promise<number> {
		const ttl = options?.ttl ?? this.defaultTtl;
		const redis = await this.getRedis();
		try {
			// INCR + EXPIRE run as a single Redis-side script, so the
			// read-modify-write is atomic even across processes. EXPIRE only
			// fires on the first increment so later increments don't extend
			// the window.
			const result = await redis.eval(
				`local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count`,
				1,
				key,
				ttl,
			);
			return Number(result);
		} catch (error) {
			throw new CacheError(`Cache incr failed for key: ${key}`, {
				code: "CACHE_INCR_FAILED",
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	async invalidate(key: string): Promise<void> {
		const redis = await this.getRedis();
		try {
			await redis.del(key);
		} catch (error) {
			throw new CacheError(`Cache invalidate failed for key: ${key}`, {
				code: "CACHE_INVALIDATE_FAILED",
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	async invalidatePrefix(prefix: string): Promise<void> {
		const redis = await this.getRedis();
		try {
			const keys = await redis.keys(`${prefix}*`);
			if (keys.length > 0) {
				await redis.del(...keys);
			}
		} catch (error) {
			throw new CacheError(`Cache invalidatePrefix failed for: ${prefix}`, {
				code: "CACHE_INVALIDATE_PREFIX_FAILED",
				cause: error instanceof Error ? error : undefined,
			});
		}
	}

	async disconnect(): Promise<void> {
		const redis = await this.getRedis();
		await redis.quit();
	}
}

/**
 * Create a cache client.
 *
 * Uses Redis if REDIS_URL is provided, otherwise falls back to in-memory.
 * The in-memory adapter is fine for development and testing.
 *
 * @example
 * ```ts
 * const cache = createCache(); // auto-detects Redis vs memory
 *
 * await cache.set('user:123', { name: 'Danilo' }, { ttl: 300 });
 * const user = await cache.get<User>('user:123');
 * await cache.invalidate('user:123');
 * await cache.invalidatePrefix('user:');
 * ```
 */
export function createCache(options?: {
	redisUrl?: string;
	defaultTtl?: number;
}): CacheClient {
	const redisUrl = options?.redisUrl ?? process.env.REDIS_URL;

	if (redisUrl) {
		return new RedisCacheAdapter(redisUrl, {
			defaultTtl: options?.defaultTtl,
		});
	}

	return new MemoryCacheAdapter({ defaultTtl: options?.defaultTtl });
}
