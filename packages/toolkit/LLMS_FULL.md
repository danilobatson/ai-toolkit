# @jamaalbuilds/ai-toolkit — Complete API Reference

Unified TypeScript SDK for AI-powered applications. Wraps Vercel AI SDK, LangChain.js, LangGraph.js, LlamaIndex.js, Langfuse, Inngest, MCP SDK, and Drizzle ORM behind one consistent API.

Package: `@jamaalbuilds/ai-toolkit`
Runtime: Node.js 18+, ESM-only
Package manager: yarn (recommended)

## Install

```bash
yarn add @jamaalbuilds/ai-toolkit
```

---

## Module: ai

Import: `@jamaalbuilds/ai-toolkit/ai`
Wraps: Vercel AI SDK
Peer deps: `ai`, plus one provider SDK (`@ai-sdk/groq`, `@openrouter/ai-sdk-provider`, `@ai-sdk/anthropic`, `@ai-sdk/openai`)

### Functions

```ts
function createAI(config?: AIConfig): AIClient
function createLLM(config?: LLMConfig): LLMClient
```

### Types

```ts
type AIProvider = "groq" | "openrouter" | "anthropic" | "openai"

interface AIConfig {
  provider?: AIProvider
  fallbackProvider?: AIProvider
  model?: string
  fallbackModel?: string
  apiKey?: string
  fallbackApiKey?: string
  maxRequestsPerMinute?: number
  maxTokensPerDay?: number
}

interface AIClient {
  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult>
  stream(prompt: string, options?: StreamOptions): Promise<StreamResult>
  structured<T extends z.ZodType>(prompt: string, options: StructuredOptions<T>): Promise<StructuredResult<z.infer<T>>>
  readonly provider: string
  readonly model: string
}

interface GenerateOptions {
  system?: string
  temperature?: number
  maxTokens?: number
  stopSequences?: string[]
  abortSignal?: AbortSignal
}

interface StreamOptions extends GenerateOptions {
  onChunk?: (chunk: string) => void
}

interface StructuredOptions<T extends z.ZodType> extends GenerateOptions {
  schema: T
  schemaName?: string
  schemaDescription?: string
}

interface GenerateResult {
  text: string
  model: string
  provider: string
  usedFallback: boolean
  usage: TokenUsage
  cost: CostEstimate
  latencyMs: number
  finishReason: string
}

interface StreamResult {
  textStream: AsyncIterable<string>
  text: Promise<string>
  usage: Promise<TokenUsage>
  provider: string
  usedFallback: boolean
}

interface StructuredResult<T> {
  object: T
  model: string
  provider: string
  usedFallback: boolean
  usage: TokenUsage
  cost: CostEstimate
  latencyMs: number
}

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

interface CostEstimate {
  inputCost: number
  outputCost: number
  totalCost: number
  currency: "USD"
}

interface LLMConfig {
  provider?: "anthropic" | "openai"
  model?: string
  apiKey?: string
}

interface LLMClient {
  complete(prompt: string, options?: CompletionOptions): Promise<LLMResponse>
  readonly provider: string
  readonly model: string
}

interface LLMResponse {
  content: string
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  cost: number
  latencyMs: number
}
```

### Example

```ts
import { createAI } from '@jamaalbuilds/ai-toolkit/ai';

const ai = createAI({ provider: 'groq', fallbackProvider: 'openrouter' });
const result = await ai.generate('Explain TypeScript generics', {
  system: 'You are a helpful teacher.',
  temperature: 0.7,
  maxTokens: 500,
});
console.log(result.text);
console.log(result.cost.totalCost); // USD

const stream = await ai.stream('Write a haiku');
for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}
```

---

## Module: chain

Import: `@jamaalbuilds/ai-toolkit/chain`
Wraps: LangChain.js
Peer deps: `@langchain/core`, `@langchain/textsplitters`

### Functions

```ts
function prompt(config: PromptConfig | string): PromptTemplate
function parse<T = unknown>(config: ParseConfig<T> | z.ZodType<T>): Parser<T>
function createChain<TInput, TOutput>(config: ChainConfig): Chain<TInput, TOutput>
function rag(config: RAGConfig): Chain<{ question: string }, RAGResult>
function createSplitter(config?: SplitterConfig): Splitter
function createLanguageSplitter(language: SplitterLanguage, config?: SplitterConfig): Promise<Splitter>
```

