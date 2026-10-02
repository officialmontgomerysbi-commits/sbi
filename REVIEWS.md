# Recognition section (Testimonials + Featured In)

## Testimonials: Google reviews

The Testimonials card shows reviews from SBI's Google Business Profile as a flip-through deck.

- **Data:** `data/reviews.json` holds the rating, review count, and reviews.
- **Page:** `scripts/sync-reviews.mjs` writes them into `index.html` between `<!-- reviews -->` and `<!-- /reviews -->`, so they load instantly and Google search can read them.
- **Carousel:** `testimonials.js` turns that markup into the stacked deck: arrows, dots, swipe, arrow keys, click the card peeking behind, and a 7 second autoplay that pauses on hover and stops after any click. No autoplay for people with reduced motion turned on. Without JavaScript, the reviews show as a plain list.
- **Rules:** only 4 and 5 star reviews that have written text, newest first, max 8. The rating and count at the top are Google's real numbers, including every review. Text longer than 230 characters is cut on a word with an ellipsis and a "Read the full review on Google" link.
- **Updates:** the daily GitHub workflow pulls fresh reviews from the Google Places API and commits only if something changed.

Profile: Place ID `ChIJEcT_FXeGswoRwDxK6p32LhM`
- All reviews: https://search.google.com/local/reviews?placeid=ChIJEcT_FXeGswoRwDxK6p32LhM
- Leave a review (also the button on the site): https://search.google.com/local/writereview?placeid=ChIJEcT_FXeGswoRwDxK6p32LhM

### Turning on automatic review updates (one time, about 10 minutes)

Until this is done, the site shows the 3 reviews saved on Oct 2, 2026. Google cut off two of them, so they end with "Read the full review on Google".

1. Go to https://console.cloud.google.com/ and sign in as **officialmontgomerysbi@gmail.com**.
2. Create a project named `montgomerysbi-site` (top bar project picker, then **New Project**).
3. Open **Billing** and link a billing account. Google requires one for the Places API. This job makes about 30 calls a month, far under the free monthly allowance, so it should cost $0.
4. Go to **APIs & Services > Library**, search **Places API (New)**, click **Enable**.
5. Go to **APIs & Services > Credentials > Create credentials > API key**. Copy the key.
6. Click the new key, then under **API restrictions** choose **Restrict key** and tick only **Places API (New)**. Save.
7. On GitHub open the repo, then **Settings > Secrets and variables > Actions > New repository secret**.
   Name: `GOOGLE_PLACES_API_KEY`. Value: the key. Save.
8. Go to the **Actions** tab, open **Sync site data (roster + Google reviews)**, click **Run workflow**. In a minute it commits the full review text with exact dates.

The key only ever lives in GitHub's secret store and Google Cloud. It is never in the site code or the browser.

Note: Google's API returns at most 5 reviews per pull, so the deck shows up to the 5 Google picks as most relevant.

### Commands

```bash
node scripts/sync-reviews.mjs                       # re-render index.html from data/reviews.json
GOOGLE_PLACES_API_KEY=... node scripts/sync-reviews.mjs   # pull from Google, then render
node scripts/sync-reviews.mjs --check               # exit 1 if index.html is out of date
node scripts/sync-site.mjs                          # roster + reviews, what the workflow runs
```

To hand-edit reviews (for example before the key is set up), edit `data/reviews.json` and run `node scripts/sync-reviews.mjs`.

## Featured In: press

Two article cards in `index.html` (search for `press-card`). Each has the outlet, headline, date, and the article's own lead photo. If a news site ever breaks its image, the card shows a green panel with the outlet name instead.

| Outlet | Headline | Date |
|---|---|---|
| Headline News Montgomery | Student-Run Montgomery Small Business Initiative Connects Young Consultants With Local Businesses | Sep 14, 2026 |
| The Montgomery News | MHS Students Bring Free, Real-World Consulting to Montgomery's Small Businesses | Aug 26, 2026 |

To add another article: copy a `<a class="press-card">` block, change the link, image, outlet, title, and date, and add a matching `NewsArticle` entry to `subjectOf` in the JSON-LD at the top of `index.html` (that tells Google about the coverage). With 3 or more articles, the grid wraps automatically.
