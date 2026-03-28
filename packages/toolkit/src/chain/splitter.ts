/**
 * Splitter — text chunking wrapping LangChain RecursiveCharacterTextSplitter.
 *
 * Falls back to a built-in implementation when @langchain/textsplitters is not installed.
 */

import { ToolkitError } from "../errors/index.js";
import { builtInSplit } from "../internal/split.js";
import type {
	ChainDocument,
	Splitter,
	SplitterConfig,
	SplitterLanguage,
} from "./types.js";

// ─── LangChain Loader ─────────────────────────────────────────────────────

interface LangChainSplitterLike {
	splitText(text: string): Promise<string[]>;
	splitDocuments(
		docs: { pageContent: string; metadata: Record<string, unknown> }[],
	): Promise<{ pageContent: string; metadata: Record<string, unknown> }[]>;
}

async function tryLoadLangChainSplitter(
	config: Required<SplitterConfig>,
): Promise<LangChainSplitterLike | null> {
	try {
		const moduleName = "@langchain/textsplitters";
		const { RecursiveCharacterTextSplitter } = await import(moduleName);
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

async function tryLoadLangChainLanguageSplitter(
	language: string,
	config: { chunkSize: number; chunkOverlap: number },
): Promise<LangChainSplitterLike | null> {
	try {
		const moduleName = "@langchain/textsplitters";
		const { RecursiveCharacterTextSplitter } = await import(moduleName);
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

			const langChainSplitter = await tryLoadLangChainSplitter({
				chunkSize,
				chunkOverlap,
				separators,
				keepSeparator,
			});

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

			const langChainSplitter = await tryLoadLangChainSplitter({
				chunkSize,
				chunkOverlap,
				separators,
				keepSeparator,
			});

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

			const langChainSplitter = await tryLoadLangChainLanguageSplitter(
				language,
				{ chunkSize, chunkOverlap },
			);

			if (langChainSplitter) {
				try {
					return await langChainSplitter.splitText(text);
				} catch (error) {
					throw new ToolkitError("Language-aware splitting failed", {
						code: "CHAIN_SPLIT_FAILED",
						cause: error instanceof Error ? error : undefined,
					});
				}
			}

			// LangChain unavailable — fall back to built-in splitter
			return builtInSplit(
				text,
				["\n\n", "\n", " ", ""],
				chunkSize,
				chunkOverlap,
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

			const langChainSplitter = await tryLoadLangChainLanguageSplitter(
				language,
				{ chunkSize, chunkOverlap },
			);

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
					throw new ToolkitError("Language-aware document splitting failed", {
						code: "CHAIN_SPLIT_FAILED",
						cause: error instanceof Error ? error : undefined,
					});
				}
			}

			// LangChain unavailable — fall back to built-in splitter
			const result: ChainDocument[] = [];
			for (const doc of docs) {
				const chunks = builtInSplit(
					doc.content,
					["\n\n", "\n", " ", ""],
					chunkSize,
					chunkOverlap,
				);
				for (const chunk of chunks) {
					result.push({ content: chunk, metadata: { ...doc.metadata } });
				}
			}
			return result;
		},
	};
}
