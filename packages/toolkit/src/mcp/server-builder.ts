/**
 * MCP Server Builder — type-safe tool/resource registration with error handling.
 *
 * Wraps @modelcontextprotocol/sdk McpServer with:
 * - `defineTool()` — cleaner API, auto error wrapping, Zod schemas
 * - `defineResource()` — static or template resources
 * - Error handling — handler exceptions become MCP error responses, not crashes
 * - Test harness — call tools directly without transport (unit testable)
 *
 * @example
 * ```typescript
 * import { McpServerBuilder } from '@jamaalbuilds/ai-toolkit/mcp';
 * import { z } from 'zod';
 *
 * const builder = new McpServerBuilder({ name: 'rag-assistant', version: '1.0.0' });
 *
 * builder.defineTool({
 *   name: 'search_documents',
 *   description: 'Search documents by semantic similarity',
 *   schema: { query: z.string(), limit: z.number().default(5) },
 *   handler: async ({ query, limit }) => {
 *     const results = await searchPgVector(query, limit);
 *     return results;
 *   },
 * });
 *
 * // Production: connect to transport
 * await builder.start();
 *
 * // Testing: call tools directly
 * const harness = builder.createTestHarness();
 * const result = await harness.callTool('search_documents', { query: 'diabetes', limit: 3 });
 * ```
 */

import type { z } from "zod";
import { ToolkitError } from "../errors/base.js";
import { ValidationError } from "../errors/types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Content block returned by MCP tools.
 *
 * @example
 * ```ts
 * const content: McpContent = { type: 'text', text: 'Search returned 3 results.' };
 * ```
 */
export interface McpContent {
	type: "text" | "image" | "resource";
	text?: string;
	data?: string;
	mimeType?: string;
}

/**
 * Standard MCP tool response.
 *
 * @example
 * ```ts
 * const response: McpToolResponse = {
 *   content: [{ type: 'text', text: 'Done.' }],
 *   isError: false,
 * };
 * ```
 */
export interface McpToolResponse {
	content: McpContent[];
	isError?: boolean;
}

/**
 * Configuration for defining a tool.
 *
 * @example
 * ```ts
 * const tool: ToolDefinition = {
 *   name: 'search_docs',
 *   description: 'Search documents',
 *   schema: { query: z.string() },
 *   handler: async ({ query }) => searchDocs(query),
 * };
 * ```
 */
export interface ToolDefinition {
	/** Tool name (snake_case, unique per server). */
	name: string;
	/** Human-readable description. LLMs use this to decide when to call the tool. */
	description: string;
	/** Zod schema object for input parameters — e.g., { query: z.string() }. */
	schema: Record<string, z.ZodTypeAny>;
	/** Handler function. Return value is auto-serialized to JSON text content. */
	handler: (params: Record<string, unknown>) => Promise<unknown>;
	/** Optional annotations for tool behavior hints. */
	annotations?: {
		readOnlyHint?: boolean;
		destructiveHint?: boolean;
		idempotentHint?: boolean;
		openWorldHint?: boolean;
	};
}

/**
 * Configuration for defining a resource.
 *
 * @example
 * ```ts
 * const resource: ResourceDefinition = {
 *   uri: 'config://settings',
 *   name: 'App Settings',
 *   handler: async () => ({ theme: 'dark', lang: 'en' }),
 * };
 * ```
 */
export interface ResourceDefinition {
	/** Resource URI (e.g., 'config://settings', 'data://patients'). */
	uri: string;
	/** Human-readable name. */
	name: string;
	/** Optional description. */
	description?: string;
	/** Handler that returns the resource content. */
	handler: () => Promise<unknown>;
	/** MIME type for the content. Defaults to 'application/json'. */
	mimeType?: string;
}

/**
 * Server configuration.
 *
 * @example
 * ```ts
 * const config: McpServerConfig = { name: 'rag-assistant', version: '1.0.0' };
 * ```
 */
export interface McpServerConfig {
	/** Server name (shown to MCP clients). */
	name: string;
	/** Semver version string. */
	version: string;
}