### Types

```ts
interface PromptConfig {
  template: string | [role: ChatMessage["role"], template: string][]
  inputVariables?: string[]
}

interface PromptTemplate {
  format(values: Record<string, string>): Promise<string>
  formatMessages(values: Record<string, string>): Promise<ChatMessage[]>
  readonly inputVariables: string[]
}

interface ParseConfig<T> {
  schema: z.ZodType<T>
  name?: string
}

interface Parser<T> {
  parse(text: string): Promise<T>
  getFormatInstructions(): string
}

interface SplitterConfig {
  chunkSize?: number
  chunkOverlap?: number
  separators?: string[]
  keepSeparator?: boolean
}

type SplitterLanguage = "cpp" | "go" | "java" | "js" | "php" | "python" | "ruby" | "rust" | "scala" | "swift" | "markdown" | "latex" | "html"

interface Splitter {
  split(text: string): Promise<string[]>
  splitDocuments(docs: ChainDocument[]): Promise<ChainDocument[]>
}

interface ChainDocument {
  content: string
  metadata: Record<string, unknown>
}

interface ChatMessage {
  role: "system" | "human" | "ai"
  content: string
}

type ChainStep<TIn, TOut> = ((input: TIn) => TOut | Promise<TOut>) | { name: string; transform: (input: TIn) => TOut | Promise<TOut> }

interface ChainConfig {
  steps: ChainStep[]
  name?: string
}

interface Chain<TInput, TOutput> {
  invoke(input: TInput): Promise<TOutput>
  readonly name: string
  readonly length: number
}

interface RAGConfig {
  retriever: Retriever
  promptTemplate: string
  model: (messages: string) => Promise<string>
  formatDocs?: (docs: ChainDocument[]) => string
}

interface RAGResult {
  answer: string
  sources: ChainDocument[]
}
```

### Example

```ts
import { prompt, parse, createChain } from '@jamaalbuilds/ai-toolkit/chain';
import { z } from 'zod';

const template = prompt({ template: 'Extract data from: {text}' });
const parser = parse(z.object({ name: z.string(), age: z.number() }));

const chain = createChain({
  steps: [
    (input) => template.format(input),
    async (formatted) => callLLM(formatted),
    (response) => parser.parse(response),
  ],
});
const result = await chain.invoke({ text: 'John is 30' });
```

---

## Module: agents

Import: `@jamaalbuilds/ai-toolkit/agents`
Wraps: LangGraph.js
Peer deps: `@langchain/langgraph`, `@langchain/core`

### Functions

```ts
function createAgent(config: AgentConfig): AgentNode
function createGraph(config: GraphConfig): Promise<GraphInstance>
function route(condition: RouteCondition, destinations?: string[]): RouteResult
```

### Types

```ts
interface AgentNode {
  name: string
  systemPrompt: string
  model?: string
  tools?: Record<string, unknown>[]
  handler: (state: GraphState) => Promise<Partial<GraphState>>
}

interface GraphState {
  messages: GraphMessage[]
  currentAgent?: string
  metadata?: Record<string, unknown>
}

interface GraphMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  toolCalls?: Record<string, unknown>[]
}

interface GraphConfig {
  agents: AgentNode[]
  edges: GraphEdge[]
}

interface GraphEdge {
  from: string
  to: string | RouteResult
}

type RouteCondition = (state: GraphState) => string | Promise<string>

interface RouteResult {
  __isRoute: true
  condition: RouteCondition
  destinations: string[]
}

interface GraphInstance {
  invoke: (input: Partial<GraphState>) => Promise<GraphState>
  compiledGraph: unknown
}
```

### Example

```ts
import { createAgent, createGraph, route } from '@jamaalbuilds/ai-toolkit/agents';

const classifier = createAgent({
  name: 'classifier',
  systemPrompt: 'Classify the intent as "tech" or "billing".',
  handler: async (state) => ({
    messages: [...state.messages, { role: 'assistant', content: 'tech' }],
    metadata: { intent: 'tech' },
  }),
});

const graph = await createGraph({
  agents: [classifier, techAgent, billingAgent],
  edges: [
    { from: 'classifier', to: route((s) => s.metadata?.intent as string, ['tech', 'billing']) },
  ],
});

const result = await graph.invoke({ messages: [{ role: 'user', content: 'My API key broke' }] });
```

