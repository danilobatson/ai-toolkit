import { execSync } from "node:child_process";

export interface CheckResult {
	name: string;
	status: "pass" | "fail" | "warn";
	version?: string;
	message?: string;
	fix?: string;
}

/**
 * Run a shell command and return stdout, or null if it fails.
 */
function tryExec(command: string): string | null {
	try {
		return execSync(command, {
			encoding: "utf-8",
			timeout: 10_000,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
	} catch {
		return null;
	}
}

/**
 * Extract a semver-like version from a string.
 * "v22.12.0" → "22.12.0"
 * "Python 3.12.3" → "3.12.3"
 */
function extractVersion(raw: string): string | null {
	const match = raw.match(/(\d+\.\d+\.\d+)/);
	return match ? match[1] : null;
}

/**
 * Compare semver: returns true if actual >= required.
 */
function semverGte(actual: string, required: string): boolean {
	const a = actual.split(".").map(Number);
	const r = required.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if ((a[i] ?? 0) > (r[i] ?? 0)) return true;
		if ((a[i] ?? 0) < (r[i] ?? 0)) return false;
	}
	return true; // equal
}

/** Check Node.js >= 20 */
export function checkNode(): CheckResult {
	const raw = tryExec("node --version");
	if (!raw) {
		return {
			name: "Node.js",
			status: "fail",
			message: "Not found",
			fix: "Install Node.js 20+: https://nodejs.org",
		};
	}

	const version = extractVersion(raw);
	if (!version || !semverGte(version, "20.0.0")) {
		return {
			name: "Node.js",
			status: "fail",
			version: version ?? raw,
			message: "Requires >= 20.0.0",
			fix: "Upgrade Node.js: https://nodejs.org",
		};
	}

	return { name: "Node.js", status: "pass", version };
}

/** Check Python >= 3.12 */
export function checkPython(): CheckResult {
	const raw = tryExec("python3 --version") ?? tryExec("python --version");
	if (!raw) {
		return {
			name: "Python",
			status: "fail",
			message: "Not found",
			fix: "Install Python 3.12+: https://python.org",
		};
	}

	const version = extractVersion(raw);
	if (!version || !semverGte(version, "3.12.0")) {
		return {
			name: "Python",
			status: "fail",
			version: version ?? raw,
			message: "Requires >= 3.12.0",
			fix: "Upgrade Python: https://python.org",
		};
	}

	return { name: "Python", status: "pass", version };
}

/** Check uv (Python package manager) */
export function checkUv(): CheckResult {
	const raw = tryExec("uv --version");
	if (!raw) {
		return {
			name: "uv",
			status: "fail",
			message: "Not found",
			fix: "Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh",
		};
	}

	const version = extractVersion(raw);
	return { name: "uv", status: "pass", version: version ?? raw };
}

/** Check yarn */
export function checkYarn(): CheckResult {
	const raw = tryExec("yarn --version");
	if (!raw) {
		return {
			name: "yarn",
			status: "fail",
			message: "Not found",
			fix: "Install yarn: npm install -g yarn",
		};
	}

	return { name: "yarn", status: "pass", version: raw };
}

/** Check Docker is running */
export function checkDocker(): CheckResult {
	const version = tryExec("docker --version");
	if (!version) {
		return {
			name: "Docker",
			status: "fail",
			message: "Not found",
			fix: "Install Docker Desktop: https://docker.com/products/docker-desktop",
		};
	}

	// Check if Docker daemon is actually running
	const running = tryExec("docker info");
	if (!running) {
		return {
			name: "Docker",
			status: "warn",
			version: extractVersion(version) ?? undefined,
			message: "Installed but not running",
			fix: "Start Docker Desktop",
		};
	}

	return {
		name: "Docker",
		status: "pass",
		version: extractVersion(version) ?? undefined,
	};
}

/** Check neonctl CLI */
export function checkNeonctl(): CheckResult {
	const raw = tryExec("neonctl --version");
	if (!raw) {
		return {
			name: "neonctl",
			status: "warn",
			message: "Not found (optional — needed for database commands)",
			fix: "Install neonctl: npm install -g neonctl",
		};
	}

	return {
		name: "neonctl",
		status: "pass",
		version: extractVersion(raw) ?? raw,
	};
}

/** Check git */
export function checkGit(): CheckResult {
	const raw = tryExec("git --version");
	if (!raw) {
		return {
			name: "git",
			status: "fail",
			message: "Not found",
			fix: "Install git: https://git-scm.com",
		};
	}

	return { name: "git", status: "pass", version: extractVersion(raw) ?? raw };
}

/**
 * Run all environment checks.
 */
export function runAllChecks(): CheckResult[] {
	return [
		checkNode(),
		checkPython(),
		checkYarn(),
		checkUv(),
		checkGit(),
		checkDocker(),
		checkNeonctl(),
	];
}
