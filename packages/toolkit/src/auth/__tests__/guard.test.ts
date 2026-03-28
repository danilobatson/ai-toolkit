import { describe, expect, it } from "vitest";
import { AuthError } from "../../errors/types.js";
import { createApiKeyGuard } from "../middleware.js";

describe("createApiKeyGuard", () => {
	function makeContext(headers: Record<string, string>) {
		return {
			switchToHttp: () => ({
				getRequest: () => ({ headers }),
			}),
		};
	}

	it("CRASH — does not throw when creating guard class", () => {
		expect(() => createApiKeyGuard("secret-key")).not.toThrow();
	});

	it("BEHAVIOR — returns a class with canActivate method", () => {
		const Guard = createApiKeyGuard("secret-key");
		const instance = new Guard();
		expect(typeof instance.canActivate).toBe("function");
	});

	it("BEHAVIOR — canActivate returns true for valid API key", () => {
		const Guard = createApiKeyGuard("my-secret-key");
		const instance = new Guard();
		const ctx = makeContext({ "x-api-key": "my-secret-key" });
		expect(instance.canActivate(ctx)).toBe(true);
	});

	it("BEHAVIOR — canActivate accepts Bearer token", () => {
		const Guard = createApiKeyGuard("my-secret-key");
		const instance = new Guard();
		const ctx = makeContext({ authorization: "Bearer my-secret-key" });
		expect(instance.canActivate(ctx)).toBe(true);
	});

	it("ENVIRONMENT — canActivate throws AuthError for invalid key", () => {
		const Guard = createApiKeyGuard("correct-key");
		const instance = new Guard();
		const ctx = makeContext({ "x-api-key": "wrong-key" });

		expect(() => instance.canActivate(ctx)).toThrow(/invalid api key/i);

		try {
			instance.canActivate(ctx);
		} catch (err) {
			expect(err).toBeInstanceOf(AuthError);
			expect((err as AuthError).code).toBe("AUTH_INVALID_KEY");
		}
	});

	it("ENVIRONMENT — canActivate throws AuthError for missing key", () => {
		const Guard = createApiKeyGuard("correct-key");
		const instance = new Guard();
		const ctx = makeContext({});

		expect(() => instance.canActivate(ctx)).toThrow(/invalid api key/i);
	});

	it("ENVIRONMENT — canActivate throws for different-length key", () => {
		const Guard = createApiKeyGuard("a-very-long-secret-key-here");
		const instance = new Guard();
		const ctx = makeContext({ "x-api-key": "short" });

		expect(() => instance.canActivate(ctx)).toThrow(/invalid api key/i);
	});

	it("CONTRACT — guard uses constant-time comparison (same error for wrong vs different-length)", () => {
		const Guard = createApiKeyGuard("secret-123");
		const instance = new Guard();

		const wrongKey = makeContext({ "x-api-key": "secret-456" });
		const shortKey = makeContext({ "x-api-key": "x" });

		let wrongErr: AuthError | undefined;
		let shortErr: AuthError | undefined;

		try {
			instance.canActivate(wrongKey);
		} catch (err) {
			wrongErr = err as AuthError;
		}
		try {
			instance.canActivate(shortKey);
		} catch (err) {
			shortErr = err as AuthError;
		}

		// Both should produce the same error code — no information leakage
		expect(wrongErr?.code).toBe("AUTH_INVALID_KEY");
		expect(shortErr?.code).toBe("AUTH_INVALID_KEY");
	});
});
