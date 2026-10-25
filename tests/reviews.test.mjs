// Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import * as L from '../scripts/lib/reviews.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
const ELL = '\u2026';

// Shape of a real Places API (New) place details response.
const placeResponse = {
  rating: 4.8,
  userRatingCount: 12,
  googleMapsUri: 'https://maps.google.com/?cid=1382313293750353088',
  reviews: [
    {
      rating: 5, publishTime: '2026-09-01T12:00:00Z', relativePublishTimeDescription: 'a month ago',
      text: { text: 'Translated text', languageCode: 'en' },
      originalText: { text: 'Great   team,\n very prepared.', languageCode: 'en' },
      authorAttribution: { displayName: 'Mark Manto', uri: 'https://www.google.com/maps/contrib/1', photoUri: 'https://lh3.googleusercontent.com/a/x' },
      googleMapsUri: 'https://www.google.com/maps/reviews/data=abc',
    },
    {
      rating: 2, publishTime: '2026-09-20T12:00:00Z',
      text: { text: 'Not for me.' }, authorAttribution: { displayName: 'Low Star' },
    },
    {
      rating: 5, publishTime: '2026-09-25T12:00:00Z',
      text: { text: 'x'.repeat(50) + ' ' + 'word '.repeat(80) }, authorAttribution: { displayName: 'Long Writer', uri: 'javascript:alert(1)' },
    },
    { rating: 5, publishTime: '2026-09-28T12:00:00Z', text: { text: '   ' }, authorAttribution: { displayName: 'Stars Only' } },
  ],
};

test('Places API response maps to our stored shape', () => {
  const d = L.fromPlacesResponse(placeResponse, new Date('2026-10-03T10:00:00Z'));
  assert.equal(d.rating, 4.8);
  assert.equal(d.userRatingCount, 12);
  assert.equal(d.placeId, L.PLACE_ID);
  assert.equal(d.fetchedAt, '2026-10-03T10:00:00.000Z');
  assert.equal(d.reviews[0].text, 'Great   team,\n very prepared.', 'prefers original language text');
  assert.equal(d.reviews[0].authorUri, 'https://www.google.com/maps/contrib/1');
  assert.equal(d.reviews[2].authorUri, null, 'non-https links are dropped');
});

test('carousel takes 4+ star reviews with text, newest first', () => {
  const d = L.fromPlacesResponse(placeResponse);
  assert.deepEqual(L.selectReviews(d.reviews).map((r) => r.author), ['Long Writer', 'Mark Manto']);
});

test('truncate cuts on a word and adds an ellipsis', () => {
  const long = 'word '.repeat(100);
  const t = L.truncate(long, 50);
  assert.equal(t.truncated, true);
  assert.ok(t.text.endsWith(ELL));
  assert.ok(t.text.length <= 51);
  assert.ok(!/\sw$|wor\u2026$/.test(t.text), 'no half words');
  assert.deepEqual(L.truncate('Short and sweet.'), { text: 'Short and sweet.', truncated: false });
  assert.deepEqual(L.truncate('Cut by Google ...'), { text: 'Cut by Google' + ELL, truncated: true });
  assert.deepEqual(L.truncate('Cut by Google \u2026'), { text: 'Cut by Google' + ELL, truncated: true });
});

test('helpers: initials, month/year, star fill', () => {
  assert.equal(L.initials("Bill D'Arienzo"), 'BD');
  assert.equal(L.initials('Cher'), 'CH');
  assert.equal(L.initials('Ana Maria de la Cruz'), 'AC');
  assert.equal(L.initials(''), '?');
  assert.equal(L.monthYear('2026-09-26T00:00:00Z'), 'September 2026');
  assert.equal(L.monthYear('nope'), '');
  assert.equal(L.starPercent(5), '100%');
  assert.equal(L.starPercent(4.8), '96%');
  assert.equal(L.starPercent(9), '100%');
});

test('render: summary, cards, links, photo, escaping', () => {
  const d = L.fromPlacesResponse(placeResponse);
  d.reviews[0].author = '<b>Mark</b>';
  const html = L.renderReviews(d);
  assert.match(html, /<span class="g-score">4\.8<\/span>/);
  assert.match(html, /12 Google reviews/);
  assert.match(html, /--pct:96%/);
  assert.equal((html.match(/class="review-card"/g) || []).length, 2);
  assert.ok(html.includes('&lt;b&gt;Mark&lt;/b&gt;'), 'names are escaped');
  assert.ok(html.includes('src="https://lh3.googleusercontent.com/a/x"'), 'author photo used when present');
  assert.ok(html.includes('href="https://www.google.com/maps/contrib/1"'), 'author linked to their Google profile');
  assert.ok(html.includes('Read the full review on Google'), 'truncated review links out');
  assert.ok(!html.includes('javascript:'), 'unsafe links never rendered');
  assert.ok(html.includes('September 2026'));
});

