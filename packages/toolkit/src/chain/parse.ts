/**
 * Parse — structured output parser wrapping Zod schema validation.
 *
 * Extracts JSON from LLM output text and validates against a Zod schema.
 * Provides formatting instructions to include in prompts so the LLM
 * knows what structure to produce.
 */

import type { z } from "zod";
import { ToolkitError } from "../errors/index.js";
import type { ParseConfig, Parser } from "./types.js";

// ─── JSON Extraction ──────────────────────────────────────────────────────

const JSON_BLOCK_REGEX = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/;
const JSON_OBJECT_REGEX = /\{[\s\S]*\}/;

function extractJSON(text: string): string {
	// Try fenced code block first
	const blockMatch = JSON_BLOCK_REGEX.exec(text);
	if (blockMatch?.[1]) {
		return blockMatch[1].trim();
	}

	// Fall back to first JSON object
	const objectMatch = JSON_OBJECT_REGEX.exec(text);
	if (objectMatch?.[0]) {
		return objectMatch[0].trim();
	}

	return text.trim();
}

// ─── Format Instructions ──────────────────────────────────────────────────

function buildFormatInstructions(schema: z.ZodType): string {
	const shape = getSchemaShape(schema);
	const lines = [
		"Respond with a JSON object matching this structure:",
		"```json",
		JSON.stringify(shape, null, 2),
		"```",
		"Return ONLY the JSON object, no additional text.",
	];
	return lines.join("\n");
}

function getSchemaShape(schema: z.ZodType): Record<string, string> {
	// Extract shape description from Zod schema
	const shape: Record<string, string> = {};
	const desc = schema.description;

	if (
		"shape" in schema &&
		typeof schema.shape === "object" &&
		schema.shape !== null
	) {
		const zodShape = schema.shape as Record<string, z.ZodType>;
		for (const [key, value] of Object.entries(zodShape)) {
			shape[key] = value.description ?? describeZodType(value);
		}
	} else if (desc) {
		shape._description = desc;
	} else {
		shape._type = "object";
	}

	return shape;
}

function describeZodType(schema: z.ZodType): string {
	const typeName = schema.constructor.name;
	const typeMap: Record<string, string> = {
		ZodString: "string",
		ZodNumber: "number",
		ZodBoolean: "boolean",
		ZodArray: "array",
		ZodOptional: "optional",
		ZodEnum: "enum",
	};
	return typeMap[typeName] ?? "unknown";
}

// ─── parse() ──────────────────────────────────────────────────────────────

/**
 * Create a structured output parser from a Zod schema.
 *
 * Extracts JSON from LLM text output (handles markdown code blocks)
 * and validates it against the provided schema.
 *
 * @param config - Zod schema or ParseConfig object.
 * @returns A Parser with parse() and getFormatInstructions() methods.
 *
 * @example
 * ```ts
 * import { parse } from '@jamaalbuilds/ai-toolkit/chain';
 * import { z } from 'zod';
 *
 * const parser = parse({
 *   schema: z.object({
 *     name: z.string().describe("Person's name"),
 *     age: z.number().describe("Person's age"),
 *   }),
 *   name: "person",
 * });
 *
 * const result = await parser.parse('```json\n{"name": "Alice", "age": 30}\n```');
 * // result: { name: "Alice", age: 30 }
 *
 * const instructions = parser.getFormatInstructions();
 * // Include in your prompt so the LLM knows the expected format
 * ```
 */
export function parse<T>(config: ParseConfig<T> | z.ZodType<T>): Parser<T> {
	// Detect if config is a ParseConfig (has schema property) or a raw Zod schema
	const isParseConfig =
		config !== null &&
		typeof config === "object" &&
		"schema" in config &&
		(config as ParseConfig<T>).schema !== undefined;

	const normalized: ParseConfig<T> = isParseConfig
		? (config as ParseConfig<T>)
		: { schema: config as z.ZodType<T> };

	if (
		!normalized.schema ||
		typeof normalized.schema !== "object" ||
		typeof normalized.schema.parse !== "function"
	) {
		throw new ToolkitError("parse() requires a valid Zod schema", {
			code: "CHAIN_INVALID_SCHEMA",
		});
	}

	const parserName = normalized.name ?? "structured-output";

	return {
		async parse(text: string): Promise<T> {
			if (typeof text !== "string") {
				throw new ToolkitError(`${parserName} parser requires a string input`, {
					code: "CHAIN_PARSE_INVALID_INPUT",
				});
			}

			const jsonStr = extractJSON(text);

			let parsed: unknown;
			try {
				parsed = JSON.parse(jsonStr);
			} catch (error) {
				throw new ToolkitError(
					`${parserName} parser failed to extract JSON from LLM output`,
					{
						code: "CHAIN_PARSE_JSON_FAILED",
						cause: error instanceof Error ? error : undefined,
					},
				);
			}

			try {
				return normalized.schema.parse(parsed) as T;
			} catch (error) {
				throw new ToolkitError(
					`${parserName} parser output does not match schema`,
					{
						code: "CHAIN_PARSE_SCHEMA_FAILED",
						cause: error instanceof Error ? error : undefined,
					},
				);
			}
		},

		getFormatInstructions(): string {
			return buildFormatInstructions(normalized.schema);
		},
	};
}
