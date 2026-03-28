/**
 * Semantic checks — grep-based verification that catches bugs
 * TypeScript and lint miss. These enforce project architecture rules.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../../..");
const SRC = join(ROOT, "packages/toolkit/src");

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
	it("no raw throw new Error() in source (excluding deprecated neon/ and intentional testing/)", () => {
		const matches = grep("throw new Error(", SRC)
			.filter((line) => !line.includes("neon/"))
			.filter((line) => !line.includes("testing/"));
		expect(matches).toHaveLength(0);
	});

	it("no hardcoded provider URLs (except Langfuse default)", () => {
		const matches = grep("https\\?://api\\.|https\\?://cloud\\.", SRC);
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
		const pkgFiles = [
			join(ROOT, "package.json"),
			join(ROOT, "packages/toolkit/package.json"),
			join(ROOT, "packages/cli/package.json"),
		];
		const matches: string[] = [];
		for (const file of pkgFiles) {
			const content = readFileSync(file, "utf-8");
			const lines = content.split("\n");
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].includes('"^')) {
					matches.push(`${file}:${i + 1}: ${lines[i].trim()}`);
				}
			}
		}
		expect(matches).toHaveLength(0);
	});
});
