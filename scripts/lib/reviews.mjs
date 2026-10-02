// Google reviews for the Testimonials carousel.
//
// The daily sync pulls reviews from the Google Places API (New), saves them to
// data/reviews.json, and writes them into index.html between the
// <!-- reviews --> and <!-- /reviews --> markers. testimonials.js then turns
// that static markup into the flip-through deck. Keeping the reviews in the
// HTML means search engines see them and no API key ever reaches the browser.

export const PLACE_ID = 'ChIJEcT_FXeGswoRwDxK6p32LhM';
export const REVIEWS_URL = `https://search.google.com/local/reviews?placeid=${PLACE_ID}`;
export const WRITE_REVIEW_URL = `https://search.google.com/local/writereview?placeid=${PLACE_ID}`;
export const PLACES_ENDPOINT = `https://places.googleapis.com/v1/places/${PLACE_ID}?languageCode=en`;
export const FIELD_MASK = 'rating,userRatingCount,reviews,googleMapsUri';

export const MAX_CHARS = 230; // longer reviews are cut on a word and end with an ellipsis
export const MIN_RATING = 4; // only 4 and 5 star reviews go in the carousel
export const MAX_REVIEWS = 8;

const ELLIPSIS = '\u2026';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function cleanText(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/** Cuts text to max chars on a word boundary. Text Google already cut (ends in an ellipsis) counts as truncated. */
export function truncate(text, max = MAX_CHARS) {
  const t = cleanText(text);
  const already = /(\u2026|\.\.\.)$/.test(t);
  if (t.length <= max) {
    return { text: already ? t.replace(/\s*(\u2026|\.\.\.)$/, ELLIPSIS) : t, truncated: already };
  }
  let cut = t.slice(0, max);
  const space = cut.lastIndexOf(' ');
  if (space > max * 0.6) cut = cut.slice(0, space);
  cut = cut.replace(/[\s,;:.!?\-(]+$/, '');
  return { text: cut + ELLIPSIS, truncated: true };
}

export function initials(name) {
  const parts = cleanText(name).replace(/[^\p{L}\p{N}' ]/gu, ' ').split(' ').filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] || '');
  return (first + last).toUpperCase();
}

export function monthYear(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function starPercent(rating) {
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  return `${Math.round((r / 5) * 1000) / 10}%`;
}

function safeUrl(u) {
  return typeof u === 'string' && /^https:\/\//.test(u) ? u : null;
}

/** Places API (New) place response -> our stored shape. */
export function fromPlacesResponse(place, now = new Date()) {
  const reviews = (place.reviews || []).map((r) => ({
    author: cleanText(r.authorAttribution?.displayName) || 'Google user',
    authorUri: safeUrl(r.authorAttribution?.uri),
    photoUri: safeUrl(r.authorAttribution?.photoUri),
    rating: Number(r.rating) || 0,
    text: r.originalText?.text ?? r.text?.text ?? '',
    publishTime: r.publishTime || null,
    reviewUri: safeUrl(r.googleMapsUri),
  }));
  return {
    source: 'Google Places API (New), synced by scripts/sync-reviews.mjs',
    placeId: PLACE_ID,
    fetchedAt: now.toISOString(),
    rating: Number(place.rating) || 0,
    userRatingCount: Number(place.userRatingCount) || 0,
    reviews,
  };
}

/** Which reviews make the carousel: has text, 4+ stars, newest first. */
export function selectReviews(reviews, { minRating = MIN_RATING, max = MAX_REVIEWS } = {}) {
  return (reviews || [])
    .filter((r) => cleanText(r.text) && Number(r.rating) >= minRating)
    .sort((a, b) => String(b.publishTime || '').localeCompare(String(a.publishTime || '')))
    .slice(0, max);
}

function stars(rating, cls, label) {
  const aria = label ? ` role="img" aria-label="${escapeHtml(label)}"` : ' aria-hidden="true"';
  return `<span class="${cls}" style="--pct:${starPercent(rating)}"${aria}>\u2605\u2605\u2605\u2605\u2605</span>`;
}

function reviewCard(r) {
  const { text, truncated } = truncate(r.text);
  const name = escapeHtml(r.author);
  const nameHtml = r.authorUri
    ? `<a class="review-name" href="${escapeHtml(r.authorUri)}" target="_blank" rel="noopener">${name}</a>`
    : `<span class="review-name">${name}</span>`;
  const avatar = r.photoUri
    ? `<img class="review-avatar" src="${escapeHtml(r.photoUri)}" alt="" width="40" height="40" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="review-avatar" aria-hidden="true">${escapeHtml(initials(r.author))}</span>`;
  const date = monthYear(r.publishTime);
  const more = truncated
    ? `\n  <a class="review-more" href="${escapeHtml(r.reviewUri || REVIEWS_URL)}" target="_blank" rel="noopener">Read the full review on Google</a>`
    : '';
  return [
    '<figure class="review-card">',
    `  ${stars(r.rating, 'g-stars review-stars', `Rated ${r.rating} out of 5`)}`,
    `  <blockquote class="review-text"><p>${escapeHtml(text)}</p></blockquote>${more}`,
    '  <figcaption class="review-author">',
    `    ${avatar}`,
    `    <span class="review-who">${nameHtml}${date ? `<span class="review-date">${date}</span>` : ''}</span>`,
    '  </figcaption>',
    '</figure>',
  ].join('\n');
}

/** HTML that goes between the reviews markers. */
export function renderReviews(data) {
  const picked = selectReviews(data.reviews);
  const count = Number(data.userRatingCount) || 0;
  const rating = Number(data.rating) || 0;
  const lines = [];
  if (count > 0) {
    lines.push(
      `<a class="g-summary" href="${REVIEWS_URL}" target="_blank" rel="noopener" aria-label="Rated ${rating.toFixed(1)} out of 5 from ${count} Google review${count === 1 ? '' : 's'}">`,
      `  <span class="g-score">${rating.toFixed(1)}</span>`,
      `  ${stars(rating, 'g-stars')}`,
      `  <span class="g-count">${count} Google review${count === 1 ? '' : 's'}</span>`,
      '</a>',
    );
  }
  if (!picked.length) {
    lines.push(
      '<div class="review-empty">',
      `  <p>Worked with SBI? We would love to hear how it went.</p>`,
      '</div>',
    );
    return lines.join('\n');
  }
  lines.push('<div class="review-deck" data-review-deck aria-label="Google reviews of the Montgomery Small Business Initiative">');
  for (const r of picked) lines.push(...reviewCard(r).split('\n').map((l) => `  ${l}`));
  lines.push('</div>');
  return lines.join('\n');
}

/** Replaces everything between <!-- NAME --> and <!-- /NAME -->, keeping indent and line endings. */
export function replaceBetweenMarkers(html, name, body) {
  const eol = /\r\n/.test(html) ? '\r\n' : '\n';
  const re = new RegExp(`(^([ \\t]*)<!-- ${name} -->)[\\s\\S]*?(^[ \\t]*<!-- /${name} -->)`, 'm');
  if (!re.test(html)) throw new Error(`Markers <!-- ${name} --> ... <!-- /${name} --> not found in index.html`);
  return html.replace(re, (_all, open, indent, close) => {
    const inner = body ? body.split('\n').map((l) => (l ? indent + l : l)).join(eol) + eol : '';
    return open + eol + inner + close;
  });
}

export async function fetchPlace(apiKey, fetchImpl = fetch) {
  const res = await fetchImpl(PLACES_ENDPOINT, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELD_MASK },
  });
  const body = await res.text();
  if (!res.ok) {
    let msg = body;
    try { msg = JSON.parse(body).error?.message || body; } catch {}
    throw new Error(`Places API HTTP ${res.status}: ${msg}`);
  }
  return JSON.parse(body);
}