test('render: one review and zero reviews', () => {
  const one = L.renderReviews({ rating: 5, userRatingCount: 1, reviews: [{ author: 'A B', rating: 5, text: 'Nice', publishTime: '2026-01-02T00:00:00Z' }] });
  assert.match(one, /1 Google review</);
  const none = L.renderReviews({ rating: 0, userRatingCount: 0, reviews: [] });
  assert.ok(!none.includes('g-summary'));
  assert.ok(none.includes('review-empty'));
});

test('replaceBetweenMarkers keeps indent, line endings, and is idempotent', () => {
  const lf = 'a\n    <!-- reviews -->\n    old\n    <!-- /reviews -->\nb';
  const out = L.replaceBetweenMarkers(lf, 'reviews', 'x\n  y');
  assert.equal(out, 'a\n    <!-- reviews -->\n    x\n      y\n    <!-- /reviews -->\nb');
  assert.equal(L.replaceBetweenMarkers(out, 'reviews', 'x\n  y'), out);
  const crlf = lf.replace(/\n/g, '\r\n');
  assert.ok(!/[^\r]\n/.test(L.replaceBetweenMarkers(crlf, 'reviews', 'x\ny')));
  assert.throws(() => L.replaceBetweenMarkers('no markers', 'reviews', 'x'), /not found/);
});

const readJson = async (...p) => JSON.parse(await readFile(path.join(root, ...p), 'utf8'));

test('index.html matches data/reviews.json + data/testimonials.json (sync is a no-op)', async () => {
  const data = await readJson('data', 'reviews.json');
  const { testimonials } = await readJson('data', 'testimonials.json');
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.equal(L.replaceBetweenMarkers(html, 'reviews', L.renderReviews(data, testimonials)), html);
});

// ── Hand-picked testimonials ──

const quote = (over = {}) => ({
  author: 'Shop Local Montgomery',
  role: 'Montgomery Business Association',
  authorUrl: 'https://www.facebook.com/shoplocalmontgomery',
  photo: '/img/testimonials/shop-local-montgomery.png',
  source: 'facebook',
  url: 'https://www.facebook.com/shoplocalmontgomery/posts/abc',
  date: '2026-08-31',
  text: 'Congratulations!\nGreat to see students in our business community.',
  ...over,
});

