// AI (v5)
// AI (legacy)
export type {
	AIClient,
	AIConfig,
	AIProvider,
	CompletionOptions,
	CostEstimate,
	GenerateOptions,
	GenerateResult,
	LLMClient,
	LLMConfig,
	LLMResponse,
	StreamOptions,
	StreamResult,
	StructuredOptions,
	StructuredResult,
	TokenUsage,
} from "./ai/index.js";
export { createAI, createLLM } from "./ai/index.js";
// API
export type { ApiClientConfig } from "./api/index.js";
export { createApiClient } from "./api/index.js";
// Auth
export type { TenantContext } from "./auth/index.js";
export {
	createApiKeyGuard,
	getOrgId,
	getTenantContext,
	getUserId,
	requireApiKey,
} from "./auth/index.js";
// Cache
export type { CacheClient, CacheOptions } from "./cache/index.js";
export { createCache } from "./cache/index.js";
// Config
export type { ToolkitConfig, ToolkitInstances } from "./config/index.js";
export { initToolkit, parseConfig } from "./config/index.js";
// Data
export type {
	ApiResult,
	ErrorResponse,
	HealthReport,
	PaginatedResponse,
} from "./data/index.js";
// Database (v5 — replaces neon/)
export type {
	DatabaseClient,
	DatabaseConfig,
	DatabaseDriver,
	DatabaseProvider,
	DistanceMetric,
	MigrateOptions,
	MigrateResult,
	VectorSearchOptions,
	VectorSearchResult,
	VectorSearchTableOptions,
} from "./database/index.js";
export {
	createDatabase,
	detectProvider,
	getVectorColumn,
	migrate,
	vectorSearch,
	vectorSearchRaw,
} from "./database/index.js";
// Errors
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
// Health
export type { HealthCheckConfig, HealthCheckResult } from "./health/index.js";
export { createHealthCheck } from "./health/index.js";
// Observability
export type { LangfuseConfig, Logger } from "./observability/index.js";
export { createLogger, initLangfuse } from "./observability/index.js";
// Security
export type {
	AuditEvent,
	AuditLogger,
	RateLimitConfig,
	RateLimiter,
	RateLimitResult,
} from "./security/index.js";
export { createAuditLogger, createRateLimiter } from "./security/index.js";
// Storage
export type {
	FileValidationOptions,
	UploadOptions,
	UploadResult,
} from "./storage/index.js";
export {
	deleteDocument,
	listDocuments,
	uploadDocument,
	validateFile,
} from "./storage/index.js";
// Testing
export type { MockLLMOptions, MockLLMResult } from "./testing/index.js";
export { mockCache, mockDatabase, mockDb, mockLLM } from "./testing/index.js";