---

## Module: knowledge

Import: `@jamaalbuilds/ai-toolkit/knowledge`
Wraps: LlamaIndex.js + pgvector
Peer deps: `@llamaindex/liteparse`

### Functions

```ts
function parseDocument(input: string | Buffer | Uint8Array): Promise<KnowledgeDocument>
function chunk(text: string, options?: ChunkOptions): Promise<DocumentChunk[]>
function ingest(input: string | Buffer | Uint8Array, embedder: EmbedFunction, store: VectorStore, options?: IngestOptions): Promise<IngestResult>
function search(query: string, embedder: EmbedFunction, store: VectorStore, options?: SearchOptions): Promise<SearchResult[]>
function createKnowledge(config: KnowledgeConfig): KnowledgeClient
```

### Types

```ts
interface KnowledgeDocument {
  content: string
  metadata: Record<string, unknown>
}

interface DocumentChunk {
  content: string
  metadata: Record<string, unknown>
  embedding?: number[]
}

type EmbedFunction = (texts: string[]) => Promise<number[][]>

interface VectorStore {
  upsert(chunks: DocumentChunk[]): Promise<void>
  search(queryVector: number[], options?: VectorStoreSearchOptions): Promise<SearchResult[]>
}

interface SearchResult {
  chunk: DocumentChunk
  similarity: number
}

interface KnowledgeConfig {
  embedder: EmbedFunction
  store: VectorStore
  chunkSize?: number
  chunkOverlap?: number
}

interface ChunkOptions {
  chunkSize?: number
  chunkOverlap?: number
}

interface IngestOptions {
  metadata?: Record<string, unknown>
  chunkSize?: number
  chunkOverlap?: number
}

interface IngestResult {
  chunkCount: number
  totalTokens: number
  metadata: Record<string, unknown>
}

interface SearchOptions {
  limit?: number
  threshold?: number
  filter?: Record<string, unknown>
}

interface KnowledgeClient {
  ingest(input: string | Buffer | Uint8Array, options?: IngestOptions): Promise<IngestResult>
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>
}
```

---

## Module: monitor

Import: `@jamaalbuilds/ai-toolkit/monitor`
Wraps: Langfuse
Peer deps: `langfuse`

### Functions

```ts
function createMonitor(config?: MonitorConfig): Promise<MonitorClient>
function trace<T>(monitor: MonitorClient, name: string, fn: (span: TraceSpan) => Promise<T>): Promise<TraceResult<T>>
function evaluate(monitor: MonitorClient, options: EvaluateOptions): Promise<void>
function getCostReport(monitor: MonitorClient): CostReport
function getTrace(monitor: MonitorClient, traceId: string): Promise<StoredTrace | null>
function getTraces(monitor: MonitorClient, options?: { limit?: number }): Promise<StoredTrace[]>
function onTrace(monitor: MonitorClient, callback: OnTraceCallback): void
function exportMetrics(monitor: MonitorClient): Promise<MetricsExport>
function createLogger(serviceName: string): Logger
```

### Types

```ts
type LogLevel = "debug" | "info" | "warn" | "error"

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

interface MonitorConfig {
  publicKey?: string
  secretKey?: string
  baseUrl?: string
  enabled?: boolean
  traceStore?: TraceStoreConfig
}

interface TraceSpan {
  update(attrs: TraceAttributes): void
}

interface TraceResult<T> {
  result: T
  traceId: string
}

interface EvaluateOptions {
  traceId: string
  name: string
  value: number | string | boolean
  dataType?: "NUMERIC" | "CATEGORICAL" | "BOOLEAN"
}

interface CostReport {
  totalCost: number
  currency: "USD"
  entries: CostEntry[]
  summary: Record<string, ModelCostSummary>
}

interface StoredTrace {
  id: string
  name: string
  input?: unknown
  output?: unknown
  timestamp: Date
  duration: number
}

interface MetricsExport {
  totalTraces: number
  totalCost: number
  costByCost: Record<string, number>
  costByModel: Record<string, number>
}
```

