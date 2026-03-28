import { describe, expect, it } from "vitest";
import { detectPII, sanitizeForLLM } from "../pii.js";

// ─── LEVEL 1: CRASH ─────────────────────────────────────────────────────────

describe("detectPII", () => {
	it("does not throw on valid input", () => {
		expect(() => detectPII("hello world")).not.toThrow();
	});

	it("throws ValidationError on non-string input", () => {
		expect(() => detectPII(123 as unknown as string)).toThrow(
			/requires a string/,
		);
	});

	it("returns empty array for text with no PII", () => {
		expect(detectPII("The weather is nice today")).toEqual([]);
	});

	// ─── LEVEL 2: BEHAVIOR ───────────────────────────────────────────────────

	it("detects SSN in xxx-xx-xxxx format", () => {
		const findings = detectPII("My SSN is 123-45-6789");
		expect(findings).toHaveLength(1);
		expect(findings[0].type).toBe("SSN");
		expect(findings[0].match).toBe("123-45-6789");
	});

	it("detects SSN with spaces", () => {
		const findings = detectPII("SSN: 123 45 6789");
		expect(findings).toHaveLength(1);
		expect(findings[0].type).toBe("SSN");
	});

	it("detects email addresses", () => {
		const findings = detectPII("Contact jane.doe@example.com for info");
		expect(findings).toHaveLength(1);
		expect(findings[0].type).toBe("EMAIL");
		expect(findings[0].match).toBe("jane.doe@example.com");
	});

	it("detects phone numbers in various formats", () => {
		const texts = [
			"Call 555-123-4567",
			"Call (555) 123-4567",
			"Call 555.123.4567",
			"Call +1-555-123-4567",
		];
		for (const text of texts) {
			const findings = detectPII(text);
			const phones = findings.filter((f) => f.type === "PHONE");
			expect(phones.length).toBeGreaterThanOrEqual(1);
		}
	});

	it("detects names (Title Case sequences)", () => {
		const findings = detectPII("Please contact John Smith about the project");
		const names = findings.filter((f) => f.type === "NAME");
		expect(names).toHaveLength(1);
		expect(names[0].match).toBe("John Smith");
	});

	it("detects dates of birth in MM/DD/YYYY format", () => {
		const findings = detectPII("DOB: 01/15/1990");
		const dobs = findings.filter((f) => f.type === "DOB");
		expect(dobs).toHaveLength(1);
		expect(dobs[0].match).toBe("01/15/1990");
	});

	it("detects dates in YYYY-MM-DD format", () => {
		const findings = detectPII("Born on 1990-01-15");
		const dobs = findings.filter((f) => f.type === "DOB");
		expect(dobs).toHaveLength(1);
		expect(dobs[0].match).toBe("1990-01-15");
	});

	it("detects multiple PII types in one string", () => {
		const findings = detectPII(
			"John Smith (john@acme.com) SSN 123-45-6789 phone 555-123-4567 DOB 01/15/1990",
		);
		const types = new Set(findings.map((f) => f.type));
		expect(types.has("NAME")).toBe(true);
		expect(types.has("EMAIL")).toBe(true);
		expect(types.has("SSN")).toBe(true);
		expect(types.has("PHONE")).toBe(true);
		expect(types.has("DOB")).toBe(true);
	});

	// ─── LEVEL 3: DATA QUALITY ───────────────────────────────────────────────

	it("returns findings sorted by start position", () => {
		const findings = detectPII("SSN 123-45-6789 email jane@test.com");
		expect(findings.length).toBeGreaterThanOrEqual(2);
		for (let i = 1; i < findings.length; i++) {
			expect(findings[i].start).toBeGreaterThanOrEqual(findings[i - 1].start);
		}
	});

	it("includes correct start and end positions", () => {
		const text = "My SSN is 123-45-6789 ok";
		const findings = detectPII(text);
		const ssn = findings.find((f) => f.type === "SSN");
		expect(ssn).toBeDefined();
		if (ssn) {
			expect(text.slice(ssn.start, ssn.end)).toBe("123-45-6789");
		}
	});

	// ─── LEVEL 4: ENVIRONMENT ────────────────────────────────────────────────

	it("handles empty string", () => {
		expect(detectPII("")).toEqual([]);
	});

	it("is safe to call multiple times (regex lastIndex reset)", () => {
		detectPII("123-45-6789");
		const second = detectPII("123-45-6789");
		expect(second).toHaveLength(1);
	});
});

// ─── sanitizeForLLM ─────────────────────────────────────────────────────────

describe("sanitizeForLLM", () => {
	it("does not throw on valid input", () => {
		expect(() => sanitizeForLLM("hello")).not.toThrow();
	});

	it("throws ValidationError on non-string input", () => {
		expect(() => sanitizeForLLM(null as unknown as string)).toThrow(
			/requires a string/,
		);
	});

	it("returns text unchanged when no PII found", () => {
		expect(sanitizeForLLM("No PII here")).toBe("No PII here");
	});

	// ─── LEVEL 2: BEHAVIOR ───────────────────────────────────────────────────

	it("replaces SSN with [REDACTED_SSN]", () => {
		expect(sanitizeForLLM("SSN: 123-45-6789")).toBe("SSN: [REDACTED_SSN]");
	});

	it("replaces email with [REDACTED_EMAIL]", () => {
		expect(sanitizeForLLM("Email: jane@example.com")).toBe(
			"Email: [REDACTED_EMAIL]",
		);
	});

	it("replaces phone with [REDACTED_PHONE]", () => {
		expect(sanitizeForLLM("Call 555-123-4567")).toBe("Call [REDACTED_PHONE]");
	});

	it("replaces name with [REDACTED_NAME]", () => {
		expect(sanitizeForLLM("Please contact John Smith")).toBe(
			"Please contact [REDACTED_NAME]",
		);
	});

	it("replaces DOB with [REDACTED_DOB]", () => {
		expect(sanitizeForLLM("Born 01/15/1990")).toBe("Born [REDACTED_DOB]");
	});

	it("replaces multiple PII instances", () => {
		const result = sanitizeForLLM("SSN 123-45-6789 email jane@test.com");
		expect(result).toContain("[REDACTED_SSN]");
		expect(result).toContain("[REDACTED_EMAIL]");
		expect(result).not.toContain("123-45-6789");
		expect(result).not.toContain("jane@test.com");
	});

	// ─── LEVEL 4: ENVIRONMENT ────────────────────────────────────────────────

	it("handles empty string", () => {
		expect(sanitizeForLLM("")).toBe("");
	});
});
