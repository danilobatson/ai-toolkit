/**
 * Security module types — PII detection, guardrails, and content validation.
 */

// ─── PII Detection ─────────────────────────────────────────────────────────

/**
 * Categories of personally identifiable information detected.
 *
 * @example
 * ```ts
 * const typeToCheck: PIIType = 'SSN';
 * const findings = detectPII(text);
 * const ssns = findings.filter(f => f.type === typeToCheck);
 * ```
 */
export type PIIType = "SSN" | "EMAIL" | "PHONE" | "NAME" | "DOB";

/**
 * A single PII finding returned by detectPII.
 *
 * @example
 * ```ts
 * const findings: PIIFinding[] = detectPII('SSN: 123-45-6789');
 * for (const finding of findings) {
 *   console.log(`${finding.type} at ${finding.start}-${finding.end}: ${finding.match}`);
 * }
 * ```
 */
export interface PIIFinding {
	/** The type of PII detected. */
	type: PIIType;
	/** The matched text. */
	match: string;
	/** Start index in the original string. */
	start: number;
	/** End index in the original string. */
	end: number;
}

// ─── Guardrails ─────────────────────────────────────────────────────────────

/**
 * A single guardrail rule for input or output validation.
 *
 * @example
 * ```ts
 * const rule: GuardrailRule = {
 *   id: 'no-pii',
 *   description: 'Block PII in prompts',
 *   test: /\d{3}-\d{2}-\d{4}/,
 * };
 * ```
 */
export interface GuardrailRule {
	/** Unique identifier for this rule. */
	id: string;
	/** Human-readable description of the rule. */
	description: string;
	/**
	 * Test function. Return `true` if the text violates this rule (should be blocked).
	 * Can also be a regex — if the regex matches, the text is blocked.
	 */
	test: RegExp | ((text: string) => boolean);
}

/**
 * Result of a guardrail check.
 *
 * @example
 * ```ts
 * const result: GuardrailResult = guard.check('user input');
 * if (!result.allowed) {
 *   console.log('Blocked by:', result.violations.join(', '));
 * }
 * ```
 */
export interface GuardrailResult {
	/** Whether the text passed all rules (true = safe, false = blocked). */
	allowed: boolean;
	/** IDs of rules that were violated. Empty if allowed. */
	violations: string[];
	/** Human-readable descriptions of violated rules. */
	reasons: string[];
}

/**
 * Input guardrails created by createGuardrails.
 *
 * @example
 * ```ts
 * const guard: Guardrails = createGuardrails(rules);
 * const result = guard.check('Is this safe?');
 * ```
 */
export interface Guardrails {
	/** Check input text against all configured rules. */
	check(text: string): GuardrailResult;
}
