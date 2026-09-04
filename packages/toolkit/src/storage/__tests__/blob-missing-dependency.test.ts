import { describe, expect, it } from "vitest";
import { StorageError } from "../../errors/types.js";
import { deleteDocument, listDocuments, uploadDocument } from "../blob.js";

// @vercel/blob is not installed in this workspace — exercises the real
// "peer dependency missing" path with no mocking involved.
describe("storage/blob — @vercel/blob not installed", () => {
	it("ENVIRONMENT — uploadDocument reports missing dependency", async () => {
		try {
			await uploadDocument(Buffer.from("data"));
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(StorageError);
			expect((err as StorageError).code).toBe("STORAGE_MISSING_DEPENDENCY");
		}
	});

	it("ENVIRONMENT — deleteDocument reports missing dependency", async () => {
		try {
			await deleteDocument("https://blob.vercel-storage.com/doc.pdf");
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(StorageError);
			expect((err as StorageError).code).toBe("STORAGE_MISSING_DEPENDENCY");
		}
	});

	it("ENVIRONMENT — listDocuments reports missing dependency", async () => {
		try {
			await listDocuments();
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(StorageError);
			expect((err as StorageError).code).toBe("STORAGE_MISSING_DEPENDENCY");
		}
	});
});
