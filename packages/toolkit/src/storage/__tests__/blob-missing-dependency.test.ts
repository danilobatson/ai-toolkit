import { describe, expect, it } from "vitest";
import { StorageError } from "../../errors/types.js";
import { deleteDocument, listDocuments, uploadDocument } from "../blob.js";

// No vi.mock("@vercel/blob", ...) here — @vercel/blob is a peer dependency
// that is not installed in this environment, so this exercises the real
// "package genuinely missing" path through await import().
describe("storage — @vercel/blob not installed", () => {
	it("ENVIRONMENT — uploadDocument reports the missing dependency", async () => {
		try {
			await uploadDocument(Buffer.from("x"));
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(StorageError);
			expect((err as StorageError).code).toBe("STORAGE_MISSING_DEPENDENCY");
		}
	});

	it("ENVIRONMENT — deleteDocument reports the missing dependency", async () => {
		try {
			await deleteDocument("https://blob.vercel-storage.com/x.pdf");
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(StorageError);
			expect((err as StorageError).code).toBe("STORAGE_MISSING_DEPENDENCY");
		}
	});

	it("ENVIRONMENT — listDocuments reports the missing dependency", async () => {
		try {
			await listDocuments();
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(StorageError);
			expect((err as StorageError).code).toBe("STORAGE_MISSING_DEPENDENCY");
		}
	});
});
