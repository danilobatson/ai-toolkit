/**
 * Prompt — template builder wrapping LangChain ChatPromptTemplate.
 *
 * Falls back to a built-in template engine when @langchain/core is not installed.
 */

import { ToolkitError } from "../errors/index.js";
import type { ChatMessage, PromptConfig, PromptTemplate } from "./types.js";

// ─── Variable Extraction ──────────────────────────────────────────────────

const VARIABLE_REGEX = /\{(\w+)\}/g;

function extractVariables(template: string): string[] {
	const vars = new Set<string>();
	VARIABLE_REGEX.lastIndex = 0;
	let match = VARIABLE_REGEX.exec(template);
	while (match !== null) {
		vars.add(match[1]);
		match = VARIABLE_REGEX.exec(template);
	}
	return Array.from(vars);
}

function interpolate(template: string, values: Record<string, string>): string {
	return template.replace(VARIABLE_REGEX, (_, key: string) => {
		if (key in values) {
			return values[key];
		}
		throw new ToolkitError(`Missing variable "${key}" in prompt template`, {
			code: "CHAIN_MISSING_VARIABLE",
		});
	});
}

// ─── Role Mapping ─────────────────────────────────────────────────────────

const ROLE_MAP: Record<ChatMessage["role"], string> = {
	system: "System",
	human: "Human",
	ai: "Assistant",
};

// ─── prompt() ─────────────────────────────────────────────────────────────

/**
 * Create a prompt template for formatting LLM inputs.
 *
 * Accepts a simple string template with {variable} placeholders,
 * or an array of [role, template] tuples for multi-message prompts.
 *
 * @param config - Template string or PromptConfig object.
 * @returns A PromptTemplate with format() and formatMessages() methods.
 *
 * @example
 * ```ts
 * import { prompt } from '@jamaalbuilds/ai-toolkit/chain';
 *
 * // Simple template
 * const p = prompt({ template: "Answer this: {question}" });
 * const text = await p.format({ question: "What is RAG?" });
 *
 * // Multi-message template
 * const p2 = prompt({
 *   template: [
 *     ["system", "You are a helpful assistant."],
 *     ["human", "{question}"],
 *   ],
 * });
 * const messages = await p2.formatMessages({ question: "What is RAG?" });
 * ```
 */
export function prompt(config: PromptConfig | string): PromptTemplate {
	const normalized: PromptConfig =
		typeof config === "string" ? { template: config } : config;

	if (
		!normalized.template ||
		(typeof normalized.template !== "string" &&
			!Array.isArray(normalized.template))
	) {
		throw new ToolkitError(
			"prompt() requires a non-empty template string or message array",
			{ code: "CHAIN_INVALID_PROMPT" },
		);
	}

	// Determine input variables
	let inputVariables: string[];
	if (normalized.inputVariables) {
		inputVariables = normalized.inputVariables;
	} else if (typeof normalized.template === "string") {
		inputVariables = extractVariables(normalized.template);
	} else {
		const allVars = new Set<string>();
		for (const [, tmpl] of normalized.template) {
			for (const v of extractVariables(tmpl)) {
				allVars.add(v);
			}
		}
		inputVariables = Array.from(allVars);
	}

	return {
		inputVariables,

		async format(values: Record<string, string>): Promise<string> {
			if (typeof normalized.template === "string") {
				return interpolate(normalized.template, values);
			}

			// Multi-message: join as labeled sections
			return normalized.template
				.map(
					([role, tmpl]) =>
						`${ROLE_MAP[role] ?? role}: ${interpolate(tmpl, values)}`,
				)
				.join("\n\n");
		},

		async formatMessages(
			values: Record<string, string>,
		): Promise<ChatMessage[]> {
			if (typeof normalized.template === "string") {
				return [
					{ role: "human", content: interpolate(normalized.template, values) },
				];
			}

			return normalized.template.map(([role, tmpl]) => ({
				role,
				content: interpolate(tmpl, values),
			}));
		},
	};
}
