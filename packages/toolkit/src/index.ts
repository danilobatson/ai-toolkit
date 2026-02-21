// Core (always available)
export { initToolkit, parseConfig } from "./config/index.js";
export type { ToolkitConfig, ToolkitInstances } from "./config/index.js";

export { ToolkitError } from "./errors/index.js";
export {
  LLMError,
  RateLimitError,
  AuthError,
  ValidationError,
  StorageError,
  CacheError,
  ApiClientError,
} from "./errors/index.js";

export { createCache } from "./cache/index.js";
export type { CacheClient, CacheOptions } from "./cache/index.js";

export { createApiClient } from "./api/index.js";
export type { ApiClientConfig } from "./api/index.js";

export type {
  PaginatedResponse,
  ErrorResponse,
  ApiResult,
  HealthReport,
} from "./data/index.js";

// Auth
export {
  getOrgId,
  getUserId,
  requireApiKey,
  createApiKeyGuard,
  getTenantContext,
} from "./auth/index.js";
export type { TenantContext } from "./auth/index.js";

// Security
export { createRateLimiter, createAuditLogger } from "./security/index.js";
export type {
  RateLimitConfig,
  RateLimitResult,
  RateLimiter,
  AuditEvent,
  AuditLogger,
} from "./security/index.js";

// LLM
export { createLLM } from "./llm/index.js";
export type { LLMClient, LLMConfig, LLMResponse, CompletionOptions } from "./llm/index.js";

// Storage
export { validateFile, uploadDocument, deleteDocument, listDocuments } from "./storage/index.js";
export type { FileValidationOptions, UploadOptions, UploadResult } from "./storage/index.js";

// Neon
export { createDb, withTenant } from "./neon/index.js";
export type { DbClient, DbConfig } from "./neon/index.js";

// Observability
export { initLangfuse, createLogger } from "./observability/index.js";
export type { Logger, LangfuseConfig } from "./observability/index.js";

// Health
export { createHealthCheck } from "./health/index.js";
export type { HealthCheckConfig, HealthCheckResult } from "./health/index.js";

// Testing
export { mockCache, mockLLM, mockDb } from "./testing/index.js";
export type { MockLLMOptions, MockLLMResult } from "./testing/index.js";
