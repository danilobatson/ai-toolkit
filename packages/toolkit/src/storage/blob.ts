/**
 * Storage — Vercel Blob wrapper for document uploads.
 *
 * Provides validation, upload helpers, and consistent error handling
 * for file uploads across all projects.
 *
 * Requires @vercel/blob as a peer dependency.
 *
 * @example
 * ```ts
 * import { uploadDocument, validateFile } from '@jamaalbuilds/ai-toolkit/storage';
 *
 * // Validate before upload
 * validateFile(file, { maxSizeMB: 10, allowedTypes: ['application/pdf', 'text/markdown'] });
 *
 * // Upload to Vercel Blob
 * const { url, pathname } = await uploadDocument(file, {
 *   folder: `orgs/${orgId}/documents`,
 *   access: 'private',
 * });
 * ```
 */

import { StorageError } from "../errors/types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FileValidationOptions {
  /** Max file size in MB. Default: 10 */
  maxSizeMB?: number;
  /** Allowed MIME types. Default: PDF, Markdown, TXT, HTML */
  allowedTypes?: string[];
}

export interface UploadOptions {
  /** Folder path within the blob store. */
  folder?: string;
  /** Access level. Default: 'private' */
  access?: "public" | "private";
  /** Custom filename override. */
  filename?: string;
}

export interface UploadResult {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_SIZE_MB = 10;
const DEFAULT_ALLOWED_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/html",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate a file before upload. Throws StorageError on failure.
 */
export function validateFile(
  file: { size: number; type: string; name?: string },
  options?: FileValidationOptions,
): void {
  const maxBytes = (options?.maxSizeMB ?? DEFAULT_MAX_SIZE_MB) * 1024 * 1024;
  const allowedTypes = options?.allowedTypes ?? DEFAULT_ALLOWED_TYPES;

  if (file.size > maxBytes) {
    throw new StorageError(
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max: ${options?.maxSizeMB ?? DEFAULT_MAX_SIZE_MB}MB)`,
      { code: "STORAGE_FILE_TOO_LARGE" },
    );
  }

  if (file.type && !allowedTypes.includes(file.type)) {
    throw new StorageError(
      `File type not allowed: ${file.type}. Allowed: ${allowedTypes.join(", ")}`,
      { code: "STORAGE_INVALID_TYPE" },
    );
  }
}

// ─── Upload ─────────────────────────────────────────────────────────────────

/**
 * Upload a document to Vercel Blob.
 *
 * Requires @vercel/blob and BLOB_READ_WRITE_TOKEN env var.
 */
export async function uploadDocument(
  file: Blob | Buffer | ReadableStream,
  options?: UploadOptions & { filename?: string; contentType?: string },
): Promise<UploadResult> {
  let put: (pathname: string, body: any, options: any) => Promise<any>;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const blob = require("@vercel/blob");
    put = blob.put;
  } catch {
    throw new StorageError(
      "Vercel Blob not installed. Run: yarn add @vercel/blob",
      { code: "STORAGE_MISSING_DEPENDENCY" },
    );
  }

  const folder = options?.folder ?? "uploads";
  const filename = options?.filename ?? `${Date.now()}-document`;
  const pathname = `${folder}/${filename}`;
  const access = options?.access ?? "private";

  try {
    const result = await put(pathname, file, {
      access,
      contentType: (options as any)?.contentType,
    });

    return {
      url: result.url,
      pathname: result.pathname,
      contentType: result.contentType ?? "application/octet-stream",
      size: result.size ?? 0,
    };
  } catch (error) {
    throw new StorageError(
      `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      {
        code: "STORAGE_UPLOAD_FAILED",
        retryable: true,
        cause: error instanceof Error ? error : undefined,
      },
    );
  }
}

/**
 * Delete a document from Vercel Blob.
 */
export async function deleteDocument(url: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const blob = require("@vercel/blob");
    await blob.del(url);
  } catch (error) {
    if ((error as any)?.code === "STORAGE_MISSING_DEPENDENCY") throw error;
    throw new StorageError(
      `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      { code: "STORAGE_DELETE_FAILED", cause: error instanceof Error ? error : undefined },
    );
  }
}

/**
 * List documents in a Vercel Blob folder.
 */
export async function listDocuments(options?: {
  prefix?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ blobs: Array<{ url: string; pathname: string; size: number }>; cursor?: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const blob = require("@vercel/blob");
    const result = await blob.list({
      prefix: options?.prefix,
      limit: options?.limit ?? 100,
      cursor: options?.cursor,
    });
    return {
      blobs: result.blobs.map((b: any) => ({
        url: b.url,
        pathname: b.pathname,
        size: b.size,
      })),
      cursor: result.cursor,
    };
  } catch (error) {
    throw new StorageError(
      `List failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      { code: "STORAGE_LIST_FAILED", cause: error instanceof Error ? error : undefined },
    );
  }
}
