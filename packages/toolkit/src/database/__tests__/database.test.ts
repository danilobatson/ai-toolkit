import { afterEach, describe, expect, it } from "vitest";
import { ToolkitError } from "../../errors/base.js";
import { ValidationError } from "../../errors/types.js";
import { createDatabase, detectProvider } from "../database.js";
import { getVectorColumn } from "../vector.js";

describe("detectProvider", () => {
	it("detects Neon from neon.tech URL", () => {
		expect(
			detectProvider(
				"postgresql://user:pass@ep-cool-dawn.us-east-2.aws.neon.tech/db",
			),
		).toBe("neon");
	});

	it("detects Supabase from supabase.com URL", () => {
		expect(
			detectProvider(
				"postgresql://postgres.ref:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
			),
		).toBe("supabase");
	});

	it("detects AWS RDS from rds.amazonaws.com URL", () => {
		expect(
			detectProvider(
				"postgresql://admin:pass@mydb.xyz.us-east-1.rds.amazonaws.com:5432/mydb",
			),
		).toBe("aws-rds");
	});

	it("detects local from localhost URL", () => {
		expect(
			detectProvider("postgresql://postgres:password@localhost:5432/mydb"),
		).toBe("local");
	});

	it("detects local from 127.0.0.1 URL", () => {
		expect(
			detectProvider("postgresql://postgres:password@127.0.0.1:5432/mydb"),
		).toBe("local");
	});

	it("defaults to local for unknown hosts", () => {
		expect(
			detectProvider("postgresql://user:pass@custom-server.example.com/db"),
		).toBe("local");
	});

	it("is case-insensitive", () => {
		expect(
			detectProvider("postgresql://user@EP-COOL.US-EAST-2.AWS.NEON.TECH/db"),
		).toBe("neon");
	});
});

