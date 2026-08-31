/*!
 * gsic-frame.js — shared iframe sizing protocol for GSIC tools.
 *
 * One file, three jobs. Include it once on any page and it works out which of
 * them apply:
 *
 *   1. CHILD  — if the page is itself inside an iframe, it measures its content
 *               and posts its height to the host, so the host can size the frame
 *               to the content instead of guessing.
 *   2. HOST   — if the page contains iframes pointing at this same origin, it
 *               listens for those heights and applies them.
 *   3. RELAY  — a page can be both at once (the Starter Kit shell is), so the
 *               chain blog page -> shell -> tool page sizes end to end.
 *
 * Why this exists
 * ---------------
 * The durable problem it solves is nested scrolling on touch devices. A tool
 * page inside a fixed-height iframe has to scroll *inside* that frame, and on a
 * phone that inner scroll is hard to grab, competes with the page scroll, and is
 * capped at whatever height the host guessed. Sizing the frame to its content
 * removes the inner scroll container entirely: there is one page, one scrollbar,
 * and the phone scrolls it the way it scrolls anything else.
 *
 * On a desktop with a mouse the nested scroll is fine, and the fixed app-shell
 * layout is nicer, so auto-height is applied only in "flow mode".
 *
 *   Flow mode = (max-width: 900px), (hover: none)
 *
 * The `hover: none` half matters: this is a touch problem, not a width problem.
 * A tablet at 1024px has the same trap as a phone at 375px, so it gets the same
 * treatment. Keep FLOW_QUERY here and in the pages' CSS in sync — it is the one
 * place the boundary is defined.
 *
 * Messages (all tagged with `frame`, the value of <meta name="gsic-frame">)
 * ------------------------------------------------------------------------
 *   child -> host  {type:'gsic:resize',   height}          content height changed
 *   child -> host  {type:'gsic:scrollTo', offset}          please scroll to `offset` into me
 *   host  -> child {type:'gsic:hello'}                     report your height now
 *   host  -> child {type:'gsic:viewport', top, height}     the part of you that is on screen
 *
 * gsic:viewport is what lets a child still draw an overlay once it has been
 * auto-sized. An auto-sized iframe has no viewport of its own — it is as tall as
 * its content and never scrolls — so `position:fixed` in the child anchors to
 * the top of the whole document, usually far off screen. The child gets the
 * visible band as CSS custom properties instead:
 *
 *   --gsic-vp-top     offset from the top of the child to the visible band
 *   --gsic-vp-height  height of that band
 *
 * so an overlay is written `position:absolute; top:var(--gsic-vp-top, 0px);
 * height:var(--gsic-vp-height, 100vh)` and lands on screen in both modes. The
 * fallbacks are what a non-embedded or fixed-height page wants, so the same
 * CSS is correct when the page is opened on its own.
 *
 * Opting a page out of reporting: <meta name="gsic-height" content="flow">
 * makes it report only in flow mode. The Starter Kit shell uses this because in
 * desktop app-shell mode it is `height:100vh` by design — its measured height is
 * just whatever height the host already gave it, which tells the host nothing.
 */
