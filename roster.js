/*!
 * SBI roster loader
 *
 * The Consultants and Partners sections of montgomerysbi.com come from the
 * public "SBI Website Roster" Google Doc. Every page load fetches the doc's
 * plain-text export, reads three headings, and rebuilds those lists:
 *
 *   CURRENT CONSULTANTS   one name per line
 *   PAST CONSULTANTS      one name per line
 *   BUSINESSES            one name per line, optional "| XY" icon letters
 *
 * If Google is slow or down, the names already in index.html stay on screen
 * (a daily GitHub Action keeps those in sync with the doc too).
 *
 * This file runs in the browser and in Node (tests + the sync script).
 * See ROSTER.md for the full guide.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SBIRoster = api;
    api.boot();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- Config ----------------------------------------------------------------
  var DOC_ID = '1YpXXvPi9XdUW69mYfHGx7FspiMNUqNeajFPH47K76W0';
  var DOC_URL = 'https://docs.google.com/document/d/' + DOC_ID + '/edit';
  var EXPORT_URL = 'https://docs.google.com/document/d/' + DOC_ID + '/export?format=txt';
  var CACHE_KEY = 'sbi-roster-v1';
  var TIMEOUT_MS = 8000;
  var MAX_NAME_LENGTH = 120;

  var SECTION_KEYS = ['current', 'past', 'businesses'];

  // Heading text (lowercased, letters and spaces only) -> section key.
  var HEADINGS = {
    'current consultants': 'current',
    'current consultant': 'current',
    'past consultants': 'past',
    'past consultant': 'past',
    'former consultants': 'past',
    'alumni': 'past',
    'businesses': 'businesses',
    'business': 'businesses',
    'client businesses': 'businesses',
    'clients': 'businesses',
    'partner businesses': 'businesses'
  };

  var STOP_WORDS = { the: 1, and: 1, of: 1, a: 1, an: 1, to: 1, for: 1, at: 1, in: 1, on: 1 };

  // ---- Parsing ---------------------------------------------------------------

  function headingKey(line) {
    var norm = line.toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return Object.prototype.hasOwnProperty.call(HEADINGS, norm) ? HEADINGS[norm] : null;
  }

  // Strips invisible characters, bullets ("*", "\u2022", "-") and numbering ("1.", "2)").
  function cleanLine(raw) {
    var s = String(raw)
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[\u00A0\u2007\u202F\t]/g, ' ')
      .trim();
    s = s.replace(/^(?:[*\u2022\u25CF\u25CB\u25A0\u25AA\u25E6\u2023\u2043\u2219>\-\u2013\u2014]+|\(?\d{1,3}[.)])\s+/, '');
    return s.replace(/\s+/g, ' ').trim();
  }

  function initialsFor(name) {
    var words = String(name)
      .replace(/[^A-Za-z0-9\s'-]/g, ' ')
      .split(/[\s-]+/)
      .map(function (w) { return w.replace(/'/g, ''); })
      .filter(Boolean);
    var sig = words.filter(function (w) { return !STOP_WORDS[w.toLowerCase()]; });
    if (!sig.length) sig = words;
    if (!sig.length) return '?';
    var first = sig[0];
    // Acronym first word ("WDA Strategic") -> "WD"
    if (first.length >= 2 && first === first.toUpperCase() && /[A-Z]/.test(first)) {
      return first.slice(0, 2);
    }
    if (sig.length >= 2) return (first[0] + sig[1][0]).toUpperCase();
    // One CamelCase word ("TheeGroovement") -> "TG"
    var caps = first.match(/[A-Z]/g);
    if (caps && caps.length >= 2) return caps[0] + caps[1];
    return first.slice(0, 2).toUpperCase();
  }

  function parseBusiness(line) {
    var m = line.match(/^(.*?)\s*\|\s*([A-Za-z0-9]{1,3})\s*$/);
    if (m && m[1]) return { name: m[1].trim(), initials: m[2].toUpperCase() };
    var name = line.split('|')[0].trim();
    return { name: name, initials: initialsFor(name) };
  }

  /**
   * Turns the doc's text export into
   *   { current: [names], past: [names], businesses: [{name, initials}],
   *     found: {current, past, businesses}, skipped: [lines] }
   * Everything above the first recognised heading is ignored, so the doc can
   * hold instructions at the top.
   */
  function parse(text) {
    var out = {
      current: [], past: [], businesses: [],
      found: { current: false, past: false, businesses: false },
      skipped: []
    };
    var seen = { current: {}, past: {}, businesses: {} };
    var section = null;
    var lines = String(text == null ? '' : text).split(/\r\n|\r|\n/);

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var line = cleanLine(raw);
      if (!line) continue;

      var key = headingKey(line);
      if (key) {
        section = key;
        out.found[key] = true;
        continue;
      }
      if (!section) continue;
      if (line.charAt(0) === '#' || line.slice(0, 2) === '//') continue;
      if (line.length > MAX_NAME_LENGTH) { out.skipped.push(line); continue; }

      if (section === 'businesses') {
        var biz = parseBusiness(line);
        if (!biz.name) continue;
        var bk = biz.name.toLowerCase();
        if (seen.businesses[bk]) continue;
        seen.businesses[bk] = 1;
        out.businesses.push(biz);
      } else {
        var name = line.split('|')[0].trim(); // anything after | is a private note
        if (!name) continue;
        var nk = name.toLowerCase();
        if (seen[section][nk]) continue;
        seen[section][nk] = 1;
        out[section].push(name);
      }
    }
    return out;
  }

  function hasAnySection(data) {
    return !!(data && data.found && (data.found.current || data.found.past || data.found.businesses));
  }

  // ---- Rendering (HTML strings, shared by browser and sync script) -----------

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderSection(key, data, indent) {
    var pad = indent == null ? '' : indent;
    if (key === 'businesses') {
      return data.businesses.map(function (b) {
        return pad + '<div class="partner-item"><div class="partner-icon">' + escapeHtml(b.initials) +
          '</div>' + escapeHtml(b.name) + '</div>';
      }).join('\n');
    }
    var cls = key === 'past' ? 'consultant-name past' : 'consultant-name';
    return data[key].map(function (n) {
      return pad + '<div class="' + cls + '">' + escapeHtml(n) + '</div>';
    }).join('\n');
  }

  // Text signature of a section, comparable with what is already on the page.
  function signature(key, data) {
    if (key === 'businesses') {
      return data.businesses.map(function (b) { return b.initials + b.name; }).join('\n');
    }
    return data[key].join('\n');
  }

  /**
   * Rewrites the static fallback in index.html between
   *   <!-- roster:KEY -->  and  <!-- /roster:KEY -->
   * Only sections whose heading exists in the doc are touched.
   */
  function injectStatic(html, data) {
    var result = html;
    var eol = /\r\n/.test(html) ? '\r\n' : '\n'; // keep Windows checkouts CRLF
    SECTION_KEYS.forEach(function (key) {
      if (!data.found[key]) return;
      var re = new RegExp('(^([ \\t]*)<!-- roster:' + key + ' -->)[\\s\\S]*?(^[ \\t]*<!-- /roster:' + key + ' -->)', 'm');
      result = result.replace(re, function (_all, open, indent, close) {
        var body = renderSection(key, data, indent + '  ').split('\n').join(eol);
        return open + eol + (body ? body + eol : '') + close;
      });
    });
    return result;
  }

  // ---- Browser ---------------------------------------------------------------

  var state = { source: 'static', updatedAt: null, data: null, error: null };

  function targets() {
    var map = {};
    var found = false;
    SECTION_KEYS.forEach(function (key) {
      var el = document.querySelector('[data-roster="' + key + '"]');
      if (el) { map[key] = el; found = true; }
    });
    return found ? map : null;
  }

  function domSignature(el) {
    var parts = [];
    for (var i = 0; i < el.children.length; i++) {
      parts.push(el.children[i].textContent.replace(/\s+/g, ' ').trim());
    }
    return parts.join('\n');
  }

  function apply(data, els, animate) {
    SECTION_KEYS.forEach(function (key) {
      var el = els[key];
      if (!el || !data.found[key]) return;
      var block = el.closest ? el.closest('.list-block, .partner-group') : null;
      var empty = data[key].length === 0;
      if (block) block.hidden = empty;
      if (domSignature(el) === signature(key, data)) return;
      var html = renderSection(key, data, '');
      if (!animate) { el.innerHTML = html; return; }
      el.classList.add('roster-swapping');
      setTimeout(function () {
        el.innerHTML = html;
        el.classList.remove('roster-swapping');
      }, 180);
    });
  }

  function readCache() {
    try {
      var raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && parsed.data && hasAnySection(parsed.data) ? parsed : null;
    } catch (e) { return null; }
  }

  function writeCache(data) {
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: data }));
    } catch (e) { /* private mode or storage disabled */ }
  }

  function fetchText(url, timeoutMs) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs);
    return fetch(url, { credentials: 'omit', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (t) { clearTimeout(timer); return t; },
            function (e) { clearTimeout(timer); throw e; });
  }

  function refresh() {
    var els = targets();
    if (!els || typeof fetch !== 'function') return Promise.resolve(state);
    var attempt = function (n) {
      return fetchText(EXPORT_URL, TIMEOUT_MS).catch(function (err) {
        if (n > 0) return new Promise(function (r) { setTimeout(r, 1500); }).then(function () { return attempt(n - 1); });
        throw err;
      });
    };
    return attempt(1).then(function (text) {
      var data = parse(text);
      if (!hasAnySection(data)) {
        throw new Error('No CURRENT CONSULTANTS / PAST CONSULTANTS / BUSINESSES headings found in the roster doc');
      }
      apply(data, els, true);
      writeCache(data);
      state = { source: 'doc', updatedAt: new Date(), data: data, error: null };
      if (data.skipped.length && window.console) {
        console.warn('[SBI roster] Skipped lines that were too long to be names:', data.skipped);
      }
      return state;
    }).catch(function (err) {
      state.error = err;
      if (window.console) console.warn('[SBI roster] Could not load the Google Doc, showing ' + state.source + ' names.', err);
      return state;
    });
  }

  function boot() {
    if (typeof document === 'undefined') return;
    var start = function () {
      var els = targets();
      if (!els) return;
      var cached = readCache();
      if (cached) {
        apply(cached.data, els, false);
        state = { source: 'cache', updatedAt: new Date(cached.t), data: cached.data, error: null };
      }
      refresh();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  return {
    DOC_ID: DOC_ID,
    DOC_URL: DOC_URL,
    EXPORT_URL: EXPORT_URL,
    parse: parse,
    cleanLine: cleanLine,
    headingKey: headingKey,
    initialsFor: initialsFor,
    escapeHtml: escapeHtml,
    renderSection: renderSection,
    injectStatic: injectStatic,
    hasAnySection: hasAnySection,
    refresh: refresh,
    boot: boot,
    get state() { return state; }
  };
});
