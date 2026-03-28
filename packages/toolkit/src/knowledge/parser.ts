// ─── Document Parser ─────────────────────────────────────────────────────────
// Wraps @llamaindex/liteparse for PDF parsing, with plain text fallback.

import { extname } from "node:path";
import { ToolkitError } from "../errors/index.js";
import type { KnowledgeDocument } from "./types.js";

// ─── LiteParse Adapter ──────────────────────────────────────────────────────

interface LiteParseLike {
	parse(input: string | Buffer | Uint8Array): Promise<{ text: string }>;
}

async function tryLoadLiteParse(): Promise<LiteParseLike | null> {
	try {
		const moduleName = "@llamaindex/liteparse";
		const { LiteParse } = await import(moduleName);
		return new LiteParse({ ocrEnabled: false }) as LiteParseLike;
	} catch {
		return null;
	}
}

// ─── File Type Detection ─────────────────────────────────────────────────────

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

function isPdfBuffer(input: Buffer | Uint8Array): boolean {
	if (input.length < 4) return false;
	return (
		input[0] === PDF_MAGIC[0] &&
		input[1] === PDF_MAGIC[1] &&
		input[2] === PDF_MAGIC[2] &&
		input[3] === PDF_MAGIC[3]
	);
}

function isPdfPath(input: string): boolean {
	return input.toLowerCase().endsWith(".pdf");
}

/**
 * Heuristic to detect file paths vs plain text.
 * Uses path.extname() and requires no whitespace (file paths don't contain spaces
 * in this context, or are short enough to be plausible paths).
 * Strings with spaces and length > 200 are almost certainly text, not paths.
 */
function isFilePath(input: string): boolean {
	// Long strings with spaces are text, not paths
	if (input.length > 200 && input.includes(" ")) {
		return false;
	}
	const ext = extname(input);
	// Must have a real extension (2-11 chars including dot, alphanumeric only)
	return ext.length > 1 && ext.length <= 11 && /^\.[a-zA-Z0-9]+$/.test(ext);
}

// ─── parseDocument() ─────────────────────────────────────────────────────────

/**
 * Parse a document from a file path, buffer, or plain text string.
 *
 * Uses @llamaindex/liteparse for PDF/binary parsing when available.
 * Falls back to treating input as plain text otherwise.
 *
 * @param input - File path, Buffer/Uint8Array, or plain text string
 * @param metadata - Additional metadata to attach
 * @returns A KnowledgeDocument with parsed content
 *
 * @example
 * ```ts
 * const doc = await parseDocument('report.pdf');
 * const doc2 = await parseDocument('# Hello\n\nWorld');
 * const doc3 = await parseDocument(pdfBuffer, { source: 'upload' });
 * ```
 */
export async function parseDocument(
	input: string | Buffer | Uint8Array,
	metadata: Record<string, unknown> = {},
): Promise<KnowledgeDocument> {
	if (input === null || input === undefined) {
		throw new ToolkitError("parseDocument() requires a non-null input", {
			code: "KNOWLEDGE_INVALID_INPUT",
		});
	}

	// Buffer/Uint8Array input
	if (input instanceof Buffer || input instanceof Uint8Array) {
		if (input.length === 0) {
			throw new ToolkitError("parseDocument() received an empty buffer", {
				code: "KNOWLEDGE_INVALID_INPUT",
			});
		}

		if (isPdfBuffer(input)) {
			return parsePdfWithLiteParse(input, metadata);
		}

		// Non-PDF binary: treat as UTF-8 text
		const text =
			input instanceof Buffer
				? input.toString("utf-8")
				: new TextDecoder().decode(input);
		return {
			content: text,
			metadata: { ...metadata, format: "text" },
		};
	}

	// String input
	if (typeof input !== "string") {
		throw new ToolkitError(
			"parseDocument() requires a string, Buffer, or Uint8Array",
			{ code: "KNOWLEDGE_INVALID_INPUT" },
		);
	}

	if (!input.trim()) {
		throw new ToolkitError("parseDocument() received empty text", {
			code: "KNOWLEDGE_INVALID_INPUT",
		});
	}

	// File path: attempt LiteParse for PDFs, plain read for text files
	if (isFilePath(input)) {
		if (isPdfPath(input)) {
			return parsePdfWithLiteParse(input, metadata);
		}
		// Text/markdown file path: read with fs
		return parseTextFile(input, metadata);
	}

	// Plain text string
	return {
		content: input,
		metadata: { ...metadata, format: "text" },
	};
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

async function parsePdfWithLiteParse(
	input: string | Buffer | Uint8Array,
	metadata: Record<string, unknown>,
): Promise<KnowledgeDocument> {
	const parser = await tryLoadLiteParse();
	if (!parser) {
		throw new ToolkitError(
			"PDF parsing requires @llamaindex/liteparse. Install it: yarn add @llamaindex/liteparse",
			{ code: "KNOWLEDGE_MISSING_DEPENDENCY" },
		);
	}

	try {
		const result = await parser.parse(input);
		return {
			content: result.text,
			metadata: {
				...metadata,
				format: "pdf",
				source: typeof input === "string" ? input : "buffer",
			},
		};
	} catch (error) {
		throw new ToolkitError("PDF parsing failed", {
			code: "KNOWLEDGE_PARSE_FAILED",
			cause: error instanceof Error ? error : undefined,
		});
	}
}

async function parseTextFile(
	filePath: string,
	metadata: Record<string, unknown>,
): Promise<KnowledgeDocument> {
	try {
		const fs = await import("node:fs/promises");
		const content = await fs.readFile(filePath, "utf-8");
		const ext = filePath.split(".").pop()?.toLowerCase() ?? "txt";
		return {
			content,
			metadata: { ...metadata, format: ext, source: filePath },
		};
	} catch (error) {
		throw new ToolkitError(`Failed to read file: ${filePath}`, {
			code: "KNOWLEDGE_PARSE_FAILED",
			cause: error instanceof Error ? error : undefined,
		});
	}
}