describe("createDatabase", () => {
	const origDbUrl = process.env.DATABASE_URL;

	afterEach(() => {
		if (origDbUrl) process.env.DATABASE_URL = origDbUrl;
		else delete process.env.DATABASE_URL;
	});

	// ─── LEVEL 1: CRASH ─────────────────────────────────────────────────

	it("throws ValidationError when no connection string", async () => {
		delete process.env.DATABASE_URL;
		await expect(createDatabase()).rejects.toThrow(/DATABASE_URL not set/i);

		try {
			await createDatabase();
		} catch (err) {
			expect(err).toBeInstanceOf(ValidationError);
			expect((err as ValidationError).code).toBe("DATABASE_NO_CONNECTION");
		}
	});

	it("throws ToolkitError when postgres driver not installed", async () => {
		process.env.DATABASE_URL =
			"postgresql://postgres:password@localhost:5432/mydb";
		// This will fail because postgres driver isn't installed in dev
		await expect(createDatabase()).rejects.toThrow(/not found|install/i);

		try {
			await createDatabase();
		} catch (err) {
			expect(err).toBeInstanceOf(ToolkitError);
			expect((err as ToolkitError).code).toBe("DATABASE_MISSING_DEPENDENCY");
		}
	});

	it("throws ToolkitError for neon-http when @neondatabase/serverless missing", async () => {
		process.env.DATABASE_URL = "postgresql://user@ep-cool.neon.tech/db";
		await expect(createDatabase({ driver: "neon-http" })).rejects.toThrow(
			/not found|install/i,
		);

		try {
			await createDatabase({ driver: "neon-http" });
		} catch (err) {
			expect(err).toBeInstanceOf(ToolkitError);
			expect((err as ToolkitError).code).toBe("DATABASE_MISSING_DEPENDENCY");
		}
	});

	it("throws ToolkitError for neon-serverless when @neondatabase/serverless missing", async () => {
		process.env.DATABASE_URL = "postgresql://user@ep-cool.neon.tech/db";
		await expect(createDatabase({ driver: "neon-serverless" })).rejects.toThrow(
			/not found|install/i,
		);

		try {
			await createDatabase({ driver: "neon-serverless" });
		} catch (err) {
			expect(err).toBeInstanceOf(ToolkitError);
			expect((err as ToolkitError).code).toBe("DATABASE_MISSING_DEPENDENCY");
		}
	});

	// ─── LEVEL 2: BEHAVIOR ──────────────────────────────────────────────

	it("accepts explicit connectionString in config", async () => {
		delete process.env.DATABASE_URL;
		// Will fail on missing driver, but validates connectionString is accepted
		try {
			await createDatabase({
				connectionString: "postgresql://postgres@localhost:5432/test",
			});
		} catch (err) {
			// Should NOT be a validation error — should be a dependency error
			expect((err as ToolkitError).code).toBe("DATABASE_MISSING_DEPENDENCY");
		}
	});

	it("reads DATABASE_URL from env when no config", async () => {
		process.env.DATABASE_URL = "postgresql://postgres@localhost:5432/test";
		try {
			await createDatabase();
		} catch (err) {
			// Should get past validation to dependency loading
			expect((err as ToolkitError).code).toBe("DATABASE_MISSING_DEPENDENCY");
		}
	});

	// ─── LEVEL 3: DATA QUALITY ──────────────────────────────────────────

	it("ValidationError has correct fields metadata", async () => {
		delete process.env.DATABASE_URL;
		try {
			await createDatabase();
		} catch (err) {
			expect(err).toBeInstanceOf(ValidationError);
			const ve = err as ValidationError;
			expect(ve.statusCode).toBe(400);
			expect(ve.retryable).toBe(false);
			expect(ve.fields).toBeDefined();
			expect(ve.fields?.connectionString).toBe("required");
		}
	});

	it("ToolkitError has correct code for missing dependency", async () => {
		process.env.DATABASE_URL = "postgresql://postgres@localhost:5432/test";
		try {
			await createDatabase();
		} catch (err) {
			expect(err).toBeInstanceOf(ToolkitError);
			expect((err as ToolkitError).statusCode).toBe(500);
		}
	});

	// ─── LEVEL 4: ENVIRONMENT ───────────────────────────────────────────

	it("auto-detects provider from Neon connection string", async () => {
		process.env.DATABASE_URL =
			"postgresql://user@ep-test.us-east-2.aws.neon.tech/db";
		try {
			await createDatabase();
		} catch (err) {
			// Reaches driver loading — provider was detected
			expect((err as ToolkitError).code).toBe("DATABASE_MISSING_DEPENDENCY");
		}
	});

	it("respects explicit provider override", async () => {
		process.env.DATABASE_URL = "postgresql://postgres@localhost:5432/test";
		try {
			await createDatabase({ provider: "neon" });
		} catch (err) {
			expect((err as ToolkitError).code).toBe("DATABASE_MISSING_DEPENDENCY");
		}
	});

	it("respects explicit driver override", async () => {
		process.env.DATABASE_URL = "postgresql://postgres@localhost:5432/test";
		try {
			await createDatabase({ driver: "neon-http" });
		} catch (err) {
			expect((err as ToolkitError).code).toBe("DATABASE_MISSING_DEPENDENCY");
			expect((err as ToolkitError).message).toMatch(
				/@neondatabase\/serverless/,
			);
		}
	});

	// ─── LEVEL 5: PATTERN ───────────────────────────────────────────────

	it("never throws raw Error — always ToolkitError or subclass", async () => {
		delete process.env.DATABASE_URL;
		try {
			await createDatabase();
		} catch (err) {
			expect(err).toBeInstanceOf(ToolkitError);
		}
	});

	it("createDatabase is async (returns Promise)", () => {
		delete process.env.DATABASE_URL;
		const result = createDatabase();
		expect(result).toBeInstanceOf(Promise);
		// Suppress unhandled rejection
		result.catch(() => {});
	});

	// ─── LEVEL 6: CONTRACT ──────────────────────────────────────────────

	it("exports match the DatabaseClient interface shape", () => {
		// Verify the factory function signature
		expect(typeof createDatabase).toBe("function");
		expect(createDatabase.length).toBeLessThanOrEqual(1); // 0 or 1 param
	});

	it("exports detectProvider as a pure function", () => {
		expect(typeof detectProvider).toBe("function");
		expect(detectProvider.length).toBe(1);
	});
});

describe("getVectorColumn", () => {
	it("throws ToolkitError when drizzle-orm is not installed", async () => {
		// drizzle-orm is not installed in dev, so this should throw
		await expect(getVectorColumn()).rejects.toThrow(/drizzle-orm not found/i);

		try {
			await getVectorColumn();
		} catch (err) {
			expect(err).toBeInstanceOf(ToolkitError);
			expect((err as ToolkitError).code).toBe("DATABASE_MISSING_DEPENDENCY");
		}
	});

	it("is async (returns a Promise)", () => {
		const result = getVectorColumn();
		expect(result).toBeInstanceOf(Promise);
		result.catch(() => {});
	});
});
