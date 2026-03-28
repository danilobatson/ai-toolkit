/**
 * Structured logger — absorbed from observability/ module.
 *
 * JSON output in production, human-readable in development.
 *
 * @example
 * ```ts
 * import { createLogger } from '@jamaalbuilds/ai-toolkit/monitor';
 *
 * const logger = createLogger('rag-assistant');
 * logger.info('Query processed', { tokens: 150, latencyMs: 320 });
 * ```
 */

import { ValidationError } from "../errors/index.js";
import type { Logger, LogLevel } from "./types.js";

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

const VALID_LEVELS = new Set<string>(["debug", "info", "warn", "error"]);

/**
 * Create a structured logger with service name.
 *
 * JSON output in production/staging, human-readable in development.
 *
 * @param service - Service or module name for log context.
 * @param options - Optional log level and format overrides.
 * @returns A Logger instance with debug/info/warn/error methods.
 *
 * @example
 * ```ts
 * const logger = createLogger('rag-assistant', { level: 'debug' });
 * logger.debug('Embedding query', { queryLength: 42 });
 * logger.info('Query processed', { tokens: 150 });
 * logger.warn('Rate limit approaching', { remaining: 5 });
 * logger.error('Provider failed', { provider: 'openai', code: 502 });
 * ```
 */
export function createLogger(
	service: string,
	options?: { level?: LogLevel; json?: boolean },
): Logger {
	if (!service || typeof service !== "string") {
		throw new ValidationError(
			"createLogger requires a non-empty service name",
			{
				fields: { service: "must be a non-empty string" },
			},
		);
	}

	const levelStr = options?.level ?? "info";
	if (!VALID_LEVELS.has(levelStr)) {
		throw new ValidationError(
			`Invalid log level "${levelStr}". Must be one of: debug, info, warn, error`,
			{ fields: { level: `"${levelStr}" is not a valid log level` } },
		);
	}

	const minLevel = LOG_LEVELS[levelStr];
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
