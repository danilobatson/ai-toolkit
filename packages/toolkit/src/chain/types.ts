/**
 * Chain module types — LangChain.js composition, prompts, parsing, and splitting.
 */

import type { z } from "zod";

// ─── Document ─────────────────────────────────────────────────────────────

/**
 * A document with content and metadata, used across chain operations.
 *
 * @example
 * ```ts
 * const doc: ChainDocument = { content: 'Hello world', metadata: { source: 'test.txt' } };
 * ```
 */
export interface ChainDocument {
	/** The text content of the document. */
	content: string;
	/** Arbitrary metadata attached to the document. */
	metadata: Record<string, unknown>;
}

// ─── Prompt Types ─────────────────────────────────────────────────────────

/**
 * A chat message with role and content.
 *
 * @example
 * ```ts
 * const msg: ChatMessage = { role: 'human', content: 'What is AI?' };
 * ```
 */
export interface ChatMessage {
	/** The role of the message sender. */
	role: "system" | "human" | "ai";
	/** The text content of the message. */
	content: string;
}

/**
 * Configuration for creating a prompt template.
 *
 * @example
 * ```ts
 * const config: PromptConfig = {
 *   template: 'Summarize: {text}',
 *   inputVariables: ['text'],
 * };
 * const tmpl = prompt(config);
 * ```
 */
export interface PromptConfig {
	/** Template string with {variable} placeholders, or array of [role, template] tuples. */
	template: string | [role: ChatMessage["role"], template: string][];
	/** Optional list of input variable names. Auto-detected from template if omitted. */
	inputVariables?: string[];
}

/**
 * A prompt template that formats input variables into messages.
 *
 * @example
 * ```ts
 * const tmpl: PromptTemplate = prompt({ template: 'Hello {name}' });
 * const text = await tmpl.format({ name: 'World' });
 * ```
 */
export interface PromptTemplate {
	/** Format the template with the given values into a single string. */
	format(values: Record<string, string>): Promise<string>;
	/** Format the template with the given values into chat messages. */
	formatMessages(values: Record<string, string>): Promise<ChatMessage[]>;
	/** The input variable names this template expects. */
	readonly inputVariables: string[];
}

// ─── Parse Types ──────────────────────────────────────────────────────────

/**
 * Configuration for creating a structured output parser.
 *
 * @example
 * ```ts
 * const config: ParseConfig<{ name: string }> = {
 *   schema: z.object({ name: z.string() }),
 *   name: 'PersonParser',
 * };
 * const parser = parse(config);
 * ```
 */
export interface ParseConfig<T = unknown> {
	/** Zod schema defining the expected output structure. */
	schema: z.ZodType<T>;
	/** Optional name for the parser (used in error messages). */
	name?: string;
}

/**
 * A structured output parser that extracts typed data from LLM text.
 *
 * @example
 * ```ts
 * const parser: Parser<{ name: string }> = parse({ schema });
 * const data = await parser.parse('{"name": "Alice"}');
 * ```
 */
export interface Parser<T = unknown> {
	/** Parse raw LLM output text into a typed result. */
	parse(text: string): Promise<T>;
	/** Get formatting instructions to include in prompts. */
	getFormatInstructions(): string;
}

// ─── Splitter Types ───────────────────────────────────────────────────────

/**
 * Configuration for creating a text splitter.
 *
 * @example
 * ```ts
 * const config: SplitterConfig = { chunkSize: 500, chunkOverlap: 100 };
 * const splitter = createSplitter(config);
 * ```
 */
export interface SplitterConfig {
	/** Maximum size of each chunk in characters. Defaults to 1000. */
	chunkSize?: number;
	/** Number of overlapping characters between chunks. Defaults to 200. */
	chunkOverlap?: number;
	/** Custom separator strings, tried in order. Defaults to ["\n\n", "\n", " ", ""]. */
	separators?: string[];
	/** Whether to keep separators in the output chunks. Defaults to true. */
	keepSeparator?: boolean;
}

/**
 * Supported programming languages for language-aware splitting.
 *
 * @example
 * ```ts
 * const lang: SplitterLanguage = 'python';
 * const splitter = createLanguageSplitter(lang, { chunkSize: 500 });
 * ```
 */
