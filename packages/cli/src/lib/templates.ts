/**
 * Template functions for aitk init.
 *
 * Each function returns file content as a string, parameterized by project name.
 * Inline templates (not external files) so the CLI is self-contained.
 */

// ─── Version defaults ────────────────────────────────────────────────────
// Single place to update when dependencies release new versions.
// Users can override via ProjectConfig.versions.

export const DEFAULT_VERSIONS = {
	postgres: "pg17",
	redis: "7-alpine",
	python: "3.12",
	node: "22",
} as const;

export interface ProjectConfig {
	name: string;
	backend: "fastapi" | "nestjs";
	frontend: "nextjs";
	/** Override any default version. Unspecified keys use DEFAULT_VERSIONS. */
	versions?: Partial<typeof DEFAULT_VERSIONS>;
}

/** Resolve versions with user overrides falling back to defaults. */
function resolveVersions(config: ProjectConfig): typeof DEFAULT_VERSIONS {
	return { ...DEFAULT_VERSIONS, ...config.versions };
}

// ─── Root files ───────────────────────────────────────────────────────────

export function gitignore(): string {
	return `# Dependencies
node_modules/
__pycache__/
*.pyc
.venv/

# Build
dist/
.next/
.turbo/
*.tsbuildinfo

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/settings.json
.idea/

# OS
.DS_Store
Thumbs.db

# Testing
coverage/
.pytest_cache/
.mypy_cache/

# Docker
*.log

# Claude Code
CLAUDE.md
`;
}

export function envExample(config: ProjectConfig): string {
	return `# ─── LLM ───────────────────────────────────────────
# Set at least one. Auto-detected in priority order.
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
GROQ_API_KEY=
# Ollama: no key needed, just run "ollama serve"

# ─── Database (Neon) ──────────────────────────────────
DATABASE_URL=postgresql://user:pass@localhost:5432/${config.name}

# ─── Redis / Cache ────────────────────────────────────
REDIS_URL=redis://localhost:6379
CACHE_DEFAULT_TTL=300

# ─── Auth ─────────────────────────────────────────────
API_KEY=dev-api-key-change-me

# ─── Observability (Langfuse) ─────────────────────────
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LOG_LEVEL=info

# ─── Storage (Vercel Blob) ───────────────────────────
BLOB_READ_WRITE_TOKEN=

# ─── Backend ──────────────────────────────────────────
BACKEND_URL=http://localhost:8000
BACKEND_API_KEY=dev-backend-key-change-me

# ─── Environment ──────────────────────────────────────
NODE_ENV=development
ENVIRONMENT=development
`;
}

export function dockerCompose(config: ProjectConfig): string {
	const v = resolveVersions(config);
	return `services:
  postgres:
    image: pgvector/pgvector:${v.postgres}
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: ${config.name}
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d ${config.name}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:${v.redis}
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
`;
}

export function readme(config: ProjectConfig): string {
	const v = resolveVersions(config);
	return `# ${config.name}

> Built with [@jamaalbuilds/ai-toolkit](https://www.npmjs.com/package/@jamaalbuilds/ai-toolkit)

## Quick Start

\`\`\`bash
# Start infrastructure
docker compose up -d

# Backend
cd backend
uv sync
cp ../.env.example ../.env  # edit with your keys
uv run uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
yarn install
yarn dev
\`\`\`

## Architecture

\`\`\`
frontend/ (Next.js)  →  backend/ (FastAPI)  →  Neon PostgreSQL + pgvector
                                             →  Redis (cache)
                                             →  LLM (any provider via ai-toolkit)
                                             →  Vercel Blob (storage)
                                             →  Langfuse (observability)
\`\`\`

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python ${v.python}+ |
| Database | PostgreSQL + pgvector (Neon in production) |
| Cache | Redis |
| SDK | @jamaalbuilds/ai-toolkit (TypeScript + Python) |
| LLM | Any provider (Anthropic, OpenAI, Google, Groq, Ollama) |
| Observability | Langfuse |

## Development

\`\`\`bash
# Type check
cd frontend && yarn typecheck
cd backend && mypy app/

# Lint
cd frontend && yarn lint
cd backend && ruff check app/

# Test
cd frontend && yarn test
cd backend && pytest
\`\`\`
`;
}

export function projectClaudeMd(config: ProjectConfig): string {
	const v = resolveVersions(config);
	return `# ${config.name} — Claude Code Context

## What This Is

A full-stack AI application built with the @jamaalbuilds/ai-toolkit SDK.

**Stack:** Next.js frontend → FastAPI backend → Neon PostgreSQL + pgvector
**Package manager:** yarn (frontend), uv (backend). Never use npm.

## Structure

\`\`\`
${config.name}/
├── backend/          — FastAPI + Python SDK
│   ├── app/
│   │   ├── main.py   — App entrypoint, middleware, CORS
│   │   ├── config.py — Settings via ai_toolkit.config
│   │   └── routes/   — API endpoints
│   └── pyproject.toml
├── frontend/         — Next.js + TypeScript SDK
│   ├── src/
│   │   ├── app/      — App router pages
│   │   └── lib/      — SDK client, utilities
│   └── package.json
└── docker-compose.yml — Postgres + Redis for local dev
\`\`\`

## Coding Standards

- Frontend: TypeScript strict mode, ESM, App Router
- Backend: Python ${v.python}+, strict mypy, ruff, 100 char lines
- All errors use ToolkitError hierarchy from the SDK
- Config validated at startup (Zod frontend, Pydantic backend)
- BFF pattern: frontend calls backend via @jamaalbuilds/ai-toolkit/api client

## Commands

\`\`\`bash
docker compose up -d                          # Start Postgres + Redis
cd backend && uv run uvicorn app.main:app --reload  # Start backend
cd frontend && yarn dev                       # Start frontend
\`\`\`
`;
}

