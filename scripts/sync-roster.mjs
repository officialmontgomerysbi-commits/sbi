#!/usr/bin/env node
// Copies the names in the SBI Website Roster Google Doc into the static
// fallback lists in index.html (between the <!-- roster:... --> markers).
//
// The live site already reads the doc on every page load. This keeps the HTML
// itself current too, so search engines, no-JS visitors, and the fallback
// (if Google is ever unreachable) all show the right names.
//
// Usage:
//   node scripts/sync-roster.mjs                 fetch the doc and update index.html
//   node scripts/sync-roster.mjs --check         exit 1 if index.html is out of date
//   ROSTER_TEXT_FILE=roster.txt node scripts/... use a local text export instead
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = require(path.join(root, 'roster.js'));
const indexPath = process.env.ROSTER_INDEX_FILE || path.join(root, 'index.html');
const checkOnly = process.argv.includes('--check');

async function loadText() {
  if (process.env.ROSTER_TEXT_FILE) return readFile(process.env.ROSTER_TEXT_FILE, 'utf8');
  const res = await fetch(R.EXPORT_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Google Doc export returned HTTP ${res.status}. Is the doc still shared as "Anyone with the link"?`);
  return res.text();
}

const text = await loadText();
const data = R.parse(text);
if (!R.hasAnySection(data)) {
  console.error('No CURRENT CONSULTANTS / PAST CONSULTANTS / BUSINESSES headings found in the doc. Leaving index.html alone.');
  process.exit(1);
}
for (const key of ['current', 'past', 'businesses']) {
  if (!data.found[key]) console.warn(`Heading for "${key}" is missing from the doc, so that list was left as is.`);
}

const html = await readFile(indexPath, 'utf8');
const updated = R.injectStatic(html, data);
console.log(`Doc has ${data.current.length} current, ${data.past.length} past, ${data.businesses.length} businesses.`);

if (updated === html) {
  console.log('index.html already matches the doc.');
} else if (checkOnly) {
  console.error('index.html is out of date with the doc. Run: node scripts/sync-roster.mjs');
  process.exit(1);
} else {
  await writeFile(indexPath, updated, 'utf8');
  console.log('index.html updated from the doc.');
}
