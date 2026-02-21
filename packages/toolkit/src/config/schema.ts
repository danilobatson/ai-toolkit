import { z } from "zod";

/**
 * Zod schema for all toolkit environment variables.
 *
 * Validates at startup. Missing ANTHROPIC_API_KEY? Clear error immediately,
 * not a cryptic failure 10 minutes later on the first LLM call.
 *
 * All fields optional — you only need what your project uses.
 * initToolkit() validates only the fields required by the modules you enable.
 */
export const toolkitConfigSchema = z.object({
  // LLM
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  LLM_PRIMARY_MODEL: z
    .string()
    .default("claude-sonnet-4-20250514"),
  LLM_FALLBACK_MODEL: z.string().default("gpt-4o"),

  // MCP
  MCP_SERVER_NAME: z.string().optional(),
  MCP_SERVER_VERSION: z.string().default("1.0.0"),

  // Neon
  DATABASE_URL: z.string().url().optional(),
  NEON_API_KEY: z.string().optional(),

  // Redis / Cache
  REDIS_URL: z.string().url().optional(),
  CACHE_DEFAULT_TTL: z.coerce.number().default(300), // 5 minutes

  // Auth
  API_KEY: z.string().min(1).optional(),
  NEON_AUTH_SECRET: z.string().optional(),

  // Observability
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().url().default("https://cloud.langfuse.com"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Storage
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  // API Client (BFF → Backend)
  BACKEND_URL: z.string().url().optional(),
  BACKEND_API_KEY: z.string().optional(),

  // Security
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000), // 1 minute

  // Environment
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type ToolkitConfig = z.infer<typeof toolkitConfigSchema>;

/**
 * Parse and validate config from environment variables.
 * Throws a clear error listing ALL missing/invalid vars at once.
 */
export function parseConfig(
  env: Record<string, string | undefined> = process.env,
): ToolkitConfig {
  const result = toolkitConfigSchema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Toolkit config validation failed:\n${issues}\n\nCheck your .env file or environment variables.`,
    );
  }

  return result.data;
}
