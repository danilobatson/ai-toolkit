#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// check-orphan-dist.mjs
//
// Flags any packages/toolkit/dist/**/*.js that has no matching
// packages/toolkit/src/**/*.ts (or .tsx). Compares files, not directories:
// a live directory with a deleted file must still fail the check.
//
// Exits non-zero and names each orphan file when orphans are found.
// ─────────────────────────────────────────────────────────────────────────────
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'packages/toolkit/dist');
const SRC = join(ROOT, 'packages/toolkit/src');

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...walk(full));
    } else if (s.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function hasSourceCounterpart(distFile) {
  // dist/foo/bar.js -> src/foo/bar.ts (or .tsx)
  const relPath = relative(DIST, distFile);
  const base = relPath.replace(/\.js$/, '');
  return (
    existsSync(join(SRC, `${base}.ts`)) ||
    existsSync(join(SRC, `${base}.tsx`))
  );
}

if (!existsSync(DIST)) {
  console.error(`No dist directory at ${DIST}. Run yarn build first.`);
  process.exit(1);
}

const orphans = walk(DIST)
  .filter((f) => f.endsWith('.js'))
  .filter((f) => !hasSourceCounterpart(f))
  .map((f) => relative(ROOT, f))
  .sort();

if (orphans.length > 0) {
  console.error('Orphan dist files with no matching src/ counterpart:');
  for (const o of orphans) console.error(`  ${o}`);
  console.error(`\n${orphans.length} orphan file(s) found.`);
  process.exit(1);
}

console.log('OK — every dist/**/*.js has a matching src/**/*.ts.');
