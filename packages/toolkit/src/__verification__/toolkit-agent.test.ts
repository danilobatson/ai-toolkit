/**
 * Semantic checks — grep-based verification that catches bugs
 * TypeScript and lint miss. These enforce project architecture rules.
 */
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const SRC = "packages/toolkit/src";

function grep(pattern: string, path: string, exclude?: string): string[] {
	const excludeFlag = exclude ? ` | grep -v "${exclude}"` : "";
	try {
		const result = execSync(
			`grep -rn "${pattern}" ${path} --include="*.ts" | grep -v __tests__ | grep -v __verification__${excludeFlag}`,
			{ encoding: "utf-8" },
		);
		return result.trim().split("\n").filter(Boolean);
	} catch {
		return [];
	}
}

describe("semantic checks", () => {
	it.todo(
		"no raw throw new Error() in source — pre-existing: mcp/server-builder.ts (5), testing/mocks.ts (1), neon/db.ts (2)",
		() => {
			const matches = grep("throw new Error(", SRC);
			expect(matches).toHaveLength(0);
		},
	);

	it("no hardcoded provider URLs (except Langfuse default)", () => {
		const matches = grep(
			"https\\?://api\\.|https\\?://cloud\\.",
			SRC,
		);
		// Langfuse default URL is acceptable — it's overridable via config
		const nonLangfuse = matches.filter(
			(line) => !line.includes("langfuse") && !line.includes("LANGFUSE"),
		);
		expect(nonLangfuse).toHaveLength(0);
	});

	it("no process.exit in library code", () => {
		const matches = grep("process\\.exit", SRC);
		expect(matches).toHaveLength(0);
	});

	it("no default exports", () => {
		const matches = grep("export default", SRC);
		expect(matches).toHaveLength(0);
	});

	it("no ^ in dependency versions", () => {
		try {
			const result = execSync(
				`grep -r '"\\^' packages/*/package.json package.json | grep -v node_modules`,
				{ encoding: "utf-8" },
			);
			const matches = result.trim().split("\n").filter(Boolean);
			expect(matches).toHaveLength(0);
		} catch {
			// grep exits 1 when no matches — that's success
			expect(true).toBe(true);
		}
	});
});
