#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// smoke-test.mjs
//
// Executes the published packages/toolkit/dist artifact instead of just
// importing it. Importing alone proves nothing: src/storage/blob.ts and
// src/cache/client.ts call require() inside function bodies, and `require`
// does not exist in the ESM build this package ships (package.json has
// "type": "module"). Nothing fails until one of those functions is called.
//
// This script:
//   1. Imports every entry in packages/toolkit/package.json's `exports` map.
//   2. Calls uploadDocument/deleteDocument/listDocuments with @vercel/blob
//      installed, and constructs a RedisCacheAdapter with ioredis installed.
//   3. Fails if any call reports the peer dependency as missing, or surfaces
//      a raw "require is not defined" — both mean require() never reached
//      the installed package.
//
// Exits non-zero if dist/ is missing, an entry fails to import, or a call
// exhibits the require-in-ESM bug.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TOOLKIT = join(ROOT, "packages/toolkit");
const DIST = join(TOOLKIT, "dist");

if (!existsSync(DIST)) {
	console.error(`No dist directory at ${DIST}. Run yarn build first.`);
	process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(TOOLKIT, "package.json"), "utf8"));
const exportEntries = Object.entries(pkg.exports);

let failed = false;

console.log(
	`Importing ${exportEntries.length} entries from the built artifact...`,
);
for (const [subpath, target] of exportEntries) {
	const file = join(TOOLKIT, target.import);
	try {
		await import(file);
		console.log(`  OK    ${subpath}`);
	} catch (error) {
		failed = true;
		console.error(`  FAIL  ${subpath} — ${error.message}`);
	}
}

if (failed) {
	console.error(
		"\nOne or more entries failed to import. Aborting before invocation checks.",
	);
	process.exit(1);
}

// Importing proves nothing on its own — the require() calls below only
// fail once something actually invokes the function bodies that hold them.
console.log("\nInvoking storage and cache paths (peers must be installed)...");

const MISSING_PEER_CODES = new Set([
	"STORAGE_MISSING_DEPENDENCY",
	"CACHE_MISSING_DEPENDENCY",
]);

function looksLikeMissingPeer(error) {
	if (MISSING_PEER_CODES.has(error?.code)) return true;
	// require() calls that don't set one of the codes above still leak the
	// raw ReferenceError message through a wrapping error (see deleteDocument
	// and listDocuments in src/storage/blob.ts).
	return /require is not defined/i.test(error?.message ?? "");
}

const { uploadDocument, deleteDocument, listDocuments } = await import(
	join(TOOLKIT, "dist/storage/index.js")
);
const { RedisCacheAdapter } = await import(
	join(TOOLKIT, "dist/cache/index.js")
);

const checks = [
	{
		name: "uploadDocument()",
		run: () =>
			uploadDocument(Buffer.from("smoke-test"), { folder: "smoke-test" }),
	},
	{
		name: "deleteDocument()",
		run: () => deleteDocument("https://example.com/smoke-test/fake.txt"),
	},
	{
		name: "listDocuments()",
		run: () => listDocuments({ prefix: "smoke-test" }),
	},
	{
		name: "new RedisCacheAdapter()",
		run: () => new RedisCacheAdapter("redis://localhost:6379"),
	},
];

for (const check of checks) {
	try {
		await check.run();
		console.log(`  OK    ${check.name} did not throw`);
	} catch (error) {
		if (looksLikeMissingPeer(error)) {
			failed = true;
			console.error(
				`  FAIL  ${check.name} — ${error.code ?? error.name}: ${error.message}`,
			);
			console.error(
				"        The peer dependency IS installed — this call went through require() in the ESM build and failed before ever reaching it.",
			);
		} else {
			console.log(
				`  OK    ${check.name} threw for an unrelated reason (${error.code ?? error.name}: ${error.message})`,
			);
		}
	}
}

if (failed) {
	console.error(
		"\nSmoke test failed: the published artifact throws on installed peer dependencies.",
	);
	process.exit(1);
}

console.log(
	"\nSmoke test passed — every entry imports and the storage/cache paths reach their installed peers.",
);