---

## Module: workflow

Import: `@jamaalbuilds/ai-toolkit/workflow`
Wraps: Inngest
Peer deps: `inngest`

### Functions

```ts
function createWorkflow(config: WorkflowConfig): Promise<WorkflowClient>
function defineJob(client: WorkflowClient, config: JobConfig, handler: (ctx: JobContext) => Promise<unknown>): WorkflowJob
function aiStep(step: WorkflowStep, options: AIStepOptions): Promise<AIStepResult>
function humanInTheLoop(step: WorkflowStep, options: HITLOptions): Promise<boolean>
function serve(jobs: WorkflowJob[], options?: ServeOptions): Promise<void>
```

### Types

```ts
interface WorkflowClient {
  id: string
  inngestClient: unknown
}

interface JobContext {
  event: unknown
  step: WorkflowStep
}

interface WorkflowStep {
  run(id: string, fn: () => Promise<unknown>): Promise<unknown>
  sleep(id: string, duration: string): Promise<void>
  waitForEvent(id: string, eventName: string, timeout: string): Promise<unknown>
  sendEvent(eventName: string, data: Record<string, unknown>): Promise<void>
}

interface AIStepResult {
  text: string
  usedFallback: boolean
  model: string
  cost: number
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
}

interface ServeOptions {
  port?: number
  path?: string
}
```

---

## Module: database

Import: `@jamaalbuilds/ai-toolkit/database`
Wraps: Drizzle ORM + pgvector
Peer deps: `drizzle-orm`, `postgres`

### Functions

```ts
function createDatabase(config?: DatabaseConfig): Promise<DatabaseClient>
function vectorSearch<T>(db: DatabaseClient, options: VectorSearchOptions): Promise<VectorSearchResult<T>[]>
function vectorSearchRaw(db: DatabaseClient, options: VectorSearchOptions & VectorSearchTableOptions): Promise<VectorSearchResult[]>
function migrate(options?: MigrateOptions): Promise<MigrateResult>
function detectProvider(connectionString: string): DatabaseProvider
function getVectorColumn(db: DatabaseClient, table: string, column: string): unknown
```

### Types

```ts
type DatabaseProvider = "neon" | "supabase" | "aws-rds" | "local"
type DatabaseDriver = "postgres-js" | "neon-http" | "neon-serverless"
type DistanceMetric = "cosine" | "l2" | "innerProduct"

interface DatabaseConfig {
  connectionString?: string
  provider?: DatabaseProvider
  driver?: DatabaseDriver
  ssl?: boolean
  schema?: Record<string, unknown>
  logger?: boolean
}

interface DatabaseClient {
  query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>
  withTenant(orgId: string, sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>
  db: unknown
  end(): Promise<void>
}

interface VectorSearchOptions {
  queryVector: number[]
  threshold?: number
  limit?: number
  metric?: DistanceMetric
}

interface VectorSearchResult<T> {
  data: T
  similarity: number
}

interface MigrateOptions {
  migrationsFolder?: string
  connectionString?: string
}

interface MigrateResult {
  success: boolean
  appliedCount: number
}
```

---

## Module: mcp

Import: `@jamaalbuilds/ai-toolkit/mcp`
Wraps: MCP SDK
Peer deps: `@modelcontextprotocol/sdk`, `zod`

### Classes

```ts
class McpServerBuilder {
  constructor(config: McpServerConfig)
  defineTool(tool: ToolDefinition): McpServerBuilder
  defineResource(resource: ResourceDefinition): McpServerBuilder
  createTestHarness(): McpTestHarness
  start(): Promise<void>
}

class McpTestHarness {
  callTool(name: string, params: Record<string, unknown>): Promise<McpToolResponse>
}
```

### Types

