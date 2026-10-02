#!/usr/bin/env node
// Pulls Google reviews for the SBI Business Profile and writes them into
// data/reviews.json and the Testimonials carousel in index.html.
//
//   GOOGLE_PLACES_API_KEY=... node scripts/sync-reviews.mjs   fetch from Google, then render
//   node scripts/sync-reviews.mjs                             no key: re-render from data/reviews.json
//   node scripts/sync-reviews.mjs --check                     exit 1 if index.html is out of date
//
// Env overrides for tests: REVIEWS_INDEX_FILE, REVIEWS_DATA_FILE, REVIEWS_PLACE_JSON (a saved API response).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchPlace, fromPlacesResponse, renderReviews, replaceBetweenMarkers } from './lib/reviews.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = process.env.REVIEWS_INDEX_FILE || path.join(root, 'index.html');
const dataPath = process.env.REVIEWS_DATA_FILE || path.join(root, 'data', 'reviews.json');
const checkOnly = process.argv.includes('--check');
const apiKey = (process.env.GOOGLE_PLACES_API_KEY || '').trim();

let data;
if (process.env.REVIEWS_PLACE_JSON) {
  data = fromPlacesResponse(JSON.parse(await readFile(process.env.REVIEWS_PLACE_JSON, 'utf8')));
} else if (apiKey && !checkOnly) {
  data = fromPlacesResponse(await fetchPlace(apiKey));
} else {
  if (!apiKey && !checkOnly) console.log('GOOGLE_PLACES_API_KEY is not set, so rendering the saved reviews in data/reviews.json.');
  data = JSON.parse(await readFile(dataPath, 'utf8'));
}

const fresh = !checkOnly && Boolean(apiKey || process.env.REVIEWS_PLACE_JSON);
if (fresh) {
  await writeFile(dataPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
console.log(`Google rating ${data.rating} from ${data.userRatingCount} reviews; ${data.reviews.length} with details.`);

const html = await readFile(indexPath, 'utf8');
const updated = replaceBetweenMarkers(html, 'reviews', renderReviews(data));
if (updated === html) {
  console.log('index.html reviews already up to date.');
} else if (checkOnly) {
  console.error('index.html reviews are out of date. Run: node scripts/sync-reviews.mjs');
  process.exit(1);
} else {
  await writeFile(indexPath, updated, 'utf8');
  console.log('index.html reviews updated.');
}
