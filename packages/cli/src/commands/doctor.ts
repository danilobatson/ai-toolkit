import chalk from "chalk";
import { Command } from "commander";
import { type CheckResult, runAllChecks } from "../lib/checks.js";

/**
 * Format a single check result as a terminal line.
 */
function formatCheck(check: CheckResult): string {
	const icon =
		check.status === "pass"
			? chalk.green("✓")
			: check.status === "warn"
				? chalk.yellow("⚠")
				: chalk.red("✗");

	const name = check.name.padEnd(12);
	const version = check.version ? chalk.dim(` v${check.version}`) : "";

	if (check.status === "pass") {
		return `  ${icon} ${name}${version}`;
	}

	const message = check.message ? chalk.dim(` — ${check.message}`) : "";
	const fix = check.fix ? `\n     ${chalk.cyan(`Fix: ${check.fix}`)}` : "";
	return `  ${icon} ${name}${message}${fix}`;
}

export const doctorCommand = new Command("doctor")
	.description("Validate your development environment")
	.action(() => {
		console.log();
		console.log(chalk.bold("  aitk doctor"));
		console.log(chalk.dim("  Checking development environment...\n"));

		const results = runAllChecks();

		for (const result of results) {
			console.log(formatCheck(result));
		}

		console.log();

		const failures = results.filter((r) => r.status === "fail");
		const warnings = results.filter((r) => r.status === "warn");
		const passes = results.filter((r) => r.status === "pass");

		if (failures.length === 0) {
			console.log(
				chalk.green(
					`  All clear! ${passes.length} passed${warnings.length > 0 ? `, ${warnings.length} warnings` : ""}`,
				),
			);
		} else {
			console.log(
				chalk.red(
					`  ${failures.length} failed, ${passes.length} passed${warnings.length > 0 ? `, ${warnings.length} warnings` : ""}`,
				),
			);
			console.log(
				chalk.dim("  Fix the issues above, then run `aitk doctor` again.\n"),
			);
			process.exitCode = 1;
		}

		console.log();
	});