(function () {
  'use strict';

  var FLOW_QUERY = '(max-width: 900px), (hover: none)';
  var MIN_FRAME_HEIGHT = 120;

  // Iframes are treated as sizable when they point at the same origin this
  // script was served from. That makes the script self-configuring: drop it on
  // a blog page and it finds the GSIC embeds without the author tagging them.
  // data-gsic-autosize / ="off" force it on or off.
  var ORIGIN = (function () {
    try {
      var s = document.currentScript;
      if (s && s.src) return new URL(s.src, location.href).origin;
    } catch (e) {}
    return location.origin;
  })();

  var embedded = window.parent !== window;
  var root = document.documentElement;
  var flow = window.matchMedia(FLOW_QUERY);

  root.classList.add(embedded ? 'gsic-embedded' : 'gsic-standalone');

  function onMediaChange(mq, fn) {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else mq.addListener(fn); // Safari < 14
  }

  function meta(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el ? el.content : '';
  }

  /* ------------------------------------------------------------------ child */

  var FRAME_ID = meta('gsic-frame') ||
    ('gsic' + location.pathname.replace(/index\.html$/, '')
                               .replace(/\.html$/, '')
                               .replace(/[^A-Za-z0-9]+/g, '-')
                               .replace(/-+$/, ''));

  var reportWhenFlowOnly = meta('gsic-height') === 'flow';

  function postUp(msg) {
    if (!embedded) return;
    msg.frame = FRAME_ID;
    try { window.parent.postMessage(msg, '*'); } catch (e) {}
  }

  var lastHeight = 0;

  // Measuring content height is fiddlier than it looks.
  //
  // documentElement's own box is not enough: a page with `html{height:100%}`
  // reports the frame's height rather than its content's, which pins the frame
  // at whatever height it already had. So take the bottom of the body box too.
  //
  // documentElement.scrollHeight would catch that case, but it is floored at the
  // viewport height, so once the frame has been sized to it the value can never
  // come back down and a shrinking page stays tall forever. The body's own box
  // shrinks honestly, so the two together measure correctly in both directions.
  function measure() {
    var body = document.body;
    if (!body) return 0;
    var style = window.getComputedStyle(body);
    var bodyBottom = body.getBoundingClientRect().bottom +
      (window.pageYOffset || 0) +
      (parseFloat(style.marginBottom) || 0);
    return Math.ceil(Math.max(root.getBoundingClientRect().height, bodyBottom));
  }

  function reportHeight(force) {
    if (!embedded) return;
    if (reportWhenFlowOnly && !flow.matches) return;
    var h = measure();
    // A frame inside a hidden section has no layout. Reporting 0 would collapse
    // it, so keep the last known height until it is shown and measures again.
    if (h < 1) return;
    if (force || h !== lastHeight) {
      lastHeight = h;
      postUp({ type: 'gsic:resize', height: h });
    }
  }

  // The band of this document that is actually on screen, in this document's
  // own coordinates. When a host tells us, we believe it; otherwise we have a
  // real viewport of our own and can read it directly.
  var hostViewport = null;

  function myViewport() {
    if (hostViewport) return hostViewport;
    return { top: window.pageYOffset || 0, height: window.innerHeight };
  }

  function setViewport(top, height) {
    hostViewport = { top: top, height: height };
    root.style.setProperty('--gsic-vp-top', top + 'px');
    root.style.setProperty('--gsic-vp-height', height + 'px');
    sendViewports(); // our own children's visible bands just changed too
  }

  /* ------------------------------------------------------------------- host */

  function sizableFrames() {
    var out = [];
    var list = document.getElementsByTagName('iframe');
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var flag = f.getAttribute('data-gsic-autosize');
      if (flag === 'off') continue;
      if (flag !== null) { out.push(f); continue; }
      try {
        if (new URL(f.src, location.href).origin === ORIGIN) out.push(f);
      } catch (e) {}
    }
    return out;
  }

  function frameFor(win) {
    var list = document.getElementsByTagName('iframe');
    for (var i = 0; i < list.length; i++) {
      if (list[i].contentWindow === win) return list[i];
    }
    return null;
  }

  function applyHeights() {
    sizableFrames().forEach(function (f) {
      var h = parseInt(f.getAttribute('data-gsic-height') || '0', 10);
      if (flow.matches && h) {
        // Stash whatever inline height the embedding page set before taking it
        // over, so leaving flow mode can put it back exactly.
        if (!f.hasAttribute('data-gsic-sized')) {
          f.setAttribute('data-gsic-prev-height', f.style.height || '');
          f.setAttribute('data-gsic-sized', '');
        }
        f.style.height = Math.max(h, MIN_FRAME_HEIGHT) + 'px';
      } else if (f.hasAttribute('data-gsic-sized')) {
        // Restore the page's own height rather than just clearing ours. Blanking
        // it would drop an inline height the embedding page set for itself and
        // collapse the frame to the browser's 150px default; an empty stash
        // correctly hands the height back to the stylesheet.
        f.style.height = f.getAttribute('data-gsic-prev-height') || '';
        f.removeAttribute('data-gsic-prev-height');
        f.removeAttribute('data-gsic-sized');
      }
    });
  }

  function hello(target) {
    (target ? [target] : sizableFrames()).forEach(function (f) {
      try { f.contentWindow.postMessage({ type: 'gsic:hello' }, '*'); } catch (e) {}
    });
  }

  function sendViewports() {
    var vp = myViewport();
    var scroll = window.pageYOffset || 0;
    sizableFrames().forEach(function (f) {
      if (!f.contentWindow) return;
      var rect = f.getBoundingClientRect();
      var frameTop = rect.top + scroll;
      var visTop = Math.max(vp.top, frameTop);
      var visBottom = Math.min(vp.top + vp.height, frameTop + rect.height);
      try {
        f.contentWindow.postMessage({
          type: 'gsic:viewport',
          top: Math.round(visTop - frameTop),
          height: Math.round(Math.max(0, visBottom - visTop))
        }, '*');
      } catch (e) {}
    });
  }

  // A child asking to be scrolled to. If we scroll, we scroll; if we have been
  // auto-sized ourselves we cannot, so we pass the request up with the offset
  // rebased into our coordinates. Doing both is safe — the one that does not
  // apply is a no-op.
  function scrollToFrame(frame, offset) {
    var top = frame.getBoundingClientRect().top + (window.pageYOffset || 0) + offset;
    try { window.scrollTo({ top: top, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, top); }
    postUp({ type: 'gsic:scrollTo', offset: top });
  }

  /* --------------------------------------------------------------- plumbing */

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (d === 'gsic:hello') { reportHeight(true); return; }
    if (!d || typeof d !== 'object') return;

    if (d.type === 'gsic:hello') { reportHeight(true); return; }
    if (d.type === 'gsic:viewport') { setViewport(d.top || 0, d.height || 0); return; }

    var f = frameFor(e.source);
    if (!f) return;
    if (d.type === 'gsic:resize' && d.height) {
      f.setAttribute('data-gsic-height', Math.ceil(d.height));
      applyHeights();
      sendViewports();
    } else if (d.type === 'gsic:scrollTo') {
      scrollToFrame(f, d.offset || 0);
    }
  });

  var ticking = false;
  function onScrollOrResize() {
    reportHeight();
    // applyHeights() here as well as on the media query's change event. The
    // change event is the precise signal, but it does not fire everywhere the
    // boundary can be crossed, and if it is missed the frames keep whichever
    // mode's heights they had. Re-applying on resize is cheap and idempotent.
    applyHeights();
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; sendViewports(); });
  }
  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize);
  window.addEventListener('load', function () { reportHeight(true); hello(); sendViewports(); });
  window.addEventListener('pageshow', function () { reportHeight(true); });

  onMediaChange(flow, function () {
    lastHeight = 0;      // force a fresh report on the way into flow mode
    applyHeights();
    hello();
    reportHeight(true);
    sendViewports();
  });

  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () { reportHeight(); sendViewports(); });
    ro.observe(document.body);
  }

  // A host may attach its listener after we have already reported, which would
  // strand the frame at its starting height. Two defenses: answer any later
  // gsic:hello, and re-announce over the first few seconds while fonts, images
  // and lazy embeds settle.
  [100, 400, 1000, 2500].forEach(function (ms) {
    setTimeout(function () { reportHeight(true); hello(); sendViewports(); }, ms);
  });

  reportHeight(true);
  applyHeights();

  window.GSICFrame = {
    isFlow: function () { return flow.matches; },
    // Call after showing a frame that was hidden: it had no layout while hidden,
    // so it needs to be asked for a fresh height.
    refresh: function (frame) { hello(frame); applyHeights(); sendViewports(); },
    report: function () { reportHeight(true); },
    scrollTo: function (offset) { postUp({ type: 'gsic:scrollTo', offset: offset || 0 }); }
  };
})();