export type SplitterLanguage =
	| "cpp"
	| "go"
	| "java"
	| "js"
	| "php"
	| "python"
	| "ruby"
	| "rust"
	| "scala"
	| "swift"
	| "markdown"
	| "latex"
	| "html";

/**
 * A text splitter that breaks content into chunks.
 *
 * @example
 * ```ts
 * const splitter: Splitter = createSplitter({ chunkSize: 500 });
 * const chunks = await splitter.split(longText);
 * ```
 */
export interface Splitter {
	/** Split a text string into chunks. */
	split(text: string): Promise<string[]>;
	/** Split documents into smaller document chunks, preserving metadata. */
	splitDocuments(docs: ChainDocument[]): Promise<ChainDocument[]>;
}

// ─── Retriever Types ──────────────────────────────────────────────────────

/**
 * A retriever that fetches relevant documents for a query.
 *
 * @example
 * ```ts
 * const retriever: Retriever = { retrieve: async (q) => knowledge.search(q) };
 * const docs = await retriever.retrieve('What is RAG?');
 * ```
 */
export interface Retriever {
	/** Retrieve documents relevant to the query. */
	retrieve(query: string): Promise<ChainDocument[]>;
}

// ─── Chain Types ──────────────────────────────────────────────────────────

/**
 * A single step in a chain pipeline.
 *
 * Can be a function, a PromptTemplate, a Parser, or a named step with a transform.
 *
 * @example
 * ```ts
 * const step: ChainStep<string, string> = { name: 'uppercase', transform: (s) => s.toUpperCase() };
 * ```
 */
export type ChainStep<TIn = unknown, TOut = unknown> =
	| ((input: TIn) => TOut | Promise<TOut>)
	| { name: string; transform: (input: TIn) => TOut | Promise<TOut> };

/**
 * Configuration for creating a chain.
 *
 * @example
 * ```ts
 * const config: ChainConfig = {
 *   name: 'summarize',
 *   steps: [formatInput, callLLM, parseOutput],
 * };
 * const chain = createChain(config);
 * ```
 */
export interface ChainConfig {
	/** Ordered array of processing steps. */
	steps: ChainStep[];
	/** Optional name for the chain (used in error messages and tracing). */
	name?: string;
}

/**
 * A composable chain that processes input through sequential steps.
 *
 * @example
 * ```ts
 * const chain: Chain<{ text: string }, string> = createChain({ steps, name: 'my-chain' });
 * const result = await chain.invoke({ text: 'Hello' });
 * ```
 */
export interface Chain<TInput = Record<string, unknown>, TOutput = unknown> {
	/** Run the full chain with the given input. */
	invoke(input: TInput): Promise<TOutput>;
	/** The name of this chain. */
	readonly name: string;
	/** The number of steps in this chain. */
	readonly length: number;
}

// ─── RAG Types ────────────────────────────────────────────────────────────

/**
 * Configuration for creating a RAG chain.
 *
 * @example
 * ```ts
 * const config: RAGConfig = {
 *   retriever,
 *   promptTemplate: 'Context: {context}\n\nQuestion: {question}',
 *   model: async (prompt) => ai.generate(prompt).then(r => r.text),
 * };
 * const ragChain = rag(config);
 * ```
 */
export interface RAGConfig {
	/** Retriever to fetch relevant documents. */
	retriever: Retriever;
	/** Prompt template string with {context} and {question} placeholders. */
	promptTemplate: string;
	/** Function to call the LLM with formatted messages. */
	model: (messages: string) => Promise<string>;
	/** Custom function to format retrieved documents into context string. */
	formatDocs?: (docs: ChainDocument[]) => string;
}

/**
 * Result of a RAG chain invocation.
 *
 * @example
 * ```ts
 * const result: RAGResult = await ragChain.invoke({ question: 'What is RAG?' });
 * console.log(result.answer, `(${result.sources.length} sources)`);
 * ```
 */
export interface RAGResult {
	/** The generated answer. */
	answer: string;
	/** The documents retrieved for context. */
	sources: ChainDocument[];
}
