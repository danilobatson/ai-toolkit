# Self-Hosted & Air-Gapped Deployment Guide

`@jamaalbuilds/ai-toolkit` is designed to run anywhere — cloud, on-premise, or fully air-gapped. Every external service can be swapped for a self-hosted alternative.

## Local AI with Ollama

Replace cloud AI providers with [Ollama](https://ollama.com) for fully local inference.

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1

# Point the toolkit at Ollama's OpenAI-compatible endpoint
export OPENAI_API_KEY=ollama          # any non-empty string
export OPENAI_BASE_URL=http://localhost:11434/v1
```

```typescript
import { createAI } from '@jamaalbuilds/ai-toolkit/ai';

const ai = createAI({ provider: 'openai', model: 'llama3.1' });
const result = await ai.generate('Summarize this document.');
```

Ollama exposes an OpenAI-compatible API, so the toolkit's `openai` provider works without changes. No data leaves your machine.

## Self-Hosted Langfuse (Monitoring)

Replace Langfuse Cloud with a [self-hosted Langfuse instance](https://langfuse.com/docs/deployment/self-host).

```bash
# Docker Compose (see langfuse.com/docs/deployment/self-host)
docker compose up -d

# Point the toolkit at your instance
export LANGFUSE_PUBLIC_KEY=pk-lf-...
export LANGFUSE_SECRET_KEY=sk-lf-...
export LANGFUSE_BASE_URL=http://localhost:3000
```

```typescript
import { createMonitor } from '@jamaalbuilds/ai-toolkit/monitor';

const monitor = await createMonitor({
  langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY,
  langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY,
  langfuseBaseUrl: process.env.LANGFUSE_BASE_URL,  // self-hosted URL
});
```

All traces, evaluations, and cost data stay on your infrastructure.

## Local PostgreSQL (Database)

Replace Neon or any cloud Postgres with a local instance.

```bash
# Docker
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=secret \
  -p 5432:5432 \
  postgres:16

# Enable pgvector for embeddings
docker exec -it postgres psql -U postgres -c 'CREATE EXTENSION IF NOT EXISTS vector;'

# Set connection string
export DATABASE_URL=postgresql://postgres:secret@localhost:5432/postgres
```

```typescript
import { createDatabase, vectorSearch, migrate } from '@jamaalbuilds/ai-toolkit/database';

const db = createDatabase({ connectionString: process.env.DATABASE_URL });
await migrate(db, { migrationsFolder: './drizzle' });
```

Works with any PostgreSQL 15+ instance. For vector search, install the [pgvector extension](https://github.com/pgvector/pgvector).

## Self-Hosted Redis (Cache & Rate Limiting)

```bash
docker run -d --name redis -p 6379:6379 redis:7

export REDIS_URL=redis://localhost:6379
```

```typescript
import { createCache } from '@jamaalbuilds/ai-toolkit/cache';

const cache = createCache(); // auto-detects REDIS_URL
```

If no `REDIS_URL` is set, the toolkit falls back to an in-memory cache automatically.

## Full Self-Hosted Stack

For a complete self-hosted deployment with zero cloud dependencies:

```bash
# .env
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://localhost:11434/v1
DATABASE_URL=postgresql://postgres:secret@localhost:5432/myapp
REDIS_URL=redis://localhost:6379
LANGFUSE_PUBLIC_KEY=pk-lf-local
LANGFUSE_SECRET_KEY=sk-lf-local
LANGFUSE_BASE_URL=http://localhost:3000
```

| Service | Self-Hosted Option | Port |
|---------|-------------------|------|
| AI Inference | Ollama | 11434 |
| Database | PostgreSQL + pgvector | 5432 |
| Cache | Redis | 6379 |
| Monitoring | Langfuse | 3000 |

## Compliance Considerations

### HIPAA

- Use self-hosted AI (Ollama) to keep PHI off third-party servers
- Self-hosted Langfuse ensures traces containing PHI stay on-premise
- The `security` module's PII detection can catch PHI before it reaches any external service
- Use `sanitizeForLLM()` as a pre-processing step for all user input
- Audit logging via `createAuditLogger()` provides a compliance trail

```typescript
import { detectPII, sanitizeForLLM, createGuardrails } from '@jamaalbuilds/ai-toolkit/security';

// Scrub PHI before any AI call
const clean = sanitizeForLLM(userInput);
const findings = detectPII(userInput);
if (findings.length > 0) {
  // Log PHI detection event for compliance
  auditLogger.log({ action: 'phi-detected', findings });
}
```

### FedRAMP

- Deploy on FedRAMP-authorized infrastructure (AWS GovCloud, Azure Government)
- All toolkit services can run within your authorization boundary
- No toolkit code phones home or sends telemetry
- Pin exact dependency versions (already enforced by toolkit's dependency policy)

### SOX

- Audit logging captures all data access and AI operations
- Rate limiting prevents abuse patterns
- RBAC via the `auth` module restricts access by role/tenant
- All operations are traceable through Langfuse spans

## Air-Gapped Deployment

For networks with no internet access:

### 1. Bundle Dependencies

On a connected machine:

```bash
# Pack the toolkit and all peer deps
yarn pack
# Transfer .tgz files to the air-gapped environment
```

### 2. Pre-Download AI Models

```bash
# On connected machine
ollama pull llama3.1
ollama pull nomic-embed-text

# Copy ~/.ollama/models to the air-gapped machine
```

### 3. Docker Images

Pre-pull and save container images:

```bash
docker save postgres:16 redis:7 langfuse/langfuse:latest | gzip > images.tar.gz
# Transfer to air-gapped machine
docker load < images.tar.gz
```

### 4. No External Calls

The toolkit makes zero external calls when configured with local services. Modules that wrap cloud services (storage with Vercel Blob, monitoring with Langfuse Cloud) simply won't activate without their env vars — no errors, no fallback requests.

## Environment Variable Reference

| Variable | Required For | Self-Hosted Alternative |
|----------|-------------|------------------------|
| `OPENAI_API_KEY` | ai module | Set to `ollama` with `OPENAI_BASE_URL` |
| `OPENAI_BASE_URL` | Ollama | `http://localhost:11434/v1` |
| `GROQ_API_KEY` | ai module (Groq) | Use Ollama instead |
| `OPENROUTER_API_KEY` | ai module (OpenRouter) | Use Ollama instead |
| `DATABASE_URL` | database module | `postgresql://user:pass@localhost:5432/db` |
| `REDIS_URL` | cache, rate limiter | `redis://localhost:6379` |
| `LANGFUSE_PUBLIC_KEY` | monitor module | Self-hosted Langfuse key |
| `LANGFUSE_SECRET_KEY` | monitor module | Self-hosted Langfuse key |
| `LANGFUSE_BASE_URL` | monitor module | `http://localhost:3000` |
| `BLOB_READ_WRITE_TOKEN` | storage module | Use local filesystem or S3-compatible storage |
