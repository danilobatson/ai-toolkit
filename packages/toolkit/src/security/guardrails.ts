/**
 * Guardrails — input and output validation for LLM interactions.
 *
 * Block off-topic, dangerous, or policy-violating queries before they reach
 * the model, and validate model output before returning to users.
 *
 * @example
 * ```ts
 * import { createGuardrails, checkOutput } from '@jamaalbuilds/ai-toolkit';
 *
 * const guard = createGuardrails([
 *   { id: 'no-code-gen', description: 'Block code generation requests', test: /write.*code|generate.*script/i },
 *   { id: 'on-topic', description: 'Must mention our product', test: (text) => !text.toLowerCase().includes('acme') },
 * ]);
 *
 * const result = guard.check('Write me a Python script');
 * // { allowed: false, violations: ['no-code-gen'], reasons: ['Block code generation requests'] }
 *
 * const outputResult = checkOutput('The answer is 42', [
 *   { id: 'no-hallucination', description: 'Must cite sources', test: (text) => !text.includes('[source]') },
 * ]);
 * ```
 */

import { ValidationError } from "../errors/types.js";
import type { GuardrailResult, GuardrailRule, Guardrails } from "./types.js";

/**
 * Create an input guardrail that checks text against a set of rules.
 *
 * Each rule's `test` can be a RegExp (match = violation) or a function
 * (return `true` = violation).
 *
 * @example
 * ```ts
 * const guard = createGuardrails([
 *   { id: 'no-pii', description: 'Block PII in prompts', test: /\d{3}-\d{2}-\d{4}/ },
 * ]);
 * guard.check('My SSN is 123-45-6789');
 * // { allowed: false, violations: ['no-pii'], reasons: ['Block PII in prompts'] }
 * ```
 */
export function createGuardrails(rules: GuardrailRule[]): Guardrails {
	if (!Array.isArray(rules)) {
		throw new ValidationError("createGuardrails requires an array of rules", {
			fields: { rules: "must be an array" },
		});
	}

	for (const rule of rules) {
		if (!rule.id || !rule.description || !rule.test) {
			throw new ValidationError(
				`Guardrail rule must have id, description, and test. Got: ${JSON.stringify({ id: rule.id, description: rule.description })}`,
				{ fields: { rule: "missing required fields" } },
			);
		}
	}

	return {
		check(text: string): GuardrailResult {
			if (typeof text !== "string") {
				throw new ValidationError(
					"guardrails.check requires a string argument",
					{
						fields: { text: "must be a string" },
					},
				);
			}

			const violations: string[] = [];
			const reasons: string[] = [];

			for (const rule of rules) {
				let violated = false;

				if (rule.test instanceof RegExp) {
					// Reset lastIndex for global regexes
					rule.test.lastIndex = 0;
					violated = rule.test.test(text);
				} else {
					violated = rule.test(text);
				}

				if (violated) {
					violations.push(rule.id);
					reasons.push(rule.description);
				}
			}

			return {
				allowed: violations.length === 0,
				violations,
				reasons,
			};
		},
	};
}

/**
 * Validate LLM output against a set of rules. Same rule format as input guardrails.
 *
 * Use this to catch hallucinated content, policy violations, or format issues
 * in model responses before returning them to users.
 *
 * @example
 * ```ts
 * const result = checkOutput('I think the answer is maybe 42', [
 *   { id: 'no-hedging', description: 'No uncertain language', test: /I think|maybe|probably/i },
 * ]);
 * // { allowed: false, violations: ['no-hedging'], reasons: ['No uncertain language'] }
 * ```
 */
export function checkOutput(
	response: string,
	rules: GuardrailRule[],
): GuardrailResult {
	if (typeof response !== "string") {
		throw new ValidationError("checkOutput requires a string response", {
			fields: { response: "must be a string" },
		});
	}

	if (!Array.isArray(rules)) {
		throw new ValidationError("checkOutput requires an array of rules", {
			fields: { rules: "must be an array" },
		});
	}

	// Reuse the same logic — guardrails work identically on input and output
	const guard = createGuardrails(rules);
	return guard.check(response);
}
