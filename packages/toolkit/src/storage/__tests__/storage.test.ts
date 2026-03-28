import { describe, expect, it } from "vitest";
import { StorageError } from "../../errors/types.js";
import { validateFile } from "../blob.js";

describe("validateFile", () => {
	it("accepts valid file within limits", () => {
		expect(() =>
			validateFile({ size: 1024, type: "application/pdf", name: "doc.pdf" }),
		).not.toThrow();
	});

	it("rejects file exceeding maxSize", () => {
		expect(() =>
			validateFile(
				{ size: 20 * 1024 * 1024, type: "application/pdf" },
				{ maxSizeMB: 10 },
			),
		).toThrow(/too large/i);
	});

	it("rejects disallowed MIME type", () => {
		expect(() => validateFile({ size: 100, type: "application/exe" })).toThrow(
			/not allowed/i,
		);
	});

	it("rejects empty filename", () => {
		expect(() =>
			validateFile({ size: 100, type: "application/pdf", name: "" }),
		).toThrow(/filename/i);
		expect(() =>
			validateFile({ size: 100, type: "application/pdf", name: "   " }),
		).toThrow(/filename/i);
	});

	it("throws StorageError on validation failure", () => {
		try {
			validateFile(
				{ size: 100 * 1024 * 1024, type: "application/pdf" },
				{ maxSizeMB: 1 },
			);
		} catch (err) {
			expect(err).toBeInstanceOf(StorageError);
		}
	});
});
