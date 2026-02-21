import { ToolkitError } from "./base.js";

/** LLM provider returned an error (rate limit, invalid request, server error) */
export class LLMError extends ToolkitError {
  /** Which provider failed (anthropic, openai) */
  readonly provider: string;

  /** Which model was requested */
  readonly model?: string;

  constructor(
    message: string,
    options: {
      provider: string;
      model?: string;
      code?: string;
      statusCode?: number;
      retryable?: boolean;
      cause?: Error;
    },
  ) {
    super(message, {
      code: options.code ?? "LLM_ERROR",
      statusCode: options.statusCode ?? 502,
      retryable: options.retryable ?? false,
      cause: options.cause,
    });
    this.name = "LLMError";
    this.provider = options.provider;
    this.model = options.model;
  }
}

/** Rate limit exceeded (LLM provider or application-level) */
export class RateLimitError extends ToolkitError {
  /** Seconds until the rate limit resets */
  readonly retryAfter?: number;

  constructor(
    message: string,
    options: {
      retryAfter?: number;
      code?: string;
      cause?: Error;
    } = {},
  ) {
    super(message, {
      code: options.code ?? "RATE_LIMITED",
      statusCode: 429,
      retryable: true,
      cause: options.cause,
    });
    this.name = "RateLimitError";
    this.retryAfter = options.retryAfter;
  }
}

/** Authentication or authorization failure */
export class AuthError extends ToolkitError {
  constructor(
    message: string,
    options: {
      code?: string;
      statusCode?: number;
      cause?: Error;
    } = {},
  ) {
    super(message, {
      code: options.code ?? "AUTH_ERROR",
      statusCode: options.statusCode ?? 401,
      retryable: false,
      cause: options.cause,
    });
    this.name = "AuthError";
  }
}

/** Input validation failed (Zod parse, schema mismatch) */
export class ValidationError extends ToolkitError {
  /** Which fields failed validation */
  readonly fields?: Record<string, string>;

  constructor(
    message: string,
    options: {
      fields?: Record<string, string>;
      code?: string;
      cause?: Error;
    } = {},
  ) {
    super(message, {
      code: options.code ?? "VALIDATION_ERROR",
      statusCode: 400,
      retryable: false,
      cause: options.cause,
    });
    this.name = "ValidationError";
    this.fields = options.fields;
  }
}

/** Storage operation failed (Vercel Blob, file system) */
export class StorageError extends ToolkitError {
  constructor(
    message: string,
    options: {
      code?: string;
      statusCode?: number;
      retryable?: boolean;
      cause?: Error;
    } = {},
  ) {
    super(message, {
      code: options.code ?? "STORAGE_ERROR",
      statusCode: options.statusCode ?? 502,
      retryable: options.retryable ?? true,
      cause: options.cause,
    });
    this.name = "StorageError";
  }
}

/** Cache operation failed (Redis connection, serialization) */
export class CacheError extends ToolkitError {
  constructor(
    message: string,
    options: {
      code?: string;
      cause?: Error;
    } = {},
  ) {
    super(message, {
      code: options.code ?? "CACHE_ERROR",
      statusCode: 500,
      retryable: true,
      cause: options.cause,
    });
    this.name = "CacheError";
  }
}

/** External API call failed (BFF → backend, third-party APIs) */
export class ApiClientError extends ToolkitError {
  /** The URL that was called */
  readonly url: string;

  /** HTTP method used */
  readonly method: string;

  constructor(
    message: string,
    options: {
      url: string;
      method: string;
      code?: string;
      statusCode?: number;
      retryable?: boolean;
      cause?: Error;
    },
  ) {
    super(message, {
      code: options.code ?? "API_CLIENT_ERROR",
      statusCode: options.statusCode ?? 502,
      retryable: options.retryable ?? false,
      cause: options.cause,
    });
    this.name = "ApiClientError";
    this.url = options.url;
    this.method = options.method;
  }
}