```ts
interface McpServerConfig {
  name: string
  version: string
}

interface ToolDefinition {
  name: string
  description: string
  schema: Record<string, z.ZodTypeAny>
  handler: (params: Record<string, unknown>) => Promise<unknown>
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
}

interface ResourceDefinition {
  uri: string
  name: string
  description?: string
  handler: () => Promise<unknown>
  mimeType?: string
}

interface McpToolResponse {
  content: McpContent[]
  isError?: boolean
}

interface McpContent {
  type: "text" | "image" | "resource"
  text?: string
  data?: string
  mimeType?: string
}
```

### Example

```ts
import { McpServerBuilder } from '@jamaalbuilds/ai-toolkit/mcp';
import { z } from 'zod';

const server = new McpServerBuilder({ name: 'my-tools', version: '1.0.0' });
server.defineTool({
  name: 'lookup-user',
  description: 'Look up a user by ID',
  schema: { userId: z.string() },
  handler: async ({ userId }) => ({ name: 'Alice', id: userId }),
});
await server.start();
```

---

## Module: security

Import: `@jamaalbuilds/ai-toolkit/security`
Wraps: Custom implementation
Peer deps: none

### Functions

```ts
function detectPII(text: string): PIIFinding[]
function sanitizeForLLM(text: string): string
function checkOutput(text: string, rules?: GuardrailRule[]): GuardrailResult
function createGuardrails(config?: GuardrailsConfig): Guardrails
function createRateLimiter(cache: CacheClient, config?: RateLimitConfig): RateLimiter
function createAuditLogger(serviceName: string): AuditLogger
```

### Types

```ts
type PIIType = "EMAIL" | "PHONE" | "SSN" | "CREDIT_CARD" | "API_KEY" | "PASSWORD"

interface PIIFinding {
  type: PIIType
  text: string
  position: number
  confidence: number
}

interface GuardrailRule {
  pattern: RegExp
  message: string
  severity: "warning" | "error"
}

interface GuardrailResult {
  safe: boolean
  violations: Array<{ rule: GuardrailRule; match: string }>
}

interface Guardrails {
  check(text: string): GuardrailResult
}

interface RateLimitConfig {
  max?: number
  windowSeconds?: number
  keyPrefix?: string
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  resetAt: number
}

interface RateLimiter {
  check(identifier: string): Promise<RateLimitResult>
  reset(identifier: string): Promise<void>
}

interface AuditLogger {
  log(action: string, event?: Omit<AuditEvent, "action">): void
  logAccess(params: { orgId: string; userId: string; resource: string }): void
}
```

### Example

```ts
import { detectPII, createGuardrails } from '@jamaalbuilds/ai-toolkit/security';

const findings = detectPII('Email john@acme.com or call 555-0123');
// [{ type: 'EMAIL', text: 'john@acme.com', ... }, { type: 'PHONE', text: '555-0123', ... }]

const guardrails = createGuardrails({
  rules: [{ pattern: /\d{3}-\d{2}-\d{4}/, message: 'SSN detected', severity: 'error' }],
});
const result = guardrails.check(llmOutput);
if (!result.safe) console.log(result.violations);
```

---

## Module: auth

Import: `@jamaalbuilds/ai-toolkit/auth`
Peer deps: none

### Functions

```ts
function getOrgId(request: Request | { headers: Record<string, string | undefined> }): string
function getUserId(request: Request | { headers: Record<string, string | undefined> }): string | undefined
function requireApiKey(request: Request | { headers: Record<string, string | undefined> }, expectedKey?: string): string
function createApiKeyGuard(expectedKey: string): unknown
function getTenantContext(request: Request | { headers: Record<string, string | undefined> }): TenantContext
```

### Types

```ts
interface TenantContext {
  orgId: string
  userId?: string
}
```

---

## Module: cache

Import: `@jamaalbuilds/ai-toolkit/cache`
Peer deps (Redis only): `ioredis`

### Functions & Classes

```ts
function createCache(config?: { adapter?: CacheClient; defaultTtl?: number }): CacheClient

class MemoryCacheAdapter implements CacheClient {
  constructor(options?: { defaultTtl?: number })
}

class RedisCacheAdapter implements CacheClient {
  constructor(redisClient: unknown)
}
```

### Types

```ts
interface CacheClient {
  get<T = unknown>(key: string): Promise<T | null>
  set<T = unknown>(key: string, value: T, options?: CacheOptions): Promise<void>
  invalidate(key: string): Promise<void>
  invalidatePrefix(prefix: string): Promise<void>
  disconnect(): Promise<void>
}

interface CacheOptions {
  ttl?: number
}
```

