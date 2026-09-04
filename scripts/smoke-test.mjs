#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// smoke-test.mjs
//
// Executes the published packages/toolkit/dist artifact instead of just
// importing it. Importing alone proves nothing: src/storage/blob.ts and
// src/cache/client.ts load their optional peer via a dynamic import()
// inside function bodies, so nothing touches the peer until one of those
// functions is actually called.
//
// This script:
//   1. Imports every entry in packages/toolkit/package.json's `exports` map.
//   2. Calls uploadDocument/deleteDocument/listDocuments with @vercel/blob
//      installed, and constructs a RedisCacheAdapter with ioredis installed.
//   3. Fails if any call reports the peer dependency as missing — that
//      means the dynamic import never reached the installed package.
//
// Exits non-zero if dist/ is missing, an entry fails to import, or a call
// reports its peer dependency as missing.
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

// Importing proves nothing on its own — the dynamic import() calls below
// only run once something actually invokes the function bodies that hold them.
console.log("\nInvoking storage and cache paths (peers must be installed)...");

const MISSING_PEER_CODES = new Set([
	"STORAGE_MISSING_DEPENDENCY",
	"CACHE_MISSING_DEPENDENCY",
]);

function looksLikeMissingPeer(error) {
	return MISSING_PEER_CODES.has(error?.code);
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
		// Constructing is NOT enough: the constructor only stores the load
		// promise and swallows its rejection, so `ioredis` is never touched
		// until a method awaits it. A construct-only check passes even when
		// the peer is missing — it cannot fail, which is the thing this
		// script exists to catch.
		name: "RedisCacheAdapter.get()",
		run: async () => {
			const adapter = new RedisCacheAdapter("redis://127.0.0.1:6379");
			// Timing out means the peer loaded and we reached a real connection
			// attempt, so surface it as an unrelated error, not a missing peer.
			return Promise.race([
				adapter.get("smoke-test"),
				new Promise((_, reject) =>
					setTimeout(
						() => reject(new Error("connect timeout (peer loaded)")),
						15000,
					),
				),
			]);
		},
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
				"        The peer dependency IS installed — this call's dynamic import() failed before ever reaching it.",
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

// ioredis may hold an open socket after the connection attempt, which would
// keep the event loop alive and hang the job after a passing run.
process.exit(0);