test('normalizeTestimonial keeps good entries and drops unusable or unsafe parts', () => {
  const t = L.normalizeTestimonial(quote());
  assert.equal(t.kind, 'testimonial');
  assert.deepEqual(t.paragraphs, ['Congratulations!', 'Great to see students in our business community.']);
  assert.equal(t.photoUri, '/img/testimonials/shop-local-montgomery.png');
  assert.equal(t.publishTime, '2026-08-31');
  assert.equal(t.pinned, false);
  assert.equal(L.normalizeTestimonial(quote({ pinned: true })).pinned, true);
  assert.equal(L.normalizeTestimonial(quote({ pinned: 'yes' })).pinned, false, 'only a real true pins');
  assert.equal(L.normalizeTestimonial(quote({ text: '  \n ' })), null, 'needs text');
  assert.equal(L.normalizeTestimonial(quote({ author: '' })), null, 'needs an author');
  assert.equal(L.normalizeTestimonial(null), null);
  const bad = L.normalizeTestimonial(quote({ url: 'javascript:alert(1)', authorUrl: 'http://x.com', photo: '//evil.com/a.png', date: 'soon' }));
  assert.equal(bad.sourceUri, null);
  assert.equal(bad.authorUri, null);
  assert.equal(bad.photoUri, null);
  assert.equal(bad.publishTime, null);
  assert.equal(L.safeAsset('/img/../secret.png'), null);
  assert.equal(L.safeAsset('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png');
});

test('deck order: pinned testimonials first, then everything else newest first', () => {
  const data = L.fromPlacesResponse(placeResponse); // Google: Long Writer 09-25, Mark Manto 09-01
  const items = L.deckItems(data, [
    quote({ author: 'Old Pin', date: '2026-01-01', pinned: true }),
    quote({ author: 'Mid Quote', date: '2026-09-10' }),
    quote({ author: 'New Pin', date: '2026-08-01', pinned: true }),
    { author: 'Broken' },
  ]);
  assert.deepEqual(items.map((i) => i.author), ['New Pin', 'Old Pin', 'Long Writer', 'Mid Quote', 'Mark Manto']);
});

test('render: testimonial card has a source line instead of stars, paragraphs, logo, role and date', () => {
  const html = L.renderReviews({ rating: 5, userRatingCount: 3, reviews: [] }, [quote({ author: '<i>Shop</i>' })]);
  assert.match(html, /3 Google reviews/, 'summary still counts Google reviews only');
  assert.equal((html.match(/class="review-card review-card--quote"/g) || []).length, 1);
  assert.ok(!/review-card--quote">\s*<span class="g-stars/.test(html), 'no stars on a testimonial');
  assert.ok(html.includes('<span>Posted on Facebook</span>'));
  assert.ok(html.includes('fill="#1877F2"'), 'Facebook icon');
  assert.ok(html.includes('class="review-source" href="https://www.facebook.com/shoplocalmontgomery/posts/abc"'));
  assert.ok(html.includes('cite="https://www.facebook.com/shoplocalmontgomery/posts/abc"'));
  assert.ok(html.includes('<p>Congratulations!</p><p>Great to see students in our business community.</p>'));
  assert.ok(html.includes('src="/img/testimonials/shop-local-montgomery.png"'));
  assert.ok(!html.includes('referrerpolicy'), 'local images need no referrer policy');
  assert.ok(html.includes('Montgomery Business Association <span class="review-when">\u00b7 August 2026</span>'));
  assert.ok(html.includes('&lt;i&gt;Shop&lt;/i&gt;'), 'names are escaped');
  assert.ok(html.includes('aria-label="Reviews and testimonials for the Montgomery Small Business Initiative"'));
  assert.ok(!html.includes('review-empty'));
});

test('render: testimonials alone (no Google reviews yet) still make a deck', () => {
  const html = L.renderReviews({ rating: 0, userRatingCount: 0, reviews: [] }, [quote({ source: 'Chamber newsletter', url: null, photo: null })]);
  assert.ok(!html.includes('g-summary'));
  assert.ok(html.includes('data-review-deck'));
  assert.ok(html.includes('<span class="review-source">'), 'no link when there is no url');
  assert.ok(html.includes('<span>Chamber newsletter</span>'), 'unknown sources show as typed');
  assert.ok(html.includes('aria-hidden="true">SM</span>'), 'initials when there is no photo');
});

test('long testimonials are cut on a word and link to the full post', () => {
  const long = L.truncateParagraphs(['a'.repeat(30), 'word '.repeat(200)], 120);
  assert.equal(long.truncated, true);
  assert.equal(long.paragraphs.length, 2);
  assert.ok(long.paragraphs[1].endsWith(ELL));
  assert.ok(long.paragraphs.join('').length <= 122);
  const tight = L.truncateParagraphs(['b'.repeat(100), 'c'.repeat(100)], 110);
  assert.deepEqual(tight, { paragraphs: ['b'.repeat(100) + ELL], truncated: true }, 'too little room left: end the previous paragraph');
  assert.deepEqual(L.truncateParagraphs(['short']), { paragraphs: ['short'], truncated: false });
  const html = L.renderReviews({ reviews: [] }, [quote({ text: 'word '.repeat(200) })]);
  assert.ok(html.includes('>Read the full post on Facebook</a>'));
});

test('data/testimonials.json is valid and every photo exists in the repo', async () => {
  const { testimonials } = await readJson('data', 'testimonials.json');
  assert.ok(Array.isArray(testimonials) && testimonials.length >= 1);
  for (const t of testimonials) {
    const n = L.normalizeTestimonial(t);
    assert.ok(n, `usable: ${t.author}`);
    assert.ok(n.publishTime, `${t.author} has a valid date`);
    if (t.photo) {
      assert.equal(n.photoUri, t.photo, `${t.author} photo path is allowed`);
      if (t.photo.startsWith('/')) await readFile(path.join(root, t.photo)); // throws if missing
    }
    if (t.url) assert.equal(n.sourceUri, t.url, `${t.author} link is https`);
    assert.ok(!/[?&](notif_id|ref|__cft__|__tn__)=/.test(t.url || ''), 'tracking params stripped from links');
  }
});

test('fetchPlace sends key + field mask and surfaces API errors', async () => {
  let seen;
  const ok = async (url, opts) => { seen = { url, opts }; return new Response(JSON.stringify(placeResponse)); };
  const place = await L.fetchPlace('KEY123', ok);
  assert.equal(place.rating, 4.8);
  assert.equal(seen.url, L.PLACES_ENDPOINT);
  assert.equal(seen.opts.headers['X-Goog-Api-Key'], 'KEY123');
  assert.equal(seen.opts.headers['X-Goog-FieldMask'], L.FIELD_MASK);
  const bad = async () => new Response(JSON.stringify({ error: { message: 'API key not valid.' } }), { status: 400 });
  await assert.rejects(L.fetchPlace('nope', bad), /HTTP 400: API key not valid/);
});

test('sync-reviews end to end on temp copies (API response -> json + html, then --check)', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reviews-'));
  const env = {
    ...process.env,
    REVIEWS_INDEX_FILE: path.join(dir, 'index.html'),
    REVIEWS_DATA_FILE: path.join(dir, 'reviews.json'),
    REVIEWS_PLACE_JSON: path.join(dir, 'place.json'),
  };
  await copyFile(path.join(root, 'index.html'), env.REVIEWS_INDEX_FILE);
  await copyFile(path.join(root, 'data', 'reviews.json'), env.REVIEWS_DATA_FILE);
  await writeFile(env.REVIEWS_PLACE_JSON, JSON.stringify(placeResponse));
  const testimonialsBefore = await readFile(path.join(root, 'data', 'testimonials.json'), 'utf8');
  const script = path.join(root, 'scripts', 'sync-reviews.mjs');

  const { stdout } = await run(process.execPath, [script], { env });
  assert.match(stdout, /updated/);
  const html = await readFile(env.REVIEWS_INDEX_FILE, 'utf8');
  assert.ok(html.includes('Long Writer') && html.includes('12 Google reviews'));
  assert.ok(html.includes('Shop Local Montgomery'), 'a Google pull keeps the hand-picked testimonials');
  assert.equal(await readFile(path.join(root, 'data', 'testimonials.json'), 'utf8'), testimonialsBefore, 'testimonials file untouched');
  const saved = JSON.parse(await readFile(env.REVIEWS_DATA_FILE, 'utf8'));
  assert.equal(saved.userRatingCount, 12);

  const checkEnv = { ...env };
  delete checkEnv.REVIEWS_PLACE_JSON;
  await run(process.execPath, [script, '--check'], { env: checkEnv });
});

