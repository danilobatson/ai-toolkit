/**
 * Chain — composable pipeline builder and RAG chain.
 *
 * createChain() builds a sequential pipeline from transform steps.
 * rag() builds a retrieval-augmented generation chain.
 */

import { ToolkitError } from "../errors/index.js";
import type {
	Chain,
	ChainConfig,
	ChainDocument,
	ChainStep,
	RAGConfig,
	RAGResult,
} from "./types.js";

// ─── Step Normalization ───────────────────────────────────────────────────

function normalizeStep(
	step: ChainStep,
	index: number,
): { name: string; transform: (input: unknown) => unknown | Promise<unknown> } {
	if (typeof step === "function") {
		return { name: `step-${index}`, transform: step };
	}
	if (
		step &&
		typeof step === "object" &&
		"transform" in step &&
		typeof step.transform === "function"
	) {
		return { name: step.name, transform: step.transform };
	}
	throw new ToolkitError(
		`Chain step at index ${index} must be a function or { name, transform }`,
		{ code: "CHAIN_INVALID_STEP" },
	);
}

// ─── createChain() ────────────────────────────────────────────────────────

/**
 * Create a composable chain from sequential processing steps.
 *
 * Each step receives the output of the previous step as input.
 * Steps can be plain functions or named objects with a transform method.
 *
 * @param config - Chain configuration with steps array.
 * @returns A Chain with an invoke() method.
 *
 * @example
 * ```ts
 * import { createChain, prompt, parse } from '@jamaalbuilds/ai-toolkit/chain';
 * import { z } from 'zod';
 *
 * const chain = createChain({
 *   name: "extract-info",
 *   steps: [
 *     (input: { text: string }) => input.text.toLowerCase(),
 *     (text: string) => text.trim(),
 *     (text: string) => ({ processed: text }),
 *   ],
 * });
 *
 * const result = await chain.invoke({ text: "  HELLO WORLD  " });
 * // result: { processed: "hello world" }
 * ```
 */
export function createChain<
	TInput = Record<string, unknown>,
	TOutput = unknown,
>(config: ChainConfig): Chain<TInput, TOutput> {
	if (!config || !Array.isArray(config.steps) || config.steps.length === 0) {
		throw new ToolkitError("createChain() requires a non-empty steps array", {
			code: "CHAIN_INVALID_CONFIG",
		});
	}

	const normalizedSteps = config.steps.map((step, i) => normalizeStep(step, i));
	const chainName = config.name ?? "chain";

	return {
		name: chainName,
		length: normalizedSteps.length,

		async invoke(input: TInput): Promise<TOutput> {
			let current: unknown = input;

			for (const step of normalizedSteps) {
				try {
					current = await step.transform(current);
				} catch (error) {
					if (error instanceof ToolkitError) {
						throw error;
					}
					throw new ToolkitError(
						`Chain "${chainName}" failed at step "${step.name}"`,
						{
							code: "CHAIN_STEP_FAILED",
							cause: error instanceof Error ? error : undefined,
						},
					);
				}
			}

			return current as TOutput;
		},
	};
}

// ─── Default Document Formatter ───────────────────────────────────────────

function defaultFormatDocs(docs: ChainDocument[]): string {
	return docs.map((d) => d.content).join("\n\n");
}

// ─── rag() ────────────────────────────────────────────────────────────────

/**
 * Create a retrieval-augmented generation (RAG) chain.
 *
 * Retrieves relevant documents, formats them into context,
 * builds a prompt, and calls the model to generate an answer.
 *
 * @param config - RAG configuration with retriever, prompt template, and model.
 * @returns A Chain that accepts { question: string } and returns RAGResult.
 *
 * @example
 * ```ts
 * import { rag } from '@jamaalbuilds/ai-toolkit/chain';
 *
 * const ragChain = rag({
 *   retriever: {
 *     retrieve: async (query) => [
 *       { content: "RAG combines retrieval with generation.", metadata: {} },
 *     ],
 *   },
 *   promptTemplate: "Context:\n{context}\n\nQuestion: {question}\n\nAnswer:",
 *   model: async (prompt) => "RAG is Retrieval-Augmented Generation.",
 * });
 *
 * const result = await ragChain.invoke({ question: "What is RAG?" });
 * // result: { answer: "RAG is...", sources: [...] }
 * ```
 */
export function rag(config: RAGConfig): Chain<{ question: string }, RAGResult> {
	if (!config.retriever || typeof config.retriever.retrieve !== "function") {
		throw new ToolkitError(
			"rag() requires a retriever with a retrieve() method",
			{
				code: "CHAIN_INVALID_RAG_CONFIG",
			},
		);
	}

	if (!config.promptTemplate || typeof config.promptTemplate !== "string") {
		throw new ToolkitError("rag() requires a promptTemplate string", {
			code: "CHAIN_INVALID_RAG_CONFIG",
		});
	}

	if (!config.model || typeof config.model !== "function") {
		throw new ToolkitError("rag() requires a model function", {
			code: "CHAIN_INVALID_RAG_CONFIG",
		});
	}

	const formatDocs = config.formatDocs ?? defaultFormatDocs;

	return {
		name: "rag",
		length: 3, // retrieve → format+prompt → model

		async invoke(input: { question: string }): Promise<RAGResult> {
			if (!input.question || typeof input.question !== "string") {
				throw new ToolkitError(
					"RAG chain requires a non-empty question string",
					{ code: "CHAIN_RAG_INVALID_INPUT" },
				);
			}

			// Step 1: Retrieve documents
			let sources: ChainDocument[];
			try {
				sources = await config.retriever.retrieve(input.question);
			} catch (error) {
				if (error instanceof ToolkitError) {
					throw error;
				}
				throw new ToolkitError("RAG retrieval failed", {
					code: "CHAIN_RAG_RETRIEVAL_FAILED",
					cause: error instanceof Error ? error : undefined,
				});
			}

			// Step 2: Format context and build prompt
			const context = formatDocs(sources);
			const formattedPrompt = config.promptTemplate
				.replace(/\{context\}/g, context)
				.replace(/\{question\}/g, input.question);

			// Step 3: Call model
			let answer: string;
			try {
				answer = await config.model(formattedPrompt);
			} catch (error) {
				if (error instanceof ToolkitError) {
					throw error;
				}
				throw new ToolkitError("RAG model invocation failed", {
					code: "CHAIN_RAG_MODEL_FAILED",
					cause: error instanceof Error ? error : undefined,
				});
			}

			return { answer, sources };
		},
	};
}
