/**
 * Observability — Langfuse LLM tracing + structured logger.
 *
 * @example
 * ```ts
 * import { initLangfuse, createLogger } from '@jamaalbuilds/ai-toolkit/observability';
 *
 * const langfuse = initLangfuse(); // reads from env vars
 * const logger = createLogger('rag-assistant');
 *
 * logger.info('Query processed', { tokens: 150, latencyMs: 320 });
 * ```
 */

// ─── Types ──────────────────────────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
	debug(message: string, meta?: Record<string, unknown>): void;
	info(message: string, meta?: Record<string, unknown>): void;
	warn(message: string, meta?: Record<string, unknown>): void;
	error(message: string, meta?: Record<string, unknown>): void;
}

export interface LangfuseConfig {
	publicKey?: string;
	secretKey?: string;
	baseUrl?: string;
}

// ─── Langfuse ───────────────────────────────────────────────────────────────

/**
 * Initialize Langfuse client for LLM tracing.
 *
 * Reads from env vars if not provided:
 * - LANGFUSE_PUBLIC_KEY
 * - LANGFUSE_SECRET_KEY
 * - LANGFUSE_BASE_URL (default: https://cloud.langfuse.com)
 *
 * Returns null if Langfuse is not installed or keys are missing.
 */
export function initLangfuse(config?: LangfuseConfig): unknown | null {
	const publicKey = config?.publicKey ?? process.env.LANGFUSE_PUBLIC_KEY;
	const secretKey = config?.secretKey ?? process.env.LANGFUSE_SECRET_KEY;
	const baseUrl =
		config?.baseUrl ??
		process.env.LANGFUSE_BASE_URL ??
		"https://cloud.langfuse.com";

	if (!publicKey || !secretKey) return null;

	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { Langfuse } = require("langfuse");
		return new Langfuse({ publicKey, secretKey, baseUrl });
	} catch {
		return null;
	}
}

// ─── Structured Logger ──────────────────────────────────────────────────────

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

/**
 * Create a structured logger.
 *
 * JSON output in production, human-readable in development.
 */
export function createLogger(
	service: string,
	options?: { level?: LogLevel; json?: boolean },
): Logger {
	const minLevel = LOG_LEVELS[options?.level ?? "info"];
	const isProduction =
		process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging";
	const useJson = options?.json ?? isProduction;

	function log(
		level: LogLevel,
		message: string,
		meta?: Record<string, unknown>,
	): void {
		if (LOG_LEVELS[level] < minLevel) return;

		if (useJson) {
			const entry = {
				timestamp: new Date().toISOString(),
				level,
				service,
				message,
				...meta,
			};
			console.log(JSON.stringify(entry));
		} else {
			const prefix = `[${level.toUpperCase()}] ${service}:`;
			if (meta && Object.keys(meta).length > 0) {
				console.log(prefix, message, meta);
			} else {
				console.log(prefix, message);
			}
		}
	}

	return {
		debug: (msg, meta) => log("debug", msg, meta),
		info: (msg, meta) => log("info", msg, meta),
		warn: (msg, meta) => log("warn", msg, meta),
		error: (msg, meta) => log("error", msg, meta),
	};
}
