# Website roster (consultants + businesses)

The **Consultants** and **Client Businesses** lists on montgomerysbi.com come from one Google Doc:

**SBI Website Roster**: https://docs.google.com/document/d/1YpXXvPi9XdUW69mYfHGx7FspiMNUqNeajFPH47K76W0/edit

Owned by officialmontgomerysbi@gmail.com. Shared as "Anyone with the link: Viewer" so the site can read it. **Do not change that sharing setting** or the site falls back to the last synced names.

## Updating names (no code, no commits)

1. Open the doc.
2. Edit names under the three headings:
   - `CURRENT CONSULTANTS`
   - `PAST CONSULTANTS`
   - `BUSINESSES`
3. Done. The next time anyone loads the site, it shows the new lists.

Rules the site follows when reading the doc:

| You write | What happens |
|---|---|
| One name per line under a heading | Shows on the site in that order |
| Cut a name from CURRENT, paste under PAST | Moves it to Past Consultants (faded style) |
| Blank lines, bullets, numbering | Ignored / stripped |
| Anything above the first heading | Ignored (that is where the instructions live) |
| A line starting with `#` or `//` | Treated as a note, not shown |
| `Ava Lee \| joined fall 2026` (consultant) | Only `Ava Lee` shows; text after `\|` is a private note |
| `Code Ninjas Bridgewater \| CB` (business) | Uses `CB` in the green circle instead of the automatic letters |
| Same name twice in one section | Shown once |
| A section left with no names | That column is hidden on the site |
| Heading renamed or deleted | That list keeps its last known names (nothing gets wiped) |

Headings are not case sensitive and can have a colon. These also work: `Former Consultants` or `Alumni` (past), `Client Businesses` or `Clients` (businesses).

Automatic icon letters: first letter of the first two main words (skipping "the", "and", "of", "to"...). One-word CamelCase names use their capitals (TheeGroovement = TG). A leading acronym uses its first two letters (WDA Strategic Marketing = WD).

**Organizational Partners** are not in the doc. They are still edited in `index.html`.

## How it works

- On the site, each of the three lists is its own carousel showing 4 names at a time (arrows, dots, swipe). They page separately on purpose, so a consultant never looks tied to the business beside them. That is `list-carousel.js`, switched on by `data-carousel-size="4"` on each list.
- `roster.js` runs on page load, fetches the doc's plain-text export (`/export?format=txt`), parses the three headings, and swaps the lists in place. Typical load time is about 1 second.
- The names already written in `index.html` (between `<!-- roster:... -->` markers) show instantly and stay up if Google is slow, down, or the doc is broken. Each visitor's browser also caches the last good roster.
- `.github/workflows/sync-roster.yml` ("Sync site data") runs daily (and on demand from the GitHub Actions tab) and calls `scripts/sync-site.mjs`, which copies the doc's names into `index.html` so Google search and the fallback never go stale. It only commits when something changed. The same job also syncs Google reviews (see REVIEWS.md).

## Files

| File | Purpose |
|---|---|
| `roster.js` | Loader + parser. Runs in the browser and in Node. The doc ID is at the top. |
| `list-carousel.js` | Shows each list 4 at a time and rebuilds the pages when names arrive from the doc |
| `scripts/sync-roster.mjs` | Updates the static names in `index.html` from the doc. `--check` exits 1 if out of date. |
| `.github/workflows/sync-roster.yml` | Daily sync (roster + reviews) + manual "Run workflow" button |
| `tests/roster.test.mjs`, `tests/reviews.test.mjs` | 35 tests: parser rules, initials, escaping, review rendering, static sync, end-to-end script runs |
| `tests/fixtures-doc-export.txt` | A real export of the doc, used by the tests |

## Commands

```bash
node --test tests/*.test.mjs                               # run tests
node scripts/sync-roster.mjs                               # pull doc names into index.html now
ROSTER_TEXT_FILE=export.txt node scripts/sync-roster.mjs   # use a saved export instead of fetching
```

## Debugging on the live site

Open the browser console on montgomerysbi.com:

```js
SBIRoster.state            // source: "doc" | "cache" | "static", plus any error
await SBIRoster.refresh()  // re-pull the doc right now
```

If the doc can't be read, the console shows a `[SBI roster]` warning and the page keeps the names it already had.

## Moving the doc

If the roster ever moves to a new doc: share it as "Anyone with the link: Viewer", keep the three headings, then change `DOC_ID` at the top of `roster.js` and update the link at the top of this file.
