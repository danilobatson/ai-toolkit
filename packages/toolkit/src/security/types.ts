/**
 * Security module types — PII detection, guardrails, and content validation.
 */

// ─── PII Detection ─────────────────────────────────────────────────────────

/** Categories of personally identifiable information detected. */
export type PIIType = "SSN" | "EMAIL" | "PHONE" | "NAME" | "DOB";

/** A single PII finding returned by detectPII. */
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

/** A single guardrail rule for input or output validation. */
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

/** Result of a guardrail check. */
export interface GuardrailResult {
	/** Whether the text passed all rules (true = safe, false = blocked). */
	allowed: boolean;
	/** IDs of rules that were violated. Empty if allowed. */
	violations: string[];
	/** Human-readable descriptions of violated rules. */
	reasons: string[];
}

/** Input guardrails created by createGuardrails. */
export interface Guardrails {
	/** Check input text against all configured rules. */
	check(text: string): GuardrailResult;
}
