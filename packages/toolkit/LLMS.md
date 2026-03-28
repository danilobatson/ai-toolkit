# @jamaalbuilds/ai-toolkit

Unified TypeScript SDK for AI-powered applications. Wraps Vercel AI SDK, LangChain.js, LangGraph.js, LlamaIndex.js, Langfuse, Inngest, MCP SDK, and Drizzle ORM behind one consistent API.

## Modules

| Module | Description |
|--------|-------------|
| `ai` | Call AI models — generate text, stream tokens, structured output with Zod schemas |
| `chain` | Multi-step reasoning — prompt templates, output parsing (JSON/list/regex), RAG pipelines |
| `agents` | Multi-agent orchestration — state graphs, conditional routing, human-in-the-loop |
| `knowledge` | Document ingestion pipeline — parse PDFs, chunk text, embed, store, semantic search |
| `monitor` | AI observability — trace LLM calls, evaluate quality, track costs per model |
| `workflow` | Durable background jobs — event triggers, cron, retry, pause/resume, HITL approval |
| `database` | Provider-agnostic Postgres — typed queries via Drizzle, vector search, migrations |
| `mcp` | Model Context Protocol — build MCP servers, define tools and resources |
| `security` | PII detection, audit logging, rate limiting, input/output guardrails |
| `auth` | API key validation, multi-tenant context extraction, RBAC |
| `cache` | Key-value cache with TTL — auto-detects Redis or falls back to in-memory |
| `storage` | File upload with validation — wraps Vercel Blob |
| `config` | Validate environment variables at startup using Zod schemas |
| `errors` | Typed error hierarchy — ToolkitError base with 7 subtypes |
| `health` | Health check endpoint — per-service status (healthy/degraded/unhealthy) |
| `testing` | Mock factories for all modules — zero external API calls in tests |

## Key Exports

### ai
```ts
createAI(config?: AIConfig): AIClient
// AIClient.generate(prompt, options?): Promise<GenerateResult>
// AIClient.stream(prompt, options?): Promise<StreamResult>
// AIClient.structured(prompt, options): Promise<StructuredResult<T>>
```

### chain
```ts
prompt(config: PromptConfig): PromptTemplate
parse(config: ParseConfig): Parser
createChain(config: ChainConfig): Chain
rag(config: RAGConfig): Promise<RAGResult>
createSplitter(config?: SplitterConfig): Splitter
createLanguageSplitter(language: SplitterLanguage, config?: SplitterConfig): Splitter
```

### agents
```ts
createAgent(config: AgentConfig): AgentNode
createGraph(config: GraphConfig): Promise<GraphInstance>
route(condition: RouteCondition, targets: string[]): RouteResult
```

### knowledge
```ts
parseDocument(input: string | Buffer | Uint8Array, metadata?: Record<string, unknown>): Promise<KnowledgeDocument>
chunk(text: string, options?: ChunkOptions): Promise<DocumentChunk[]>
ingest(input: string | Buffer | Uint8Array, embedder: EmbedFunction, store: VectorStore, options?: IngestOptions): Promise<IngestResult>
search(query: string, embedder: EmbedFunction, store: VectorStore, options?: SearchOptions): Promise<SearchResult[]>
createKnowledge(config: KnowledgeConfig): KnowledgeClient
// KnowledgeClient.ingest(input, options?): Promise<IngestResult>
// KnowledgeClient.search(query, options?): Promise<SearchResult[]>
```

### monitor
```ts
createMonitor(config?: MonitorConfig): Promise<MonitorClient>
trace(monitor: MonitorClient, name: string, fn: (span: TraceSpan) => Promise<T>): Promise<TraceResult<T>>
evaluate(monitor: MonitorClient, options: EvaluateOptions): Promise<void>
getCostReport(monitor: MonitorClient): CostReport
getTraces(monitor: MonitorClient): StoredTrace[]
getTrace(monitor: MonitorClient, traceId: string): StoredTrace | undefined
onTrace(monitor: MonitorClient, callback: OnTraceCallback): () => void
exportMetrics(monitor: MonitorClient): MetricsExport
createLogger(options?: { level?: LogLevel }): Logger
```

### workflow
```ts
createWorkflow(config: WorkflowConfig): Promise<WorkflowClient>
defineJob(client: WorkflowClient, config: JobConfig, handler: Function): WorkflowJob
humanInTheLoop(step: WorkflowStep, options: HITLOptions): Promise<unknown | null>
aiStep(step: WorkflowStep, options: AIStepOptions): Promise<AIStepResult>
serve(client: WorkflowClient, options: ServeOptions): void
```

