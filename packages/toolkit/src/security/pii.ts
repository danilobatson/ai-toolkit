/**
 * PII detection and sanitization for LLM inputs.
 *
 * Detects SSNs, emails, phone numbers, names (Title Case sequences),
 * and dates of birth. Sanitizes by replacing with typed redaction tokens.
 *
 * @example
 * ```ts
 * import { detectPII, sanitizeForLLM } from '@jamaalbuilds/ai-toolkit';
 *
 * const findings = detectPII('Call John Smith at 555-123-4567');
 * // [{ type: 'NAME', match: 'John Smith', ... }, { type: 'PHONE', match: '555-123-4567', ... }]
 *
 * const safe = sanitizeForLLM('My SSN is 123-45-6789');
 * // 'My SSN is [REDACTED_SSN]'
 * ```
 */

import { ValidationError } from "../errors/types.js";
import type { PIIFinding, PIIType } from "./types.js";

// ─── PII Patterns ───────────────────────────────────────────────────────────

interface PIIPattern {
	type: PIIType;
	regex: RegExp;
}

const PII_PATTERNS: PIIPattern[] = [
	// SSN: 123-45-6789 or 123 45 6789
	{ type: "SSN", regex: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g },
	// Email: standard email format
	{
		type: "EMAIL",
		regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
	},
	// Phone: (555) 123-4567, 555-123-4567, 555.123.4567, +1-555-123-4567
	{
		type: "PHONE",
		regex: /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
	},
	// DOB: MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD
	{
		type: "DOB",
		regex: /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g,
	},
	// Name: Two or more consecutive Title Case words (heuristic)
	{ type: "NAME", regex: /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/g },
];

/**
 * Detect PII in text. Returns an array of findings with type, match, and position.
 *
 * Detected types: SSN, EMAIL, PHONE, NAME, DOB.
 *
 * @example
 * ```ts
 * const findings = detectPII('Email jane@example.com, SSN 123-45-6789');
 * // findings[0] = { type: 'SSN', match: '123-45-6789', start: 28, end: 39 }
 * // findings[1] = { type: 'EMAIL', match: 'jane@example.com', start: 6, end: 22 }
 * ```
 */
export function detectPII(text: string): PIIFinding[] {
	if (typeof text !== "string") {
		throw new ValidationError("detectPII requires a string argument", {
			fields: { text: "must be a string" },
		});
	}

	const findings: PIIFinding[] = [];

	for (const pattern of PII_PATTERNS) {
		// Reset regex lastIndex for each call
		pattern.regex.lastIndex = 0;
		for (;;) {
			const match = pattern.regex.exec(text);
			if (match === null) break;
			findings.push({
				type: pattern.type,
				match: match[0],
				start: match.index,
				end: match.index + match[0].length,
			});
		}
	}

	// Sort by position for predictable ordering
	findings.sort((a, b) => a.start - b.start);

	return findings;
}

/** Redaction token map — each PII type gets a distinct placeholder. */
const REDACTION_TOKENS: Record<PIIType, string> = {
	SSN: "[REDACTED_SSN]",
	EMAIL: "[REDACTED_EMAIL]",
	PHONE: "[REDACTED_PHONE]",
	NAME: "[REDACTED_NAME]",
	DOB: "[REDACTED_DOB]",
};

/**
 * Replace all detected PII with typed redaction tokens.
 *
 * Processes replacements from end-to-start to preserve string positions.
 *
 * @example
 * ```ts
 * sanitizeForLLM('Contact John Smith at john@acme.com')
 * // 'Contact [REDACTED_NAME] at [REDACTED_EMAIL]'
 * ```
 */
export function sanitizeForLLM(text: string): string {
	if (typeof text !== "string") {
		throw new ValidationError("sanitizeForLLM requires a string argument", {
			fields: { text: "must be a string" },
		});
	}

	const findings = detectPII(text);

	if (findings.length === 0) return text;

	// Deduplicate overlapping findings — keep the earlier/longer match
	const deduped: PIIFinding[] = [];
	for (const finding of findings) {
		const last = deduped[deduped.length - 1];
		if (last && finding.start < last.end) {
			// Overlapping — keep the longer one
			if (finding.end - finding.start > last.end - last.start) {
				deduped[deduped.length - 1] = finding;
			}
			continue;
		}
		deduped.push(finding);
	}

	// Replace from end to start to preserve indices
	let result = text;
	for (let i = deduped.length - 1; i >= 0; i--) {
		const f = deduped[i];
		result =
			result.slice(0, f.start) + REDACTION_TOKENS[f.type] + result.slice(f.end);
	}

	return result;
}
