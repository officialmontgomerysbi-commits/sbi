/*!
 * List carousels: Current Consultants, Past Consultants, Client Businesses
 *
 * Any element with data-carousel-size="4" shows its children 4 at a time,
 * with arrows, dots, swipe and arrow keys to flip pages. Each list pages on
 * its own so nobody reads a consultant as belonging to the business next to it.
 *
 * The lists are filled live from the Google Doc by roster.js, so this watches
 * for new children and rebuilds the pages whenever the names change.
 * Without JavaScript every name shows, as before.
 */
(function () {
  'use strict';

  var FLIP_MS = 170; // keep in sync with the CSS transition
  var SWIPE_PX = 40;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ARROW_LEFT = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ARROW_RIGHT = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function labelFor(list) {
    var block = list.parentNode;
    var h = block && block.querySelector('h3');
    return h ? h.textContent.trim() : 'list';
  }

  function init(list) {
    if (list.sbiPager) return;
    var size = Math.max(1, parseInt(list.getAttribute('data-carousel-size'), 10) || 4);
    var label = labelFor(list);
    var page = 0;
    var bar = null, dots = [], live = null, timer = null;

    function items() {
      var out = [];
      for (var i = 0; i < list.children.length; i++) out.push(list.children[i]);
      return out;
    }
    function pageCount() { return Math.max(1, Math.ceil(items().length / size)); }

    function show() {
      items().forEach(function (it, i) {
        var on = Math.floor(i / size) === page;
        if (on) it.removeAttribute('hidden'); else it.setAttribute('hidden', '');
      });
      dots.forEach(function (d, i) {
        if (i === page) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
    }

    // Reserve the height of a full page so the section never jumps on the last, shorter page.
    function lockHeight() {
      list.style.minHeight = '';
      if (pageCount() < 2) return;
      var keep = page;
      page = 0; show();
      list.style.minHeight = list.offsetHeight + 'px';
      page = keep; show();
    }

    function announce() {
      if (!live) return;
      var total = items().length;
      live.textContent = label + ': showing ' + (page * size + 1) + ' to ' + Math.min((page + 1) * size, total) + ' of ' + total;
    }

    function go(to, dir) {
      var n = pageCount();
      to = ((to % n) + n) % n;
      if (to === page) return;
      dir = dir || (to > page ? 1 : -1);
      clearTimeout(timer);
      page = to; // update right away so quick repeated clicks count from the newest page
      dots.forEach(function (d, i) {
        if (i === page) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
      if (reduceMotion) { show(); announce(); return; }
      list.classList.remove('pg-in-left', 'pg-in-right');
      list.classList.add(dir > 0 ? 'pg-out-left' : 'pg-out-right');
      timer = setTimeout(function () {
        show();
        list.classList.remove('pg-out-left', 'pg-out-right');
        list.classList.add(dir > 0 ? 'pg-in-right' : 'pg-in-left');
        void list.offsetWidth; // start the slide-in from the far side
        list.classList.remove('pg-in-left', 'pg-in-right');
        announce();
      }, FLIP_MS);
    }

    function build() {
      var n = pageCount();
      if (page >= n) page = n - 1;
      if (bar) { bar.parentNode.removeChild(bar); bar = null; dots = []; live = null; }
      list.classList.toggle('is-paged', n > 1);
      if (n > 1) {
        bar = el('div', 'pager-bar');
        var prev = el('button', 'pager-arrow', { type: 'button', 'aria-label': 'Previous ' + label });
        prev.innerHTML = ARROW_LEFT;
        var next = el('button', 'pager-arrow', { type: 'button', 'aria-label': 'Next ' + label });
        next.innerHTML = ARROW_RIGHT;
        var dotWrap = el('div', 'pager-dots');
        for (var i = 0; i < n; i++) {
          (function (i) {
            var d = el('button', 'pager-dot', { type: 'button', 'aria-label': label + ', page ' + (i + 1) + ' of ' + n });
            d.addEventListener('click', function () { go(i); });
            dotWrap.appendChild(d);
            dots.push(d);
          })(i);
        }
        live = el('span', 'sr-only', { 'aria-live': 'polite', 'aria-atomic': 'true' });
        prev.addEventListener('click', function () { go(page - 1, -1); });
        next.addEventListener('click', function () { go(page + 1, 1); });
        bar.appendChild(prev); bar.appendChild(dotWrap); bar.appendChild(next); bar.appendChild(live);
        list.parentNode.insertBefore(bar, list.nextSibling);
      }
      show();
      lockHeight();
    }

    // Swipe
    var startX = null, startY = 0;
    list.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      startX = e.clientX; startY = e.clientY;
    });
    list.addEventListener('pointerup', function (e) {
      if (startX === null || pageCount() < 2) { startX = null; return; }
      var dx = e.clientX - startX, dy = e.clientY - startY;
      startX = null;
      if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) go(page + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    });
    list.addEventListener('pointercancel', function () { startX = null; });

    // Arrow keys while focus is on this list's controls
    list.parentNode.addEventListener('keydown', function (e) {
      if (!bar || !bar.contains(e.target)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(page - 1, -1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(page + 1, 1); }
    });

    // roster.js swaps the names in when the Google Doc loads; rebuild pages then.
    if ('MutationObserver' in window) {
      new MutationObserver(function () { page = 0; build(); }).observe(list, { childList: true });
    }
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(lockHeight, 150);
    });

    build();
    list.sbiPager = { go: function (i) { go(i); }, get page() { return page; }, get pages() { return pageCount(); } };
  }

  function boot() {
    var lists = document.querySelectorAll('[data-carousel-size]');
    for (var i = 0; i < lists.length; i++) init(lists[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