### database
```ts
createDatabase(config: DatabaseConfig): DatabaseClient
vectorSearch(db: DatabaseClient, options: VectorSearchOptions): Promise<VectorSearchResult[]>
vectorSearchRaw(db: DatabaseClient, options: VectorSearchOptions): Promise<unknown[]>
migrate(db: DatabaseClient, options: MigrateOptions): Promise<MigrateResult>
detectProvider(connectionString: string): DatabaseProvider
getVectorColumn(dimension?: number, metric?: DistanceMetric): unknown
```

### mcp
```ts
new McpServerBuilder(config: McpServerConfig)
// .defineTool(definition: ToolDefinition): this
// .defineResource(definition: ResourceDefinition): this
// .start(): Promise<void>
// .createTestHarness(): McpTestHarness
new McpTestHarness(tools, resources)
// .callTool(name, params?): Promise<McpToolResponse>
// .readResource(uri): Promise<unknown>
```

### security
```ts
detectPII(text: string): PIIFinding[]
sanitizeForLLM(text: string): string
createGuardrails(rules: GuardrailRule[]): Guardrails
// Guardrails.check(text: string): GuardrailResult  — synchronous, returns { allowed, violations, reasons }
checkOutput(response: string, rules: GuardrailRule[]): GuardrailResult
createRateLimiter(cache: CacheClient, config?: RateLimitConfig): RateLimiter
createAuditLogger(serviceName: string): AuditLogger
```

### auth
```ts
getOrgId(request: Request): string
getUserId(request: Request): string | undefined
getTenantContext(request: Request): TenantContext
requireApiKey(request: Request, expectedKey?: string): string
createApiKeyGuard(expectedKey: string): NestJS Guard
```

### cache
```ts
createCache(options?: { redisUrl?: string; defaultTtl?: number }): CacheClient
// CacheClient.get<T>(key): Promise<T | null>
// CacheClient.set(key, value, options?): Promise<void>
// CacheClient.invalidate(key): Promise<void>
// CacheClient.invalidatePrefix(prefix): Promise<void>
```

### storage
```ts
validateFile(file: File, options?: FileValidationOptions): void
uploadDocument(file: File, options?: UploadOptions): Promise<UploadResult>
deleteDocument(url: string): Promise<void>
listDocuments(options?: object): Promise<UploadResult[]>
```

### config
```ts
initToolkit(env?: Record<string, string>): ToolkitInstances
parseConfig(env?: Record<string, string | undefined>): ToolkitConfig
```

### errors
```ts
class ToolkitError extends Error { code: string; context?: Record<string, unknown> }
class ValidationError extends ToolkitError
class AuthError extends ToolkitError
class LLMError extends ToolkitError
class CacheError extends ToolkitError
class StorageError extends ToolkitError
class RateLimitError extends ToolkitError
class ApiClientError extends ToolkitError
```

### health
```ts
createHealthCheck(config: HealthCheckConfig): () => Promise<HealthCheckResult>
```

### testing
```ts
mockAI(options?: MockAIOptions): AIClient
mockChain(options?: MockChainOptions): Chain
mockAgents(options?: MockAgentsOptions): GraphInstance
mockKnowledge(options?: MockKnowledgeOptions): KnowledgeClient
mockMonitor(options?: MockMonitorOptions): MonitorClient
mockWorkflow(options?: MockWorkflowOptions): WorkflowClient
mockDatabase(options?: object): DatabaseClient
mockCache(): CacheClient
mockLLM(options?: MockLLMOptions): LLMClient
mockDb(rows?: unknown[]): DbClient
```

## Usage Examples

### AI — Generate and Stream

```ts
import { createAI } from '@jamaalbuilds/ai-toolkit/ai';

const ai = createAI(); // auto-detects provider from env
const result = await ai.generate('Summarize this document', { system: 'You are helpful.' });
console.log(result.text);

const stream = await ai.stream('Write a poem');
for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}
```

### Security — PII Detection and Guardrails

```ts
import { detectPII, createGuardrails, checkOutput } from '@jamaalbuilds/ai-toolkit/security';

const findings = detectPII('Email john@acme.com or call 555-0123');
// [{ type: 'EMAIL', match: 'john@acme.com' }, { type: 'PHONE', match: '555-0123' }]

const guardrails = createGuardrails([
  { id: 'no-pii', description: 'Block PII', test: /\d{3}-\d{2}-\d{4}/ },
]);
const result = guardrails.check(llmOutput); // synchronous
if (!result.allowed) console.log(result.violations);
```

### MCP — Build a Tool Server

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

## Install

```bash
yarn add @jamaalbuilds/ai-toolkit
# Then install only the peer deps you need:
yarn add ai @ai-sdk/groq                    # for ai module
yarn add @langchain/core @langchain/textsplitters  # for chain module
yarn add @langchain/langgraph               # for agents module
yarn add langfuse                            # for monitor module
yarn add inngest                             # for workflow module
yarn add drizzle-orm postgres                # for database module
yarn add @modelcontextprotocol/sdk           # for mcp module
```
