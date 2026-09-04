import { afterEach, describe, expect, it, vi } from "vitest";
import { StorageError } from "../../errors/types.js";
import { uploadDocument } from "../blob.js";

// Simulates the two ways loading `@vercel/blob` can fail: the package
// genuinely cannot be resolved, vs. it resolves but throws while loading
// (e.g. a broken subdependency). vi.mock("@vercel/blob") in blob.test.ts
// only covers the "loads fine" path, so this file exercises both failure
// branches directly with vi.doMock.
//
// The factory itself must not throw — Vitest swallows a thrown factory
// and reports its own hoisting-related diagnostic instead of the thrown
// error, so failures are simulated via a getter on `put` that throws when
// blob.ts reads it, which happens inside the same try block as the
// `import()` call.
afterEach(() => {
	vi.doUnmock("@vercel/blob");
});

describe("uploadDocument — optional peer load failure", () => {
	it("ENVIRONMENT — reports STORAGE_MISSING_DEPENDENCY when the module cannot be resolved", async () => {
		vi.doMock("@vercel/blob", () => ({
			get put(): never {
				const error = new Error(
					"Cannot find package '@vercel/blob' imported from blob.js",
				) as Error & { code: string };
				error.code = "ERR_MODULE_NOT_FOUND";
				throw error;
			},
		}));

		try {
			await uploadDocument(Buffer.from("data"));
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(StorageError);
			expect((err as StorageError).code).toBe("STORAGE_MISSING_DEPENDENCY");
			expect((err as StorageError).message).toMatch(/not installed/i);
			expect((err as StorageError).cause).toBeInstanceOf(Error);
		}
	});

	it("ENVIRONMENT — preserves cause and skips 'not installed' wording for an unrelated load failure", async () => {
		vi.doMock("@vercel/blob", () => ({
			get put(): never {
				throw new Error("Cannot read properties of undefined (reading 'foo')");
			},
		}));

		try {
			await uploadDocument(Buffer.from("data"));
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(StorageError);
			expect((err as StorageError).code).toBe("STORAGE_LOAD_FAILED");
			expect((err as StorageError).message).not.toMatch(/not installed/i);
			expect((err as StorageError).cause).toBeInstanceOf(Error);
			expect((err as StorageError).cause?.message).toMatch(
				/cannot read properties/i,
			);
		}
	});
});
