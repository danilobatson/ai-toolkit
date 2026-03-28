/**
 * Chain — multi-step AI reasoning with prompt templates, output parsing, and RAG.
 *
 * Wraps LangChain.js behind a consistent toolkit interface.
 * Falls back to built-in implementations when LangChain is not installed.
 *
 * @example
 * ```ts
 * import { createChain, prompt, parse, rag, createSplitter } from '@jamaalbuilds/ai-toolkit/chain';
 * import { z } from 'zod';
 *
 * // Prompt template
 * const p = prompt({
 *   template: [
 *     ["system", "You extract structured data from text."],
 *     ["human", "Extract info from: {text}\n\n{format_instructions}"],
 *   ],
 * });
 *
 * // Structured output parser
 * const parser = parse({
 *   schema: z.object({
 *     name: z.string(),
 *     age: z.number(),
 *   }),
 * });
 *
 * // Compose a chain
 * const chain = createChain({
 *   name: "extract",
 *   steps: [
 *     async (input: { text: string }) => {
 *       const formatted = await p.format({
 *         text: input.text,
 *         format_instructions: parser.getFormatInstructions(),
 *       });
 *       return formatted;
 *     },
 *     async (prompt: string) => callLLM(prompt), // your LLM call
 *     async (output: string) => parser.parse(output),
 *   ],
 * });
 *
 * // RAG chain
 * const ragChain = rag({
 *   retriever: myRetriever,
 *   promptTemplate: "Context:\n{context}\n\nQuestion: {question}\n\nAnswer:",
 *   model: async (prompt) => callLLM(prompt),
 * });
 *
 * // Text splitting
 * const splitter = createSplitter({ chunkSize: 500, chunkOverlap: 50 });
 * const chunks = await splitter.split(longDocument);
 * ```
 */

export { createChain, rag } from "./chain.js";
export { parse } from "./parse.js";
export { prompt } from "./prompt.js";
export { createLanguageSplitter, createSplitter } from "./splitter.js";
export type {
	Chain,
	ChainConfig,
	ChainDocument,
	ChainStep,
	ChatMessage,
	ParseConfig,
	Parser,
	PromptConfig,
	PromptTemplate,
	RAGConfig,
	RAGResult,
	Retriever,
	Splitter,
	SplitterConfig,
	SplitterLanguage,
} from "./types.js";
