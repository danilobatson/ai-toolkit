import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckResult } from "../../lib/checks.js";

const runAllChecks = vi.fn<() => CheckResult[]>();

vi.mock("../../lib/checks.js", () => ({
	runAllChecks: () => runAllChecks(),
}));

async function runDoctor(): Promise<string> {
	const { doctorCommand } = await import("../doctor.js");
	const program = new Command();
	program.exitOverride();
	program.addCommand(doctorCommand);
	// vi.spyOn(console, "log") doesn't intercept commander's output here; swap the
	// method directly instead.
	const originalLog = console.log;
	const calls: unknown[][] = [];
	console.log = (...args: unknown[]) => {
		calls.push(args);
	};
	try {
		await program.parseAsync(["node", "aitk", "doctor"]);
	} finally {
		console.log = originalLog;
	}
	return calls.flat().join("\n");
}

describe("doctorCommand", () => {
	beforeEach(() => {
		runAllChecks.mockReset();
		process.exitCode = undefined;
	});

	it("prints a pass summary and leaves the exit code unset when all checks pass", async () => {
		runAllChecks.mockReturnValue([
			{ name: "Node.js", status: "pass", version: "22.12.0" },
			{ name: "git", status: "pass", version: "2.43.0" },
		]);
		const output = await runDoctor();
		expect(output).toMatch(/All clear! 2 passed/);
		expect(process.exitCode).toBeUndefined();
	});

	it("sets exit code 1 and prints the fix hint when a check fails", async () => {
		runAllChecks.mockReturnValue([
			{
				name: "Node.js",
				status: "fail",
				message: "Not found",
				fix: "Install Node.js 20+: https://nodejs.org",
			},
			{ name: "git", status: "pass", version: "2.43.0" },
		]);
		const output = await runDoctor();
		expect(output).toMatch(/1 failed, 1 passed/);
		expect(output).toContain("Fix: Install Node.js 20+");
		expect(process.exitCode).toBe(1);
	});

	it("counts warnings in the summary without failing", async () => {
		runAllChecks.mockReturnValue([
			{ name: "Docker", status: "warn", message: "Installed but not running" },
			{ name: "git", status: "pass", version: "2.43.0" },
		]);
		const output = await runDoctor();
		expect(output).toMatch(/All clear! 1 passed, 1 warnings/);
		expect(process.exitCode).toBeUndefined();
	});
});
