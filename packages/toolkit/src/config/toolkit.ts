import { type ToolkitConfig, parseConfig } from "./schema.js";

export interface ToolkitInstances {
  /** Validated configuration */
  config: ToolkitConfig;

  /**
   * Check if a feature is available based on env vars.
   * Usage: if (toolkit.has('redis')) { ... }
   */
  has: (feature: ToolkitFeature) => boolean;
}

type ToolkitFeature =
  | "anthropic"
  | "openai"
  | "redis"
  | "neon"
  | "langfuse"
  | "blob"
  | "backend";

const featureChecks: Record<ToolkitFeature, (config: ToolkitConfig) => boolean> =
  {
    anthropic: (c) => !!c.ANTHROPIC_API_KEY,
    openai: (c) => !!c.OPENAI_API_KEY,
    redis: (c) => !!c.REDIS_URL,
    neon: (c) => !!c.DATABASE_URL,
    langfuse: (c) => !!c.LANGFUSE_PUBLIC_KEY && !!c.LANGFUSE_SECRET_KEY,
    blob: (c) => !!c.BLOB_READ_WRITE_TOKEN,
    backend: (c) => !!c.BACKEND_URL,
  };

/**
 * One-call setup for the entire toolkit.
 *
 * Reads env vars, validates with Zod, returns configured instances.
 * Individual modules can still be imported directly for tree-shaking.
 *
 * @example
 * ```ts
 * const toolkit = initToolkit();
 * toolkit.config.ANTHROPIC_API_KEY  // validated, guaranteed string if present
 * toolkit.has('redis')              // check feature availability
 * ```
 */
export function initToolkit(
  env?: Record<string, string | undefined>,
): ToolkitInstances {
  const config = parseConfig(env);

  return {
    config,
    has: (feature: ToolkitFeature) => featureChecks[feature](config),
  };
}