test('sync-reviews without a key re-renders from the saved json and changes nothing', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reviews-'));
  const env = { ...process.env, GOOGLE_PLACES_API_KEY: '', REVIEWS_INDEX_FILE: path.join(dir, 'index.html') };
  await copyFile(path.join(root, 'index.html'), env.REVIEWS_INDEX_FILE);
  const before = await readFile(path.join(root, 'data', 'reviews.json'), 'utf8');
  const { stdout } = await run(process.execPath, [path.join(root, 'scripts', 'sync-reviews.mjs')], { env });
  assert.match(stdout, /not set/);
  assert.match(stdout, /already up to date/);
  assert.equal(await readFile(path.join(root, 'data', 'reviews.json'), 'utf8'), before);
});

test('sync-reviews: missing testimonials file means none, a broken one fails loudly', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reviews-'));
  const env = { ...process.env, GOOGLE_PLACES_API_KEY: '', REVIEWS_INDEX_FILE: path.join(dir, 'index.html'), REVIEWS_TESTIMONIALS_FILE: path.join(dir, 'nope.json') };
  await copyFile(path.join(root, 'index.html'), env.REVIEWS_INDEX_FILE);
  const script = path.join(root, 'scripts', 'sync-reviews.mjs');
  const { stdout } = await run(process.execPath, [script], { env });
  assert.match(stdout, /0 hand-picked/);
  assert.ok(!(await readFile(env.REVIEWS_INDEX_FILE, 'utf8')).includes('review-card--quote'));
  await writeFile(env.REVIEWS_TESTIMONIALS_FILE, '{ not json');
  await assert.rejects(run(process.execPath, [script], { env }), /could not be read/);
});

test('testimonials.js and the page wiring are in place', async () => {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('<script src="/testimonials.js" defer></script>'));
  assert.ok(html.includes('data-review-deck'));
  assert.ok(!html.includes('class="coming-soon"'), 'no Coming Soon placeholders left');
  assert.equal((html.match(/class="press-card"/g) || []).length, 2);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@graph'][0].subjectOf.length, 2);
});

test('off-screen review cards are clipped so the page never scrolls sideways', async () => {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('.testimonials-block { overflow: hidden; }'));
});
