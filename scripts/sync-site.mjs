#!/usr/bin/env node
// Runs every site data sync in order. The GitHub workflow only calls this
// file, so adding a new sync later means editing this list, not the workflow.
// One failing sync does not stop the others; the run still exits 1 at the end.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const jobs = [
  ['Roster (Google Doc)', 'sync-roster.mjs'],
  ['Google reviews', 'sync-reviews.mjs'],
];

let failed = 0;
for (const [label, file] of jobs) {
  console.log(`\n== ${label} ==`);
  const r = spawnSync(process.execPath, [path.join(here, file), ...process.argv.slice(2)], { stdio: 'inherit' });
  if (r.status !== 0) {
    failed++;
    console.log(`::error title=${label} sync failed::scripts/${file} exited with ${r.status}. Other syncs still ran.`);
  }
}
process.exit(failed ? 1 : 0);
