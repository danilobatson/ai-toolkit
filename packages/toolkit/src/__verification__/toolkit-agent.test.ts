/**
 * Semantic checks — grep-based verification that catches bugs
 * TypeScript and lint miss. These enforce project architecture rules.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../../..");
const SRC = join(ROOT, "packages/toolkit/src");

function grep(pattern: string, path: string, exclude?: string): string[] {
	if (!existsSync(path)) {
		throw new Error(`grep: path does not exist: ${path}`);
	}
	const excludeFlag = exclude ? ` | grep -v "${exclude}"` : "";
	try {
		const result = execSync(
			`grep -rn "${pattern}" ${path} --include="*.ts" | grep -v __tests__ | grep -v __verification__ | grep -v __integration__ | grep -v __security__${excludeFlag}`,
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

	// Scope: this rule targets hardcoded AI-provider endpoints (LLM `api.*` /
	// `cloud.*` subdomains), which belong behind config.getProviderUrl() instead.
	// Non-AI-provider hosts (e.g. object storage like blob.vercel-storage.com)
	// are a different concern and are intentionally out of scope for this check.
	it("no hardcoded provider URLs (except Langfuse default)", () => {
		// Plain (non-extended) grep: "\?" is the GNU BRE "optional preceding char"
		// extension, and "\|" is the GNU BRE alternation extension. A bare "|" here
		// is a literal pipe character under BRE, not alternation — that was the bug.
		const matches = grep("https\\?://api\\.\\|https\\?://cloud\\.", SRC);
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

describe("provider-URL pattern regression (grep() correctness)", () => {
	// The pre-fix pattern: a bare "|" is a literal pipe under BRE (plain grep),
	// not alternation, so it only ever matched the literal text
	// "https://api.|https://cloud.". Kept here to prove the regression.
	const BUGGY_PATTERN = "https\\?://api\\.|https\\?://cloud\\.";
	const FIXED_PATTERN = "https\\?://api\\.\\|https\\?://cloud\\.";

	function withFixture(content: string, run: (dir: string) => void): void {
		const dir = mkdtempSync(join(tmpdir(), "semantic-check-fixture-"));
		try {
			writeFileSync(join(dir, "fixture.ts"), content);
			run(dir);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}

	it("the pre-fix pattern lets a hardcoded https://api. URL through unnoticed", () => {
		withFixture('export const x = "https://api.openai.com/v1";\n', (dir) => {
			expect(grep(BUGGY_PATTERN, dir)).toHaveLength(0);
		});
	});

	it("the fixed pattern catches a hardcoded https://api. URL", () => {
		withFixture('export const x = "https://api.openai.com/v1";\n', (dir) => {
			expect(grep(FIXED_PATTERN, dir)).toHaveLength(1);
		});
	});

	it("the fixed pattern catches a hardcoded https://cloud. URL", () => {
		withFixture('export const x = "https://cloud.example.com/v1";\n', (dir) => {
			expect(grep(FIXED_PATTERN, dir)).toHaveLength(1);
		});
	});

	it("deliberately does not flag non-provider hosts like object storage (out of scope by design)", () => {
		withFixture('export const x = "https://blob.vercel-storage.com/foo";\n', (dir) => {
			expect(grep(FIXED_PATTERN, dir)).toHaveLength(0);
		});
	});
});

describe("grep() path validation", () => {
	it("throws when path does not exist, instead of silently returning []", () => {
		const missing = join(SRC, "__does-not-exist__");
		expect(() => grep("anything", missing)).toThrow(/does not exist/);
	});
});
