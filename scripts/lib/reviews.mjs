// Google reviews for the Testimonials carousel.
//
// The daily sync pulls reviews from the Google Places API (New), saves them to
// data/reviews.json, and writes them into index.html between the
// <!-- reviews --> and <!-- /reviews --> markers. testimonials.js then turns
// that static markup into the flip-through deck. Keeping the reviews in the
// HTML means search engines see them and no API key ever reaches the browser.
//
// Hand-picked testimonials from outside Google (a Facebook post, a LinkedIn
// shout-out, an email we were allowed to quote) live in data/testimonials.json
// and are merged into the same deck. The Google sync never touches that file.

export const PLACE_ID = 'ChIJEcT_FXeGswoRwDxK6p32LhM';
export const REVIEWS_URL = `https://search.google.com/local/reviews?placeid=${PLACE_ID}`;
export const WRITE_REVIEW_URL = `https://search.google.com/local/writereview?placeid=${PLACE_ID}`;
export const PLACES_ENDPOINT = `https://places.googleapis.com/v1/places/${PLACE_ID}?languageCode=en`;
export const FIELD_MASK = 'rating,userRatingCount,reviews,googleMapsUri';

export const MAX_CHARS = 230; // longer reviews are cut on a word and end with an ellipsis
export const MIN_RATING = 4; // only 4 and 5 star reviews go in the carousel
export const MAX_REVIEWS = 8; // Google reviews only; hand-picked testimonials are always shown
export const TESTIMONIAL_MAX_CHARS = 420; // hand-picked quotes are already short, this is just a safety net

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

