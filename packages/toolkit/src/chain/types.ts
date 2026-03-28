/**
 * Chain module types — LangChain.js composition, prompts, parsing, and splitting.
 */

import type { z } from "zod";

// ─── Document ─────────────────────────────────────────────────────────────

/** A document with content and metadata, used across chain operations. */
export interface ChainDocument {
	/** The text content of the document. */
	content: string;
	/** Arbitrary metadata attached to the document. */
	metadata: Record<string, unknown>;
}

// ─── Prompt Types ─────────────────────────────────────────────────────────

/** A chat message with role and content. */
export interface ChatMessage {
	/** The role of the message sender. */
	role: "system" | "human" | "ai";
	/** The text content of the message. */
	content: string;
}

/** Configuration for creating a prompt template. */
export interface PromptConfig {
	/** Template string with {variable} placeholders, or array of [role, template] tuples. */
	template: string | [role: ChatMessage["role"], template: string][];
	/** Optional list of input variable names. Auto-detected from template if omitted. */
	inputVariables?: string[];
}

/** A prompt template that formats input variables into messages. */
export interface PromptTemplate {
	/** Format the template with the given values into a single string. */
	format(values: Record<string, string>): Promise<string>;
	/** Format the template with the given values into chat messages. */
	formatMessages(values: Record<string, string>): Promise<ChatMessage[]>;
	/** The input variable names this template expects. */
	readonly inputVariables: string[];
}

// ─── Parse Types ──────────────────────────────────────────────────────────

/** Configuration for creating a structured output parser. */
export interface ParseConfig<T = unknown> {
	/** Zod schema defining the expected output structure. */
	schema: z.ZodType<T>;
	/** Optional name for the parser (used in error messages). */
	name?: string;
}

/** A structured output parser that extracts typed data from LLM text. */
export interface Parser<T = unknown> {
	/** Parse raw LLM output text into a typed result. */
	parse(text: string): Promise<T>;
	/** Get formatting instructions to include in prompts. */
	getFormatInstructions(): string;
}

// ─── Splitter Types ───────────────────────────────────────────────────────

/** Configuration for creating a text splitter. */
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

/** Supported programming languages for language-aware splitting. */
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

/** A text splitter that breaks content into chunks. */
export interface Splitter {
	/** Split a text string into chunks. */
	split(text: string): Promise<string[]>;
	/** Split documents into smaller document chunks, preserving metadata. */
	splitDocuments(docs: ChainDocument[]): Promise<ChainDocument[]>;
}

// ─── Retriever Types ──────────────────────────────────────────────────────

/** A retriever that fetches relevant documents for a query. */
export interface Retriever {
	/** Retrieve documents relevant to the query. */
	retrieve(query: string): Promise<ChainDocument[]>;
}

// ─── Chain Types ──────────────────────────────────────────────────────────

/**
 * A single step in a chain pipeline.
 *
 * Can be a function, a PromptTemplate, a Parser, or a named step with a transform.
 */
export type ChainStep<TIn = unknown, TOut = unknown> =
	| ((input: TIn) => TOut | Promise<TOut>)
	| { name: string; transform: (input: TIn) => TOut | Promise<TOut> };

/** Configuration for creating a chain. */
export interface ChainConfig {
	/** Ordered array of processing steps. */
	steps: ChainStep[];
	/** Optional name for the chain (used in error messages and tracing). */
	name?: string;
}

/** A composable chain that processes input through sequential steps. */
export interface Chain<TInput = Record<string, unknown>, TOutput = unknown> {
	/** Run the full chain with the given input. */
	invoke(input: TInput): Promise<TOutput>;
	/** The name of this chain. */
	readonly name: string;
	/** The number of steps in this chain. */
	readonly length: number;
}

// ─── RAG Types ────────────────────────────────────────────────────────────

/** Configuration for creating a RAG chain. */
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

/** Result of a RAG chain invocation. */
export interface RAGResult {
	/** The generated answer. */
	answer: string;
	/** The documents retrieved for context. */
	sources: ChainDocument[];
}
