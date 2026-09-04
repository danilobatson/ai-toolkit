import { CacheError } from "../errors/types.js";

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
	set(key: string, value: string, mode: string, ttl: number): Promise<unknown>;
	del(...keys: string[]): Promise<number>;
	keys(pattern: string): Promise<string[]>;
	quit(): Promise<string>;
}

export class RedisCacheAdapter implements CacheClient {
	private redis: RedisLike | null = null;
	private redisUrl: string;
	private defaultTtl: number;

	constructor(redisUrl: string, options?: { defaultTtl?: number }) {
		this.redisUrl = redisUrl;
		this.defaultTtl = options?.defaultTtl ?? 300;
	}

	// ioredis is a peer dependency, loaded lazily on first use since a
	// constructor cannot await. Variable indirection prevents TS from
	// resolving the peer dep.
	private async getRedis(): Promise<RedisLike> {
		if (this.redis) return this.redis;

		try {
			const ioredisPath = "ioredis";
			const { default: Redis } = (await import(ioredisPath)) as {
				default: new (
					url: string,
					options: Record<string, unknown>,
				) => RedisLike;
			};
			this.redis = new Redis(this.redisUrl, {
				maxRetriesPerRequest: 3,
				lazyConnect: true,
			});
			return this.redis;
		} catch {
			throw new CacheError(
				"Redis cache requires ioredis. Install it: yarn add ioredis",
				{ code: "CACHE_MISSING_DEPENDENCY" },
			);
		}
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
		const redis = await this.getRedis();
		const ttl = options?.ttl ?? this.defaultTtl;
		try {
			await redis.set(key, JSON.stringify(value), "EX", ttl);
		} catch (error) {
			throw new CacheError(`Cache set failed for key: ${key}`, {
				code: "CACHE_SET_FAILED",
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