// ─── Internal Tool Registry ─────────────────────────────────────────────────

interface RegisteredTool {
	definition: ToolDefinition;
	wrappedHandler: (params: Record<string, unknown>) => Promise<McpToolResponse>;
}

interface RegisteredResource {
	definition: ResourceDefinition;
}

// ─── Server Builder ─────────────────────────────────────────────────────────

export class McpServerBuilder {
	private readonly _config: McpServerConfig;
	private readonly _tools = new Map<string, RegisteredTool>();
	private readonly _resources = new Map<string, RegisteredResource>();

	constructor(config: McpServerConfig) {
		this._config = config;
	}

	/**
	 * Define a tool with a Zod schema and handler.
	 *
	 * The handler's return value is automatically JSON-serialized into an MCP
	 * text content block. If the handler throws, the error is caught and
	 * returned as an MCP error response (no server crash).
	 *
	 * @example
	 * ```ts
	 * builder.defineTool({
	 *   name: 'lookup_patient',
	 *   description: 'Look up a patient by ID',
	 *   schema: { patientId: z.string() },
	 *   handler: async ({ patientId }) => db.query('SELECT * FROM patients WHERE id = $1', [patientId]),
	 * });
	 * ```
	 */
	defineTool(definition: ToolDefinition): this {
		if (this._tools.has(definition.name)) {
			throw new ValidationError(`Tool "${definition.name}" is already defined`);
		}

		const wrappedHandler = async (
			params: Record<string, unknown>,
		): Promise<McpToolResponse> => {
			try {
				const result = await definition.handler(params);
				return {
					content: [
						{
							type: "text" as const,
							text:
								typeof result === "string"
									? result
									: JSON.stringify(result, null, 2),
						},
					],
				};
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text" as const, text: `Error: ${message}` }],
					isError: true,
				};
			}
		};

		this._tools.set(definition.name, {
			definition,
			wrappedHandler,
		});

