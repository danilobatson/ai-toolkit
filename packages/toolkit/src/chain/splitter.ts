/**
 * Splitter — text chunking wrapping LangChain RecursiveCharacterTextSplitter.
 *
 * Falls back to a built-in implementation when @langchain/textsplitters is not installed.
 */

import { ToolkitError } from "../errors/index.js";
import type {
	ChainDocument,
	Splitter,
	SplitterConfig,
	SplitterLanguage,
} from "./types.js";

// ─── Built-in Splitter ────────────────────────────────────────────────────

function builtInSplit(
	text: string,
	separators: string[],
	chunkSize: number,
	chunkOverlap: number,
	keepSeparator: boolean,
): string[] {
	if (text.length <= chunkSize) {
		return text.trim() ? [text] : [];
	}

	// Find the best separator that creates splits
	let splits: string[] = [text];
	for (const sep of separators) {
		if (sep === "") {
			// Character-level split
			splits = text.split("");
			break;
		}
		if (text.includes(sep)) {
			if (keepSeparator) {
				const parts: string[] = [];
				const segments = text.split(sep);
				for (let i = 0; i < segments.length; i++) {
					if (i === 0) {
						parts.push(segments[i]);
					} else {
						parts.push(sep + segments[i]);
					}
				}
				splits = parts.filter((s) => s.length > 0);
			} else {
				splits = text.split(sep).filter((s) => s.length > 0);
			}
			break;
		}
	}

	// Merge splits into chunks respecting chunkSize
	const chunks: string[] = [];
	let current = "";

	for (const split of splits) {
		if (current.length + split.length > chunkSize && current.length > 0) {
			chunks.push(current.trim());
			// Overlap: keep the end of current chunk
			if (chunkOverlap > 0 && current.length > chunkOverlap) {
				current = current.slice(-chunkOverlap) + split;
			} else {
				current = split;
			}
		} else {
			current += split;
		}
	}

	if (current.trim()) {
		chunks.push(current.trim());
	}

	return chunks;
}

// ─── LangChain Loader ─────────────────────────────────────────────────────

interface LangChainSplitterLike {
	splitText(text: string): Promise<string[]>;
	splitDocuments(
		docs: { pageContent: string; metadata: Record<string, unknown> }[],
	): Promise<{ pageContent: string; metadata: Record<string, unknown> }[]>;
}

function tryLoadLangChainSplitter(
	config: Required<SplitterConfig>,
): LangChainSplitterLike | null {
	try {
		const moduleName = "@langchain/textsplitters";
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { RecursiveCharacterTextSplitter } = require(moduleName);
		return new RecursiveCharacterTextSplitter({
			chunkSize: config.chunkSize,
			chunkOverlap: config.chunkOverlap,
			separators: config.separators,
			keepSeparator: config.keepSeparator,
		}) as LangChainSplitterLike;
	} catch {
		return null;
	}
}

function tryLoadLangChainLanguageSplitter(
	language: string,
	config: { chunkSize: number; chunkOverlap: number },
): LangChainSplitterLike | null {
	try {
		const moduleName = "@langchain/textsplitters";
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { RecursiveCharacterTextSplitter } = require(moduleName);
		return RecursiveCharacterTextSplitter.fromLanguage(language, {
			chunkSize: config.chunkSize,
			chunkOverlap: config.chunkOverlap,
		}) as LangChainSplitterLike;
	} catch {
		return null;
	}
}

// ─── createSplitter() ─────────────────────────────────────────────────────

/**
 * Create a text splitter for chunking documents.
 *
 * Uses @langchain/textsplitters RecursiveCharacterTextSplitter when available,
 * falls back to a built-in recursive character splitter otherwise.
 *
 * @param config - Optional splitter configuration.
 * @returns A Splitter with split() and splitDocuments() methods.
 *
 * @example
 * ```ts
 * import { createSplitter } from '@jamaalbuilds/ai-toolkit/chain';
 *
 * const splitter = createSplitter({ chunkSize: 500, chunkOverlap: 50 });
 * const chunks = await splitter.split("Long document text...");
 * ```
 */
