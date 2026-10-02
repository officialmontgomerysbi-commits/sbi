// Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = require(path.join(root, 'roster.js'));
const fixture = path.join(root, 'tests', 'fixtures-doc-export.txt');
// Google's export uses CRLF; normalise so the tests behave the same on any checkout.
const readFixture = async () => (await readFile(fixture, 'utf8')).replace(/\r?\n/g, '\r\n');
const run = promisify(execFile);

test('parses the real Google Doc export format (CRLF, instructions on top)', async () => {
  const data = R.parse(await readFixture());
  assert.deepEqual(data.found, { current: true, past: true, businesses: true });
  assert.equal(data.current.length, 9);
  assert.equal(data.current[0], 'Daniel Jing');
  assert.equal(data.current[8], 'Tarosh Vatti');
  assert.deepEqual(data.past, ['Vihaan Vatsa', 'Siddarth Goyal', 'Janesh Sanjai']);
  assert.equal(data.businesses.length, 9);
  assert.deepEqual(data.businesses[0], { name: 'Code Ninjas Bridgewater', initials: 'CB' });
  assert.ok(!data.current.some((n) => /Rules|montgomerysbi/.test(n)), 'instruction text must not leak in');
});

test('the current index.html already matches the doc (sync is a no-op)', async () => {
  const data = R.parse(await readFixture());
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.equal(R.injectStatic(html, data), html);
});

test('everything above the first heading is ignored', () => {
  const data = R.parse('Daniel Jing\nSome notes\nCURRENT CONSULTANTS\nAva Lee');
  assert.deepEqual(data.current, ['Ava Lee']);
});

test('headings are forgiving about case, colons, spacing and bullets', () => {
  const text = [
    '  current consultants:  ', 'A One',
    '* Past Consultants', 'B Two',
    'Businesses -', 'C Three',
  ].join('\n');
  const data = R.parse(text);
  assert.deepEqual(data.current, ['A One']);
  assert.deepEqual(data.past, ['B Two']);
  assert.deepEqual(data.businesses.map((b) => b.name), ['C Three']);
});

test('heading aliases', () => {
  for (const [h, key] of [['Former Consultants', 'past'], ['Alumni', 'past'], ['Client Businesses', 'businesses'], ['Clients', 'businesses'], ['Current Consultant', 'current']]) {
    assert.equal(R.headingKey(h), key, h);
  }
  assert.equal(R.headingKey('Current consultants are listed below'), null);
});

test('bullets, numbering, BOM, non-breaking spaces and extra spaces are cleaned', () => {
  const text = '\uFEFFCURRENT CONSULTANTS\n* Ava  Lee\n\u2022 Ben Cho\n- Cal Dee\n1. Dan Eve\n2) Eli Fox\n\u00A0Gus\u00A0Hu \n\t';
  assert.deepEqual(R.parse(text).current, ['Ava Lee', 'Ben Cho', 'Cal Dee', 'Dan Eve', 'Eli Fox', 'Gus Hu']);
});

test('blank lines, # notes and // notes are skipped', () => {
  const text = 'CURRENT CONSULTANTS\n\n# starts in January\nAva Lee\n// todo\n\nBen Cho';
  assert.deepEqual(R.parse(text).current, ['Ava Lee', 'Ben Cho']);
});

test('duplicates are removed per section (case-insensitive), order kept', () => {
  const data = R.parse('CURRENT CONSULTANTS\nAva Lee\nBen Cho\nava lee\nPAST CONSULTANTS\nAva Lee');
  assert.deepEqual(data.current, ['Ava Lee', 'Ben Cho']);
  assert.deepEqual(data.past, ['Ava Lee']);
});

test('text after | on a consultant line is a private note', () => {
  assert.deepEqual(R.parse('CURRENT CONSULTANTS\nAva Lee | joined fall 2026').current, ['Ava Lee']);
});

test('business icon override and fallback', () => {
  const data = R.parse('BUSINESSES\nCode Ninjas Bridgewater | cb\nAcme Co | not letters\nPlain Name LLC');
  assert.deepEqual(data.businesses, [
    { name: 'Code Ninjas Bridgewater', initials: 'CB' },
    { name: 'Acme Co', initials: 'AC' },
    { name: 'Plain Name LLC', initials: 'PN' },
  ]);
});

test('auto initials match the icons the site already used', () => {
  const expected = {
    TheeGroovement: 'TG', 'Expreseo Digital Marketing': 'ED', 'WDA Strategic Marketing': 'WD',
    'Go To College': 'GC', 'Princeton Record Exchange': 'PR', 'All The Way Up HVAC': 'AW',
    'Lana Health and Wellness': 'LH', 'Montgomery Dental Loft': 'MD',
    'Montgomery Business Association & Regional Chamber of Commerce': 'MB',
    "Joe's Pizza": 'JP', Bob: 'BO', '': '?',
  };
  for (const [name, ini] of Object.entries(expected)) assert.equal(R.initialsFor(name), ini, name);
});