		return this;
	}

	/**
	 * Define a read-only resource.
	 *
	 * Resources expose data that MCP clients can surface to users or models.
	 * The handler's return value is JSON-serialized.
	 *
	 * @example
	 * ```ts
	 * builder.defineResource({
	 *   uri: 'data://patients',
	 *   name: 'Patient List',
	 *   handler: async () => db.query('SELECT id, name FROM patients LIMIT 100'),
	 * });
	 * ```
	 */
	defineResource(definition: ResourceDefinition): this {
		if (this._resources.has(definition.uri)) {
			throw new ValidationError(
				`Resource "${definition.uri}" is already defined`,
			);
		}
		this._resources.set(definition.uri, { definition });
		return this;
	}

	/**
	 * Connect to the MCP SDK's McpServer and register all tools/resources.
	 *
	 * Uses stdio transport by default (standard for CLI-based MCP servers).
	 * Dynamically imports the SDK — it's a peer dependency, not bundled.
	 *
	 * @example
	 * ```ts
	 * const builder = new McpServerBuilder({ name: 'my-server', version: '1.0.0' });
	 * builder.defineTool({ name: 'ping', description: 'Ping', schema: {}, handler: async () => 'pong' });
	 * await builder.start(); // connects via stdio transport
	 * ```
	 */
	async start(): Promise<void> {
		// Dynamic import — SDK is a peer dependency
		let McpServer: unknown;
		let StdioServerTransport: unknown;

		try {
			// Variable-based imports to skip TypeScript module resolution.
			// These are peer dependencies — installed by the consumer, not us.
			const mcpServerPath = "@modelcontextprotocol/sdk/server/mcp.js";
			const mcpTransportPath = "@modelcontextprotocol/sdk/server/stdio.js";
			const serverMod = await import(mcpServerPath);
			McpServer = serverMod.McpServer;
			const transportMod = await import(mcpTransportPath);
			StdioServerTransport = transportMod.StdioServerTransport;
		} catch {
			throw new ToolkitError(
				"@modelcontextprotocol/sdk is required. Run: yarn add @modelcontextprotocol/sdk",
				{ code: "MCP_MISSING_DEPENDENCY" },
			);
		}

		const McpServerCtor = McpServer as new (opts: {
			name: string;
			version: string;
		}) => Record<string, (...args: unknown[]) => unknown>;
		const server = new McpServerCtor({
			name: this._config.name,
			version: this._config.version,
		});

		// Register tools
		for (const [, registered] of this._tools) {
			const def = registered.definition;
			server.tool(
				def.name,
				def.description,
				def.schema,
				async (params: Record<string, unknown>) => {
					return registered.wrappedHandler(params);
				},
			);
		}

		// Register resources
		for (const [, registered] of this._resources) {
			const def = registered.definition;
			server.resource(
				def.name,
				def.uri,
				{ description: def.description },
				async () => {
					const data = await def.handler();
					return {
						contents: [
							{
								uri: def.uri,
								mimeType: def.mimeType ?? "application/json",
								text:
									typeof data === "string"
										? data
										: JSON.stringify(data, null, 2),
							},
						],
					};
				},
			);
		}

		const TransportCtor = StdioServerTransport as new () => unknown;
		const transport = new TransportCtor();
		await (server as { connect: (t: unknown) => Promise<void> }).connect(
			transport,
		);
	}

	/**
	 * Create a test harness for calling tools directly (no transport needed).
	 *
	 * Use this in unit tests to verify tool behavior without starting a server.
	 *
	 * @example
	 * ```typescript
	 * const harness = builder.createTestHarness();
	 * const result = await harness.callTool('search_documents', { query: 'test' });
	 * expect(result.isError).toBe(false);
	 * expect(JSON.parse(result.content[0].text!)).toHaveLength(3);
	 * ```
	 */
	createTestHarness(): McpTestHarness {
		return new McpTestHarness(this._tools, this._resources);
	}

	/**
	 * Get the list of registered tool names.
	 *
	 * @example
	 * ```ts
	 * const names = builder.toolNames; // ['search_docs', 'lookup_patient']
	 * ```
	 */
	get toolNames(): string[] {
		return [...this._tools.keys()];
	}

	/**
	 * Get the list of registered resource URIs.
	 *
	 * @example
	 * ```ts
	 * const uris = builder.resourceUris; // ['config://settings', 'data://patients']
	 * ```
	 */
	get resourceUris(): string[] {
		return [...this._resources.keys()];
	}
}

// ─── Test Harness ───────────────────────────────────────────────────────────

export class McpTestHarness {
	constructor(
		private readonly _tools: Map<string, RegisteredTool>,
		private readonly _resources: Map<string, RegisteredResource>,
	) {}

	/**
	 * Call a registered tool directly. Returns the MCP response.
	 *
	 * Throws if the tool doesn't exist. Error responses have `isError: true`.
	 */
	async callTool(
		name: string,
		params: Record<string, unknown> = {},
	): Promise<McpToolResponse> {
		const tool = this._tools.get(name);
		if (!tool) {
			throw new ValidationError(
				`Tool "${name}" not found. Available: ${[...this._tools.keys()].join(", ")}`,
			);
		}
		return tool.wrappedHandler(params);
	}

	/**
	 * Read a registered resource directly. Returns the raw handler output.
	 *
	 * @example
	 * ```ts
	 * const harness = builder.createTestHarness();
	 * const settings = await harness.readResource('config://settings');
	 * expect(settings).toEqual({ theme: 'dark' });
	 * ```
	 */
	async readResource(uri: string): Promise<unknown> {
		const resource = this._resources.get(uri);
		if (!resource) {
			throw new ValidationError(
				`Resource "${uri}" not found. Available: ${[...this._resources.keys()].join(", ")}`,
			);
		}
		return resource.definition.handler();
	}

	/** List all registered tool names. */
	get toolNames(): string[] {
		return [...this._tools.keys()];
	}

	/** List all registered resource URIs. */
	get resourceUris(): string[] {
		return [...this._resources.keys()];
	}
}