export function createSplitter(config?: SplitterConfig): Splitter {
	const chunkSize = config?.chunkSize ?? 1000;
	const chunkOverlap = config?.chunkOverlap ?? 200;
	const separators = config?.separators ?? ["\n\n", "\n", " ", ""];
	const keepSeparator = config?.keepSeparator ?? true;

	if (chunkSize <= 0) {
		throw new ToolkitError("chunkSize must be a positive number", {
			code: "CHAIN_INVALID_SPLITTER_CONFIG",
		});
	}

	if (chunkOverlap >= chunkSize) {
		throw new ToolkitError("chunkOverlap must be less than chunkSize", {
			code: "CHAIN_INVALID_SPLITTER_CONFIG",
		});
	}

	const langChainSplitter = tryLoadLangChainSplitter({
		chunkSize,
		chunkOverlap,
		separators,
		keepSeparator,
	});

	return {
		async split(text: string): Promise<string[]> {
			if (typeof text !== "string") {
				throw new ToolkitError("split() requires a string input", {
					code: "CHAIN_SPLIT_INVALID_INPUT",
				});
			}

			if (!text.trim()) {
				return [];
			}

			if (langChainSplitter) {
				try {
					return await langChainSplitter.splitText(text);
				} catch (error) {
					throw new ToolkitError("Text splitting failed", {
						code: "CHAIN_SPLIT_FAILED",
						cause: error instanceof Error ? error : undefined,
					});
				}
			}

			return builtInSplit(
				text,
				separators,
				chunkSize,
				chunkOverlap,
				keepSeparator,
			);
		},

		async splitDocuments(docs: ChainDocument[]): Promise<ChainDocument[]> {
			if (!Array.isArray(docs)) {
				throw new ToolkitError(
					"splitDocuments() requires an array of documents",
					{
						code: "CHAIN_SPLIT_INVALID_INPUT",
					},
				);
			}

			if (langChainSplitter) {
				try {
					const lcDocs = docs.map((d) => ({
						pageContent: d.content,
						metadata: d.metadata,
					}));
					const result = await langChainSplitter.splitDocuments(lcDocs);
					return result.map((d) => ({
						content: d.pageContent,
						metadata: d.metadata,
					}));
				} catch (error) {
					throw new ToolkitError("Document splitting failed", {
						code: "CHAIN_SPLIT_FAILED",
						cause: error instanceof Error ? error : undefined,
					});
				}
			}

			// Built-in fallback
			const result: ChainDocument[] = [];
			for (const doc of docs) {
				const chunks = builtInSplit(
					doc.content,
					separators,
					chunkSize,
					chunkOverlap,
					keepSeparator,
				);
				for (const chunk of chunks) {
					result.push({ content: chunk, metadata: { ...doc.metadata } });
				}
			}
			return result;
		},
	};
}

/**
 * Create a language-aware text splitter.
 *
 * Uses language-specific separators for better code splitting.
 * Requires @langchain/textsplitters — falls back to default separators if unavailable.
 *
 * @param language - The programming language to split for.
 * @param config - Optional splitter configuration (chunkSize, chunkOverlap).
 * @returns A Splitter instance.
 *
 * @example
 * ```ts
 * import { createLanguageSplitter } from '@jamaalbuilds/ai-toolkit/chain';
 *
 * const jsSplitter = createLanguageSplitter("js", { chunkSize: 1000 });
 * const chunks = await jsSplitter.split(sourceCode);
 * ```
 */
export function createLanguageSplitter(
	language: SplitterLanguage,
	config?: Pick<SplitterConfig, "chunkSize" | "chunkOverlap">,
): Splitter {
	const chunkSize = config?.chunkSize ?? 1000;
	const chunkOverlap = config?.chunkOverlap ?? 200;

	if (chunkOverlap >= chunkSize) {
		throw new ToolkitError("chunkOverlap must be less than chunkSize", {
			code: "CHAIN_INVALID_SPLITTER_CONFIG",
		});
	}

	const langChainSplitter = tryLoadLangChainLanguageSplitter(language, {
		chunkSize,
		chunkOverlap,
	});

	// If LangChain unavailable, fall back to default splitter
	if (!langChainSplitter) {
		return createSplitter({ chunkSize, chunkOverlap });
	}

	return {
		async split(text: string): Promise<string[]> {
			if (typeof text !== "string") {
				throw new ToolkitError("split() requires a string input", {
					code: "CHAIN_SPLIT_INVALID_INPUT",
				});
			}

			if (!text.trim()) {
				return [];
			}

			try {
				return await langChainSplitter.splitText(text);
			} catch (error) {
				throw new ToolkitError("Language-aware splitting failed", {
					code: "CHAIN_SPLIT_FAILED",
					cause: error instanceof Error ? error : undefined,
				});
			}
		},

		async splitDocuments(docs: ChainDocument[]): Promise<ChainDocument[]> {
			if (!Array.isArray(docs)) {
				throw new ToolkitError(
					"splitDocuments() requires an array of documents",
					{
						code: "CHAIN_SPLIT_INVALID_INPUT",
					},
				);
			}

			try {
				const lcDocs = docs.map((d) => ({
					pageContent: d.content,
					metadata: d.metadata,
				}));
				const result = await langChainSplitter.splitDocuments(lcDocs);
				return result.map((d) => ({
					content: d.pageContent,
					metadata: d.metadata,
				}));
			} catch (error) {
				throw new ToolkitError("Language-aware document splitting failed", {
					code: "CHAIN_SPLIT_FAILED",
					cause: error instanceof Error ? error : undefined,
				});
			}
		},
	};
}