test('lines too long to be a name are skipped and reported', () => {
  const long = 'x'.repeat(200);
  const data = R.parse('CURRENT CONSULTANTS\nAva Lee\n' + long);
  assert.deepEqual(data.current, ['Ava Lee']);
  assert.deepEqual(data.skipped, [long]);
});

test('no headings at all means the doc is broken, not empty', () => {
  const data = R.parse('someone renamed everything\nAva Lee');
  assert.equal(R.hasAnySection(data), false);
  assert.equal(R.hasAnySection(R.parse('PAST CONSULTANTS')), true);
});

test('HTML in names is escaped', () => {
  const data = R.parse('CURRENT CONSULTANTS\n<img src=x onerror=alert(1)>\nBUSINESSES\nA & B "Co" | AB');
  assert.equal(R.renderSection('current', data, ''), '<div class="consultant-name">&lt;img src=x onerror=alert(1)&gt;</div>');
  assert.equal(R.renderSection('businesses', data, ''), '<div class="partner-item"><div class="partner-icon">AB</div>A &amp; B &quot;Co&quot;</div>');
});

test('past consultants render with the faded style', () => {
  const data = R.parse('PAST CONSULTANTS\nAva Lee');
  assert.equal(R.renderSection('past', data, ''), '<div class="consultant-name past">Ava Lee</div>');
});

test('injectStatic moves a person from current to past', async () => {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const text = (await readFixture())
    .replace('Daniel Jing\r\n', '')
    .replace('PAST CONSULTANTS\r\n', 'PAST CONSULTANTS\r\nDaniel Jing\r\n');
  const out = R.injectStatic(html, R.parse(text));
  assert.ok(out.includes('<div class="consultant-name past">Daniel Jing</div>'));
  assert.ok(!out.includes('<div class="consultant-name">Daniel Jing</div>'));
  assert.equal(out.match(/<!-- roster:current -->/g).length, 1, 'markers survive');
});

test('injectStatic leaves a section alone when its heading is missing', async () => {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const out = R.injectStatic(html, R.parse('CURRENT CONSULTANTS\nOnly Person'));
  assert.ok(out.includes('<div class="consultant-name">Only Person</div>'));
  assert.ok(out.includes('<div class="consultant-name past">Vihaan Vatsa</div>'));
  assert.ok(out.includes('Code Ninjas Bridgewater'));
});

test('injectStatic handles an empty section and stays idempotent', async () => {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const data = R.parse('PAST CONSULTANTS\n');
  const once = R.injectStatic(html, data);
  assert.match(once, /<!-- roster:past -->\n\s*<!-- \/roster:past -->/);
  assert.equal(R.injectStatic(once, data), once);
});

test('injectStatic keeps CRLF files CRLF and stays a no-op when in sync', async () => {
  const data = R.parse(await readFixture());
  const crlf = (await readFile(path.join(root, 'index.html'), 'utf8')).replace(/\r?\n/g, '\r\n');
  assert.equal(R.injectStatic(crlf, data), crlf);
  const moved = R.injectStatic(crlf, R.parse('PAST CONSULTANTS\nNew Person'));
  assert.ok(moved.includes('<div class="consultant-name past">New Person</div>\r\n'));
  assert.ok(!/[^\r]\n/.test(moved), 'no bare LF introduced');
});

test('sync script end to end on a temp copy (update, then --check)', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'roster-'));
  const tmpIndex = path.join(dir, 'index.html');
  const tmpText = path.join(dir, 'doc.txt');
  await copyFile(path.join(root, 'index.html'), tmpIndex);
  await writeFile(tmpText, (await readFixture()).replace('Ethan Fang', 'Ethan Fang\r\nNew Person'));
  const env = { ...process.env, ROSTER_INDEX_FILE: tmpIndex, ROSTER_TEXT_FILE: tmpText };
  const script = path.join(root, 'scripts', 'sync-roster.mjs');

  await assert.rejects(run(process.execPath, [script, '--check'], { env }), 'check fails while out of date');
  const { stdout } = await run(process.execPath, [script], { env });
  assert.match(stdout, /updated/);
  assert.ok((await readFile(tmpIndex, 'utf8')).includes('<div class="consultant-name">New Person</div>'));
  await run(process.execPath, [script, '--check'], { env });
});

test('sync script refuses a doc with no headings', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'roster-'));
  const tmpIndex = path.join(dir, 'index.html');
  const tmpText = path.join(dir, 'doc.txt');
  await copyFile(path.join(root, 'index.html'), tmpIndex);
  await writeFile(tmpText, 'oops everything got deleted');
  const env = { ...process.env, ROSTER_INDEX_FILE: tmpIndex, ROSTER_TEXT_FILE: tmpText };
  await assert.rejects(run(process.execPath, [path.join(root, 'scripts', 'sync-roster.mjs')], { env }));
  assert.equal(await readFile(tmpIndex, 'utf8'), await readFile(path.join(root, 'index.html'), 'utf8'));
});