---

## Module: storage

Import: `@jamaalbuilds/ai-toolkit/storage`
Peer deps: `@vercel/blob`

### Functions

```ts
function validateFile(file: { size: number; type: string; name?: string }, options?: FileValidationOptions): void
function uploadDocument(file: Blob | Buffer | ReadableStream, options?: UploadOptions): Promise<UploadResult>
function deleteDocument(pathname: string): Promise<void>
function listDocuments(folder?: string): Promise<UploadResult[]>
```

### Types

```ts
interface FileValidationOptions {
  maxSizeMB?: number
  allowedTypes?: string[]
}

interface UploadOptions {
  folder?: string
  access?: "public" | "private"
  filename?: string
}

interface UploadResult {
  url: string
  pathname: string
  contentType: string
  size: number
}
```

---

## Module: config

Import: `@jamaalbuilds/ai-toolkit/config`
Peer deps: none

### Functions

```ts
function parseConfig(env?: Record<string, string | undefined>): ToolkitConfig
function initToolkit(modules: string[]): Promise<ToolkitInstances>
```

---

## Module: errors

Import: `@jamaalbuilds/ai-toolkit/errors`
Peer deps: none

### Classes

```ts
class ToolkitError extends Error {
  code: string
  statusCode?: number
  retryable?: boolean
  cause?: Error
  toJSON(): { error: { code: string; message: string; statusCode?: number; retryable?: boolean } }
}

class ApiClientError extends ToolkitError
class AuthError extends ToolkitError
class CacheError extends ToolkitError
class LLMError extends ToolkitError
class RateLimitError extends ToolkitError
class StorageError extends ToolkitError
class ValidationError extends ToolkitError
```

---

## Module: health

Import: `@jamaalbuilds/ai-toolkit/health`
Peer deps: none

### Functions

```ts
function createHealthCheck(config: HealthCheckConfig): () => Promise<HealthReport>
```

### Types

```ts
interface HealthCheckConfig {
  checks: Record<string, () => Promise<void>>
  timeoutMs?: number
}

interface HealthReport {
  status: "healthy" | "degraded" | "unhealthy"
  timestamp: string
  uptime: number
  checks: Record<string, HealthCheckResult>
}

interface HealthCheckResult {
  status: "pass" | "fail"
  latencyMs?: number
  message?: string
}
```

---

## Module: testing

Import: `@jamaalbuilds/ai-toolkit/testing`
Peer deps: none

### Functions

```ts
function mockAI(options?: MockAIOptions): AIClient
function mockLLM(options?: MockLLMOptions): LLMClient
function mockChain(options?: MockChainOptions): Chain
function mockKnowledge(options?: MockKnowledgeOptions): KnowledgeClient
function mockMonitor(options?: MockMonitorOptions): MonitorClient
function mockAgents(options?: MockAgentsOptions): GraphInstance
function mockWorkflow(options?: MockWorkflowOptions): WorkflowClient
function mockDatabase(): DatabaseClient
function mockDb(): unknown
function mockCache(): CacheClient
```

All mock factories return fully typed implementations with zero external API calls. Use `callTracker` option to inspect call history.

---

## Module: data

Import: `@jamaalbuilds/ai-toolkit/data`
Peer deps: none

### Types

```ts
interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    total: number
    page: number
    pageSize: number
    totalPages: number
    hasMore: boolean
  }
}

interface ErrorResponse {
  error: {
    code: string
    message: string
    statusCode: number
    retryable: boolean
    fields?: Record<string, string>
  }
}

type ApiResult<T> = { success: true; data: T } | { success: false; error: ErrorResponse["error"] }
```

---

## Module: api

Import: `@jamaalbuilds/ai-toolkit/api`
Peer deps: none

### Functions & Classes

```ts
function createApiClient(config: ApiClientConfig): ApiClient

class ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  delete<T>(path: string, options?: RequestOptions): Promise<T>
}
```

### Types

```ts
interface ApiClientConfig {
  baseUrl: string
  apiKey?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}
```
