import Module from "node:module";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { StorageError } from "../../errors/types.js";

// Mock @vercel/blob via Module._load since blob.ts uses require() (CJS)
// and vi.mock doesn't intercept native require() in ESM mode.
const mockPut = vi.fn();
const mockDel = vi.fn();
const mockList = vi.fn();

const originalLoad = Module._load;

beforeAll(() => {
	// @ts-expect-error — overriding internal API for test mocking
	Module._load = function (request: string, parent: unknown, isMain: boolean) {
		if (request === "@vercel/blob") {
			return { put: mockPut, del: mockDel, list: mockList };
		}
		return originalLoad.call(this, request, parent, isMain);
	};
});

afterAll(() => {
	Module._load = originalLoad;
});

beforeEach(() => {
	vi.clearAllMocks();
});

// Dynamic import after mock is set up
const { uploadDocument, deleteDocument, listDocuments } = await import(
	"../blob.js"
);

describe("uploadDocument", () => {
	it("CRASH — does not throw on valid input", async () => {
		mockPut.mockResolvedValueOnce({
			url: "https://blob.vercel-storage.com/uploads/doc.pdf",
			pathname: "uploads/doc.pdf",
			contentType: "application/pdf",
			size: 1024,
		});

		await expect(
			uploadDocument(Buffer.from("hello"), {
				folder: "docs",
				filename: "doc.pdf",
			}),
		).resolves.toBeDefined();
	});

	it("BEHAVIOR — returns correct UploadResult shape", async () => {
		mockPut.mockResolvedValueOnce({
			url: "https://blob.vercel-storage.com/docs/file.md",
			pathname: "docs/file.md",
			contentType: "text/markdown",
			size: 512,
		});

		const result = await uploadDocument(Buffer.from("# Hello"), {
			folder: "docs",
			filename: "file.md",
			access: "public",
		});

		expect(result.url).toBe("https://blob.vercel-storage.com/docs/file.md");
		expect(result.pathname).toBe("docs/file.md");
		expect(result.contentType).toBe("text/markdown");
		expect(result.size).toBe(512);
	});

	it("BEHAVIOR — uses default folder and generates filename when not specified", async () => {
		mockPut.mockResolvedValueOnce({
			url: "https://blob.vercel-storage.com/uploads/123-document",
			pathname: "uploads/123-document",
			contentType: "application/octet-stream",
			size: 10,
		});

		await uploadDocument(Buffer.from("data"));

		expect(mockPut).toHaveBeenCalledWith(
			expect.stringMatching(/^uploads\/\d+-document$/),
			expect.anything(),
			expect.objectContaining({ access: "private" }),
		);
	});

	it("DATA QUALITY — coerces non-standard result fields to correct types", async () => {
		mockPut.mockResolvedValueOnce({
			url: 42,
			pathname: null,
			contentType: undefined,
			size: "not-a-number",
		});

		const result = await uploadDocument(Buffer.from("x"));

		expect(typeof result.url).toBe("string");
		expect(typeof result.pathname).toBe("string");
		expect(result.contentType).toBe("application/octet-stream");
		expect(result.size).toBe(0);
	});

	it("ENVIRONMENT — wraps blob.put errors as StorageError", async () => {
		mockPut.mockRejectedValueOnce(new Error("Network timeout"));

		try {
			await uploadDocument(Buffer.from("fail"));
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(StorageError);
			expect((err as StorageError).message).toMatch(/upload failed/i);
			expect((err as StorageError).code).toBe("STORAGE_UPLOAD_FAILED");
		}
	});

	it("ENVIRONMENT — upload error is retryable", async () => {
		mockPut.mockRejectedValueOnce(new Error("server error"));

		try {
			await uploadDocument(Buffer.from("fail"));
		} catch (err) {
			expect((err as StorageError).retryable).toBe(true);
		}
	});
});

describe("deleteDocument", () => {
	it("CRASH — does not throw on valid input", async () => {
		mockDel.mockResolvedValueOnce(undefined);
		await expect(
			deleteDocument("https://blob.vercel-storage.com/docs/file.pdf"),
		).resolves.toBeUndefined();
	});

	it("BEHAVIOR — calls blob.del with the provided URL", async () => {
		mockDel.mockResolvedValueOnce(undefined);
		const url = "https://blob.vercel-storage.com/docs/file.pdf";
		await deleteDocument(url);
		expect(mockDel).toHaveBeenCalledWith(url);
	});

	it("ENVIRONMENT — wraps del errors as StorageError", async () => {
		mockDel.mockRejectedValueOnce(new Error("Not found"));

		try {
			await deleteDocument("https://blob.vercel-storage.com/missing.pdf");
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(StorageError);
			expect((err as StorageError).code).toBe("STORAGE_DELETE_FAILED");
		}
	});
});

describe("listDocuments", () => {
	it("CRASH — does not throw on valid input", async () => {
		mockList.mockResolvedValueOnce({ blobs: [], cursor: undefined });
		await expect(listDocuments()).resolves.toBeDefined();
	});

	it("BEHAVIOR — returns mapped blob array with correct shape", async () => {
		mockList.mockResolvedValueOnce({
			blobs: [
				{
					url: "https://blob.vercel-storage.com/a.pdf",
					pathname: "a.pdf",
					size: 100,
				},
				{
					url: "https://blob.vercel-storage.com/b.md",
					pathname: "b.md",
					size: 200,
				},
			],
			cursor: "next-page-token",
		});

		const result = await listDocuments({ prefix: "docs/", limit: 10 });

		expect(result.blobs).toHaveLength(2);
		expect(result.blobs[0].url).toBe("https://blob.vercel-storage.com/a.pdf");
		expect(result.blobs[0].pathname).toBe("a.pdf");
		expect(result.blobs[0].size).toBe(100);
		expect(result.cursor).toBe("next-page-token");
	});

	it("BEHAVIOR — passes options to blob.list with defaults", async () => {
		mockList.mockResolvedValueOnce({ blobs: [] });
		await listDocuments();
		expect(mockList).toHaveBeenCalledWith(
			expect.objectContaining({ limit: 100 }),
		);
	});

	it("BEHAVIOR — passes cursor for pagination", async () => {
		mockList.mockResolvedValueOnce({ blobs: [] });
		await listDocuments({ cursor: "abc123" });
		expect(mockList).toHaveBeenCalledWith(
			expect.objectContaining({ cursor: "abc123" }),
		);
	});

	it("DATA QUALITY — coerces blob fields to correct types", async () => {
		mockList.mockResolvedValueOnce({
			blobs: [{ url: 42, pathname: null, size: "nope" }],
		});

		const result = await listDocuments();
		expect(typeof result.blobs[0].url).toBe("string");
		expect(typeof result.blobs[0].pathname).toBe("string");
		expect(result.blobs[0].size).toBe(0);
	});

	it("ENVIRONMENT — wraps list errors as StorageError", async () => {
		mockList.mockRejectedValueOnce(new Error("connection lost"));

		try {
			await listDocuments();
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(StorageError);
			expect((err as StorageError).code).toBe("STORAGE_LIST_FAILED");
		}
	});
});
