/*!
 * Testimonials deck
 *
 * Turns the Google reviews that scripts/sync-reviews.mjs writes into
 * index.html into a stacked, flip-through carousel: arrows, dots, swipe,
 * arrow keys, click the card peeking behind, and a gentle autoplay that stops
 * as soon as someone interacts (and never runs with reduced motion).
 * Without JavaScript the reviews simply show as a list.
 */
(function () {
  'use strict';

  var AUTOPLAY_MS = 7000;
  var FLIP_MS = 520; // keep in sync with the CSS transition
  var SWIPE_PX = 40;
  var VISIBLE_BEHIND = 2;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function setFocusable(card, on) {
    var links = card.querySelectorAll('a, button');
    for (var i = 0; i < links.length; i++) {
      if (on) links[i].removeAttribute('tabindex');
      else links[i].setAttribute('tabindex', '-1');
    }
  }

  function init(deck) {
    var cards = Array.prototype.slice.call(deck.querySelectorAll('.review-card'));
    var n = cards.length;
    if (n < 2 || deck.classList.contains('is-enhanced')) return;

    var block = deck.closest('.recognition-block') || deck.parentNode;
    var index = 0;
    var timer = null;
    var stopped = reduceMotion;
    var paused = false;
    var visible = true;
    var cleanup = null;

    deck.classList.add('is-enhanced');
    deck.setAttribute('role', 'region');
    deck.setAttribute('aria-roledescription', 'carousel');
    cards.forEach(function (card, i) {
      card.setAttribute('role', 'group');
      card.setAttribute('aria-roledescription', 'slide');
      card.setAttribute('aria-label', 'Review ' + (i + 1) + ' of ' + n);
    });

    // Controls: prev, dots, next, and a polite live region for screen readers.
    var bar = block.querySelector('.review-bar') || deck.parentNode.insertBefore(el('div', 'review-bar'), deck.nextSibling);
    var controls = el('div', 'review-controls');
    var prev = el('button', 'review-arrow review-prev', { type: 'button', 'aria-label': 'Previous review' });
    prev.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var next = el('button', 'review-arrow review-next', { type: 'button', 'aria-label': 'Next review' });
    next.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var dotsWrap = el('div', 'review-dots');
    var dots = cards.map(function (_c, i) {
      var d = el('button', 'review-dot', { type: 'button', 'aria-label': 'Show review ' + (i + 1) });
      d.addEventListener('click', function () { go(i, true); });
      dotsWrap.appendChild(d);
      return d;
    });
    var live = el('span', 'sr-only', { 'aria-live': 'polite', 'aria-atomic': 'true' });
    controls.appendChild(prev);
    controls.appendChild(dotsWrap);
    controls.appendChild(next);
    controls.appendChild(live);
    bar.insertBefore(controls, bar.firstChild);

    function posOf(i) {
      var p = (i - index + n) % n;
      return p > VISIBLE_BEHIND ? 'hidden' : String(p);
    }

    function layout() {
      cards.forEach(function (card, i) {
        var pos = posOf(i);
        card.setAttribute('data-pos', pos);
        var front = pos === '0';
        card.setAttribute('aria-hidden', front ? 'false' : 'true');
        setFocusable(card, front);
      });
      dots.forEach(function (d, i) {
        if (i === index) d.setAttribute('aria-current', 'true');
        else d.removeAttribute('aria-current');
      });
    }

    function snap(card, pos) {
      card.classList.add('no-anim');
      card.setAttribute('data-pos', pos);
      void card.offsetWidth; // commit the jump before animations resume
      card.classList.remove('no-anim');
    }

    function go(to, byUser) {
      to = ((to % n) + n) % n;
      if (to === index) return;
      if (cleanup) { cleanup(); }
      var from = index;
      var forward = ((to - from + n) % n) <= n / 2;
      index = to;

      if (forward) {
        var leaving = cards[from];
        layout();
        leaving.setAttribute('data-pos', 'out');
        var t = setTimeout(function () { cleanup(); }, FLIP_MS);
        cleanup = function () {
          clearTimeout(t);
          cleanup = null;
          // Tuck the card in at the back of the stack, then let it fade into place.
          snap(leaving, 'hidden');
          leaving.setAttribute('data-pos', posOf(cards.indexOf(leaving)));
        };
      } else {
        snap(cards[to], 'out');
        layout();
      }

      if (byUser) {
        live.textContent = 'Review ' + (index + 1) + ' of ' + n;
        stopped = true;
        clearInterval(timer);
      }
    }

    prev.addEventListener('click', function () { go(index - 1, true); });
    next.addEventListener('click', function () { go(index + 1, true); });

    // Click the card peeking behind to flip forward.
    var swipedAt = 0;
    deck.addEventListener('click', function (e) {
      if (Date.now() - swipedAt < 400) { e.preventDefault(); return; } // the click that ends a drag
      var card = e.target.closest && e.target.closest('.review-card');
      if (card && card.getAttribute('data-pos') !== '0' && !e.target.closest('a')) go(cards.indexOf(card), true);
    });

    // Arrow keys anywhere inside the testimonials card.
    block.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1, true); prev.focus(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1, true); next.focus(); }
    });

    // Swipe (touch, pen or mouse drag). Vertical scrolling is left alone.
    var startX = null, startY = 0;
    deck.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      startX = e.clientX; startY = e.clientY;
    });
    deck.addEventListener('pointerup', function (e) {
      if (startX === null) return;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      startX = null;
      if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
        swipedAt = Date.now();
        go(index + (dx < 0 ? 1 : -1), true);
      }
    });
    deck.addEventListener('pointercancel', function () { startX = null; });

    // Autoplay: pauses on hover/focus, offscreen, or hidden tab; stops for good after any interaction.
    function tick() { if (!stopped && !paused && visible && !document.hidden) go(index + 1, false); }
    function start() { if (!stopped) { clearInterval(timer); timer = setInterval(tick, AUTOPLAY_MS); } }
    block.addEventListener('mouseenter', function () { paused = true; });
    block.addEventListener('mouseleave', function () { paused = false; });
    block.addEventListener('focusin', function () { paused = true; });
    block.addEventListener('focusout', function (e) { if (!block.contains(e.relatedTarget)) paused = false; });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
      }, { threshold: 0.4 }).observe(deck);
    }

    layout();
    start();

    deck.sbiDeck = { go: function (i) { go(i, true); }, get index() { return index; }, size: n };
  }

  function boot() {
    var decks = document.querySelectorAll('[data-review-deck]');
    for (var i = 0; i < decks.length; i++) init(decks[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
