import { execSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	checkDocker,
	checkGit,
	checkNeonctl,
	checkNode,
	checkPython,
	checkUv,
	checkYarn,
	runAllChecks,
} from "../checks.js";

vi.mock("node:child_process", () => ({
	execSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);

beforeEach(() => {
	mockExecSync.mockReset();
});

describe("checkNode", () => {
	it("passes when node version is >= 20", () => {
		mockExecSync.mockReturnValueOnce("v22.12.0\n");
		expect(checkNode()).toEqual({
			name: "Node.js",
			status: "pass",
			version: "22.12.0",
		});
	});

	it("fails when node is not found", () => {
		mockExecSync.mockImplementationOnce(() => {
			throw new Error("command not found");
		});
		const result = checkNode();
		expect(result.status).toBe("fail");
		expect(result.message).toBe("Not found");
	});

	it("fails when node version is below 20", () => {
		mockExecSync.mockReturnValueOnce("v18.19.0\n");
		const result = checkNode();
		expect(result.status).toBe("fail");
		expect(result.message).toBe("Requires >= 20.0.0");
	});
});

describe("checkPython", () => {
	it("passes when python3 version is >= 3.12", () => {
		mockExecSync.mockReturnValueOnce("Python 3.12.3\n");
		expect(checkPython()).toEqual({
			name: "Python",
			status: "pass",
			version: "3.12.3",
		});
	});

	it("falls back to `python` when `python3` is unavailable", () => {
		mockExecSync
			.mockImplementationOnce(() => {
				throw new Error("not found");
			})
			.mockReturnValueOnce("Python 3.12.0\n");
		const result = checkPython();
		expect(result.status).toBe("pass");
		expect(mockExecSync).toHaveBeenCalledTimes(2);
	});

	it("fails when neither python3 nor python is found", () => {
		mockExecSync.mockImplementation(() => {
			throw new Error("not found");
		});
		expect(checkPython().status).toBe("fail");
	});
});

describe("checkYarn", () => {
	it("passes with the raw version string", () => {
		mockExecSync.mockReturnValueOnce("1.22.19\n");
		expect(checkYarn()).toEqual({
			name: "yarn",
			status: "pass",
			version: "1.22.19",
		});
	});

	it("fails when not found", () => {
		mockExecSync.mockImplementationOnce(() => {
			throw new Error("not found");
		});
		expect(checkYarn().status).toBe("fail");
	});
});

describe("checkUv", () => {
	it("passes when found", () => {
		mockExecSync.mockReturnValueOnce("uv 0.5.11\n");
		const result = checkUv();
		expect(result.status).toBe("pass");
		expect(result.version).toBe("0.5.11");
	});

	it("fails when not found", () => {
		mockExecSync.mockImplementationOnce(() => {
			throw new Error("not found");
		});
		expect(checkUv().status).toBe("fail");
	});
});

describe("checkGit", () => {
	it("passes when found", () => {
		mockExecSync.mockReturnValueOnce("git version 2.43.0\n");
		const result = checkGit();
		expect(result.status).toBe("pass");
		expect(result.version).toBe("2.43.0");
	});

	it("fails when not found", () => {
		mockExecSync.mockImplementationOnce(() => {
			throw new Error("not found");
		});
		expect(checkGit().status).toBe("fail");
	});
});

describe("checkDocker", () => {
	it("passes when installed and the daemon is running", () => {
		mockExecSync
			.mockReturnValueOnce("Docker version 27.3.1\n")
			.mockReturnValueOnce("Server info...\n");
		const result = checkDocker();
		expect(result.status).toBe("pass");
		expect(result.version).toBe("27.3.1");
	});

	it("warns when installed but the daemon is not running", () => {
		mockExecSync
			.mockReturnValueOnce("Docker version 27.3.1\n")
			.mockImplementationOnce(() => {
				throw new Error("daemon not running");
			});
		const result = checkDocker();
		expect(result.status).toBe("warn");
		expect(result.message).toBe("Installed but not running");
	});

	it("fails when not found", () => {
		mockExecSync.mockImplementationOnce(() => {
			throw new Error("not found");
		});
		expect(checkDocker().status).toBe("fail");
	});
});

describe("checkNeonctl", () => {
	it("passes when found", () => {
		mockExecSync.mockReturnValueOnce("1.0.0\n");
		expect(checkNeonctl().status).toBe("pass");
	});

	it("warns (not fails) when not found, since it's optional", () => {
		mockExecSync.mockImplementationOnce(() => {
			throw new Error("not found");
		});
		expect(checkNeonctl().status).toBe("warn");
	});
});

describe("runAllChecks", () => {
	it("returns all 7 checks in a fixed order", () => {
		mockExecSync.mockImplementation(() => {
			throw new Error("not found");
		});
		const results = runAllChecks();
		expect(results.map((r) => r.name)).toEqual([
			"Node.js",
			"Python",
			"yarn",
			"uv",
			"git",
			"Docker",
			"neonctl",
		]);
	});
});
