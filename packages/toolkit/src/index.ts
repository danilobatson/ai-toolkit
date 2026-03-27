// Core (always available)

export type { ApiClientConfig } from "./api/index.js";
export { createApiClient } from "./api/index.js";
export type { TenantContext } from "./auth/index.js";
// Auth
export {
	createApiKeyGuard,
	getOrgId,
	getTenantContext,
	getUserId,
	requireApiKey,
} from "./auth/index.js";
export type { CacheClient, CacheOptions } from "./cache/index.js";
export { createCache } from "./cache/index.js";
export type { ToolkitConfig, ToolkitInstances } from "./config/index.js";
export { initToolkit, parseConfig } from "./config/index.js";

export type {
	ApiResult,
	ErrorResponse,
	HealthReport,
	PaginatedResponse,
} from "./data/index.js";
export {
	ApiClientError,
	AuthError,
	CacheError,
	LLMError,
	RateLimitError,
	StorageError,
	ToolkitError,
	ValidationError,
} from "./errors/index.js";
export type { HealthCheckConfig, HealthCheckResult } from "./health/index.js";
// Health
export { createHealthCheck } from "./health/index.js";
export type {
	CompletionOptions,
	LLMClient,
	LLMConfig,
	LLMResponse,
} from "./llm/index.js";
// LLM
export { createLLM } from "./llm/index.js";
export type { DbClient, DbConfig } from "./neon/index.js";
// Neon
export { createDb, withTenant } from "./neon/index.js";
export type { LangfuseConfig, Logger } from "./observability/index.js";
// Observability
export { createLogger, initLangfuse } from "./observability/index.js";
export type {
	AuditEvent,
	AuditLogger,
	RateLimitConfig,
	RateLimiter,
	RateLimitResult,
} from "./security/index.js";
// Security
export { createAuditLogger, createRateLimiter } from "./security/index.js";
export type {
	FileValidationOptions,
	UploadOptions,
	UploadResult,
} from "./storage/index.js";
// Storage
export {
	deleteDocument,
	listDocuments,
	uploadDocument,
	validateFile,
} from "./storage/index.js";
export type { MockLLMOptions, MockLLMResult } from "./testing/index.js";
// Testing
export { mockCache, mockDb, mockLLM } from "./testing/index.js";
