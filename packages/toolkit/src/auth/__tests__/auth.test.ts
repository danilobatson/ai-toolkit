import { describe, expect, it } from "vitest";
import { AuthError } from "../../errors/types.js";
import {
	getOrgId,
	getTenantContext,
	getUserId,
	requireApiKey,
} from "../middleware.js";

function makeRequest(headers: Record<string, string>) {
	return { headers };
}

describe("requireApiKey", () => {
	it("accepts valid key from x-api-key header", () => {
		const req = makeRequest({ "x-api-key": "secret-123" });
		const result = requireApiKey(req, "secret-123");
		expect(result).toBe("secret-123");
	});

	it("rejects missing key with AuthError", () => {
		const req = makeRequest({});
		expect(() => requireApiKey(req, "secret-123")).toThrow(/invalid api key/i);
		try {
			requireApiKey(req, "secret-123");
		} catch (err) {
			expect(err).toBeInstanceOf(AuthError);
		}
	});

	it("rejects invalid key with AuthError", () => {
		const req = makeRequest({ "x-api-key": "wrong-key" });
		expect(() => requireApiKey(req, "secret-123")).toThrow(/invalid api key/i);
	});

	it("rejects key with different length via constant-time comparison", () => {
		const req = makeRequest({ "x-api-key": "short" });
		expect(() => requireApiKey(req, "much-longer-key")).toThrow(
			/invalid api key/i,
		);
	});

	it("accepts valid key from Authorization Bearer header", () => {
		const req = makeRequest({ authorization: "Bearer secret-123" });
		const result = requireApiKey(req, "secret-123");
		expect(result).toBe("secret-123");
	});
});

describe("getTenantContext", () => {
	it("extracts org_id correctly", () => {
		const req = makeRequest({ "x-org-id": "org_abc" });
		const ctx = getTenantContext(req);
		expect(ctx.orgId).toBe("org_abc");
	});
});

describe("getUserId", () => {
	it("extracts user_id from header", () => {
		const req = makeRequest({ "x-user-id": "user_42" });
		expect(getUserId(req)).toBe("user_42");
	});

	it("returns undefined when header missing", () => {
		const req = makeRequest({});
		expect(getUserId(req)).toBeUndefined();
	});
});

describe("getOrgId", () => {
	it("throws AuthError when header missing", () => {
		const req = makeRequest({});
		expect(() => getOrgId(req)).toThrow(/missing/i);
	});
});