/** An https URL, or a root-relative path to a file in this repo (/img/testimonials/x.png). */
export function safeAsset(u) {
  if (typeof u !== 'string') return null;
  if (/^https:\/\//.test(u)) return u;
  return /^\/[\w-][\w\-./]*$/.test(u) && !u.includes('..') ? u : null;
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

// ── Hand-picked testimonials ──

const FACEBOOK_ICON = '<svg class="review-source-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.88v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>';
const QUOTE_ICON = '<svg class="review-source-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M10 11H6.2c.3-2 1.6-3.4 3.8-3.9V5c-3.9.5-6 3.3-6 7.4V19h6v-8zm10 0h-3.8c.3-2 1.6-3.4 3.8-3.9V5c-3.9.5-6 3.3-6 7.4V19h6v-8z"/></svg>';

/** Known sources get a proper label (and Facebook its icon); anything else shows as typed. */
export const SOURCES = {
  facebook: { label: 'Posted on Facebook', more: 'Read the full post on Facebook', icon: FACEBOOK_ICON },
  instagram: { label: 'Posted on Instagram', more: 'Read the full post on Instagram' },
  linkedin: { label: 'Posted on LinkedIn', more: 'Read the full post on LinkedIn' },
  x: { label: 'Posted on X', more: 'Read the full post on X' },
  email: { label: 'Sent to SBI by email', more: 'Read more' },
};

function sourceInfo(source) {
  const key = cleanText(source).toLowerCase();
  if (SOURCES[key]) return { icon: QUOTE_ICON, ...SOURCES[key] };
  return { label: cleanText(source), more: 'Read more', icon: QUOTE_ICON };
}

function isoDate(d) {
  if (typeof d !== 'string' || Number.isNaN(new Date(d).getTime())) return null;
  return d;
}

/** One entry of data/testimonials.json -> the shape the deck renders, or null if it is unusable. */
export function normalizeTestimonial(t) {
  if (!t || typeof t !== 'object') return null;
  const paragraphs = String(t.text ?? '').replace(/\r\n?/g, '\n').split(/\n+/).map(cleanText).filter(Boolean);
  const author = cleanText(t.author);
  if (!paragraphs.length || !author) return null;
  return {
    kind: 'testimonial',
    author,
    role: cleanText(t.role),
    authorUri: safeUrl(t.authorUrl),
    photoUri: safeAsset(t.photo),
    source: cleanText(t.source),
    sourceUri: safeUrl(t.url),
    paragraphs,
    publishTime: isoDate(t.date),
    pinned: t.pinned === true,
  };
}

/** Cuts a list of paragraphs to a total character budget, on a word. */
export function truncateParagraphs(paragraphs, max = TESTIMONIAL_MAX_CHARS) {
  const out = [];
  let left = max;
  for (const p of paragraphs) {
    if (p.length <= left) { out.push(p); left -= p.length; continue; }
    // Room left for a meaningful piece of this paragraph? Cut it. Otherwise end the previous one.
    if (left >= 40 || !out.length) out.push(truncate(p, Math.max(left, 40)).text);
    else out[out.length - 1] = out[out.length - 1].replace(/[\s,;:.!?\-(]+$/, '') + ELLIPSIS;
    return { paragraphs: out, truncated: true };
  }
  return { paragraphs: out, truncated: false };
}

const byNewest = (a, b) => String(b.publishTime || '').localeCompare(String(a.publishTime || ''));

/**
 * Everything the deck shows, in order: pinned testimonials first (newest first),
 * then every other testimonial and Google review mixed together, newest first.
 */
export function deckItems(data, testimonials = []) {
  const google = selectReviews(data?.reviews).map((r) => ({ ...r, kind: 'google' }));
  const quotes = (Array.isArray(testimonials) ? testimonials : []).map(normalizeTestimonial).filter(Boolean);
  const pinned = quotes.filter((t) => t.pinned).sort(byNewest);
  const rest = [...quotes.filter((t) => !t.pinned), ...google].sort(byNewest);
  return [...pinned, ...rest];
}

function stars(rating, cls, label) {
  const aria = label ? ` role="img" aria-label="${escapeHtml(label)}"` : ' aria-hidden="true"';
  return `<span class="${cls}" style="--pct:${starPercent(rating)}"${aria}>★★★★★</span>`;
}

function authorBlock({ author, authorUri, photoUri, sub, subHtml, logo }) {
  const name = escapeHtml(author);
  const nameHtml = authorUri
    ? `<a class="review-name" href="${escapeHtml(authorUri)}" target="_blank" rel="noopener">${name}</a>`
    : `<span class="review-name">${name}</span>`;
  const local = photoUri && photoUri.startsWith('/');
  const avatar = photoUri
    ? `<img class="review-avatar${logo ? ' review-avatar--logo' : ''}" src="${escapeHtml(photoUri)}" alt="" width="40" height="40" loading="lazy"${local ? '' : ' referrerpolicy="no-referrer"'}>`
    : `<span class="review-avatar" aria-hidden="true">${escapeHtml(initials(author))}</span>`;
  return [
    '  <figcaption class="review-author">',
    `    ${avatar}`,
    `    <span class="review-who">${nameHtml}${subHtml || sub ? `<span class="review-date">${subHtml || escapeHtml(sub)}</span>` : ''}</span>`,
    '  </figcaption>',
  ];
}

function reviewCard(r) {
  const { text, truncated } = truncate(r.text);
  const more = truncated
    ? `\n  <a class="review-more" href="${escapeHtml(r.reviewUri || REVIEWS_URL)}" target="_blank" rel="noopener">Read the full review on Google</a>`
    : '';
  return [
    '<figure class="review-card">',
    `  ${stars(r.rating, 'g-stars review-stars', `Rated ${r.rating} out of 5`)}`,
    `  <blockquote class="review-text"><p>${escapeHtml(text)}</p></blockquote>${more}`,
    ...authorBlock({ author: r.author, authorUri: r.authorUri, photoUri: r.photoUri, sub: monthYear(r.publishTime) }),
    '</figure>',
  ].join('\n');
}

function testimonialCard(t) {
  const src = sourceInfo(t.source);
  const { paragraphs, truncated } = truncateParagraphs(t.paragraphs);
  const badgeInner = `${src.icon}<span>${escapeHtml(src.label || 'Testimonial')}</span>`;
  const badge = t.sourceUri
    ? `<a class="review-source" href="${escapeHtml(t.sourceUri)}" target="_blank" rel="noopener">${badgeInner}</a>`
    : `<span class="review-source">${badgeInner}</span>`;
  const cite = t.sourceUri ? ` cite="${escapeHtml(t.sourceUri)}"` : '';
  const more = truncated && t.sourceUri
    ? `\n  <a class="review-more" href="${escapeHtml(t.sourceUri)}" target="_blank" rel="noopener">${escapeHtml(src.more)}</a>`
    : '';
  // Role, then the date kept whole so a narrow card never strands the dot at a line end.
  const when = monthYear(t.publishTime);
  const subHtml = t.role && when
    ? `${escapeHtml(t.role)} <span class="review-when">\u00b7 ${when}</span>`
    : escapeHtml(t.role || when);
  return [
    '<figure class="review-card review-card--quote">',
    `  ${badge}`,
    `  <blockquote class="review-text"${cite}>${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}</blockquote>${more}`,
    ...authorBlock({ author: t.author, authorUri: t.authorUri, photoUri: t.photoUri, subHtml, logo: Boolean(t.photoUri) }),
    '</figure>',
  ].join('\n');
}

/** HTML that goes between the reviews markers: the Google summary, then every card. */
export function renderReviews(data, testimonials = []) {
  const items = deckItems(data, testimonials);
  const count = Number(data?.userRatingCount) || 0;
  const rating = Number(data?.rating) || 0;
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
  if (!items.length) {
    lines.push(
      '<div class="review-empty">',
      `  <p>Worked with SBI? We would love to hear how it went.</p>`,
      '</div>',
    );
    return lines.join('\n');
  }
  const hasQuotes = items.some((i) => i.kind === 'testimonial');
  const label = hasQuotes
    ? 'Reviews and testimonials for the Montgomery Small Business Initiative'
    : 'Google reviews of the Montgomery Small Business Initiative';
  lines.push(`<div class="review-deck" data-review-deck aria-label="${label}">`);
  for (const item of items) {
    const card = item.kind === 'testimonial' ? testimonialCard(item) : reviewCard(item);
    lines.push(...card.split('\n').map((l) => `  ${l}`));
  }
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
