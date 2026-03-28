import { afterEach, describe, expect, it } from "vitest";
import { ToolkitError } from "../../errors/base.js";
import { ValidationError } from "../../errors/types.js";
import { migrate } from "../migrate.js";

describe("migrate", () => {
	const origDbUrl = process.env.DATABASE_URL;

	afterEach(() => {
		if (origDbUrl) process.env.DATABASE_URL = origDbUrl;
		else delete process.env.DATABASE_URL;
	});

	// ─── LEVEL 1: CRASH ─────────────────────────────────────────────────

	it("throws ValidationError when no connection string", async () => {
		delete process.env.DATABASE_URL;
		await expect(migrate()).rejects.toThrow(/DATABASE_URL not set/i);

		try {
			await migrate();
		} catch (err) {
			expect(err).toBeInstanceOf(ValidationError);
			expect((err as ValidationError).code).toBe("DATABASE_NO_CONNECTION");
		}
	});

	it("throws ToolkitError when postgres driver not installed", async () => {
		process.env.DATABASE_URL = "postgresql://postgres@localhost:5432/mydb";
		await expect(migrate()).rejects.toThrow(/not found|install/i);

		try {
			await migrate();
		} catch (err) {
			expect(err).toBeInstanceOf(ToolkitError);
			expect((err as ToolkitError).code).toBe("DATABASE_MISSING_DEPENDENCY");
		}
	});

	// ─── LEVEL 2: BEHAVIOR ──────────────────────────────────────────────

	it("accepts explicit connectionString override", async () => {
		expect.assertions(1);
		delete process.env.DATABASE_URL;
		try {
			await migrate({
				connectionString: "postgresql://postgres@localhost:5432/test",
			});
		} catch (err) {
			// Should get past validation to dependency loading
			expect((err as ToolkitError).code).toBe("DATABASE_MISSING_DEPENDENCY");
		}
	});

	it("accepts custom migrationsFolder", async () => {
		expect.assertions(1);
		process.env.DATABASE_URL = "postgresql://postgres@localhost:5432/test";
		try {
			await migrate({ migrationsFolder: "./custom-migrations" });
		} catch (err) {
			expect((err as ToolkitError).code).toBe("DATABASE_MISSING_DEPENDENCY");
		}
	});

	// ─── LEVEL 3: DATA QUALITY ──────────────────────────────────────────

	it("ValidationError has correct structure", async () => {
		expect.assertions(3);
		delete process.env.DATABASE_URL;
		try {
			await migrate();
		} catch (err) {
			const ve = err as ValidationError;
			expect(ve.statusCode).toBe(400);
			expect(ve.retryable).toBe(false);
			expect(ve.fields?.connectionString).toBe("required");
		}
	});

	// ─── LEVEL 5: PATTERN ───────────────────────────────────────────────

	it("never throws raw Error — always ToolkitError or subclass", async () => {
		expect.assertions(1);
		delete process.env.DATABASE_URL;
		try {
			await migrate();
		} catch (err) {
			expect(err).toBeInstanceOf(ToolkitError);
		}
	});

	it("migrate is async (returns Promise)", () => {
		delete process.env.DATABASE_URL;
		const result = migrate();
		expect(result).toBeInstanceOf(Promise);
		result.catch(() => {});
	});

	// ─── LEVEL 6: CONTRACT ──────────────────────────────────────────────

	it("exports migrate as a function with 0-1 params", () => {
		expect(typeof migrate).toBe("function");
		expect(migrate.length).toBeLessThanOrEqual(1);
	});
});