// ─── Backend (FastAPI) ────────────────────────────────────────────────────

export function backendPyproject(config: ProjectConfig): string {
	const v = resolveVersions(config);
	return `[project]
name = "${config.name}-backend"
version = "0.1.0"
description = "${config.name} backend"
requires-python = ">=${v.python}"

dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "pydantic>=2.10.0",
    "pydantic-settings>=2.7.0",
    "ai-toolkit[llm]",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.24.0",
    "mypy>=1.14.0",
    "ruff>=0.9.0",
    "httpx>=0.28.0",
]

[tool.uv.sources]
ai-toolkit = { path = "../../ai-toolkit/packages/toolkit-python", editable = true }

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.ruff]
target-version = "py${v.python.replace(".", "")}"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP"]

[tool.mypy]
python_version = "${v.python}"
strict = true

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
`;
}

export function backendPythonVersion(config: ProjectConfig): string {
	const v = resolveVersions(config);
	return `${v.python}
`;
}

export function backendAppInit(): string {
	return `"""${""} backend application."""
`;
}

export function backendConfig(config: ProjectConfig): string {
	return `"""Application configuration — extends AI Toolkit settings."""

from ai_toolkit.config import ToolkitSettings


class Settings(ToolkitSettings):
    """
    Project-specific settings.

    Inherits all toolkit env vars (ANTHROPIC_API_KEY, DATABASE_URL, etc.)
    and adds project-specific ones here.
    """

    app_name: str = "${config.name}"
    cors_origins: list[str] = ["http://localhost:3000"]


def get_settings() -> Settings:
    """Get validated settings. Call once at startup."""
    return Settings()  # type: ignore[call-arg]
`;
}

export function backendMain(config: ProjectConfig): string {
	return `"""FastAPI application entrypoint."""

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes.health import router as health_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup and shutdown logic."""
    settings = get_settings()
    print(f"Starting {settings.app_name} (env={settings.environment})")
    yield
    print(f"Shutting down {settings.app_name}")


def create_app() -> FastAPI:
    """Application factory."""
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routes
    app.include_router(health_router)

    return app


app = create_app()
`;
}

export function backendHealthRoute(): string {
	return `"""Health check endpoint."""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict[str, str]:
    """Basic health check. Extend with database/Redis checks as needed."""
    return {"status": "healthy"}
`;
}

export function backendRoutesInit(): string {
	return `"""API routes."""
`;
}

// ─── Frontend (Next.js) ──────────────────────────────────────────────────

export function frontendPackageJson(config: ProjectConfig): string {
	return JSON.stringify(
		{
			name: `${config.name}-frontend`,
			version: "0.1.0",
			private: true,
			scripts: {
				dev: "next dev",
				build: "next build",
				start: "next start",
				lint: "next lint",
				typecheck: "tsc --noEmit",
				test: "vitest run",
			},
			dependencies: {
				"@jamaalbuilds/ai-toolkit": "^0.1.0",
				next: "^15.2.0",
				react: "^19.0.0",
				"react-dom": "^19.0.0",
			},
			devDependencies: {
				"@types/node": "^22.0.0",
				"@types/react": "^19.0.0",
				"@types/react-dom": "^19.0.0",
				typescript: "^5.7.0",
				vitest: "^3.0.0",
			},
		},
		null,
		2,
	);
}

export function frontendTsconfig(): string {
	return JSON.stringify(
		{
			compilerOptions: {
				target: "ES2022",
				lib: ["dom", "dom.iterable", "ES2022"],
				allowJs: true,
				skipLibCheck: true,
				strict: true,
				noEmit: true,
				esModuleInterop: true,
				module: "esnext",
				moduleResolution: "bundler",
				resolveJsonModule: true,
				isolatedModules: true,
				jsx: "preserve",
				incremental: true,
				plugins: [{ name: "next" }],
				paths: {
					"@/*": ["./src/*"],
				},
			},
			include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
			exclude: ["node_modules"],
		},
		null,
		2,
	);
}

export function frontendNextConfig(): string {
	return `/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
`;
}

export function frontendLayout(config: ProjectConfig): string {
	return `import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "${config.name}",
  description: "Built with @jamaalbuilds/ai-toolkit",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
}

export function frontendPage(config: ProjectConfig): string {
	return `export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>${config.name}</h1>
      <p>Built with <a href="https://www.npmjs.com/package/@jamaalbuilds/ai-toolkit">@jamaalbuilds/ai-toolkit</a></p>
    </main>
  );
}
`;
}

export function frontendApiClient(): string {
	return `import { createApiClient } from "@jamaalbuilds/ai-toolkit/api";

/**
 * Typed HTTP client for calling the backend.
 *
 * Used in BFF routes (app/api/) to proxy requests to FastAPI.
 * Automatic retry on 5xx, error wrapping, timeout handling.
 */
export const backend = createApiClient({
  baseUrl: process.env.BACKEND_URL ?? "http://localhost:8000",
  apiKey: process.env.BACKEND_API_KEY,
  timeout: 30_000,
});
`;
}
