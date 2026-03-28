import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: [
			"src/**/__tests__/**/*.test.ts",
			"src/**/__verification__/**/*.test.ts",
			"src/**/__integration__/**/*.test.ts",
			"src/**/__security__/**/*.test.ts",
		],
		exclude: ["node_modules", "dist"],
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov"],
			include: ["src/**/*.ts"],
			exclude: ["src/**/__tests__/**", "src/**/*.test.ts"],
			thresholds: {
				lines: 60,
				functions: 60,
			},
		},
	},
});
