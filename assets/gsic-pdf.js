/*!
 * gsic-pdf.js — the "Save as PDF" button on each GSIC tool page, and the
 * single-page export behind it.
 *
 * What it produces
 * ----------------
 * One continuous page, laid out at a fixed desktop width, whatever device it
 * was saved from. Not paginated, not reflowed to the phone.
 *
 * Why not window.print()
 * ----------------------
 * print() hands the job to the browser's paginator, which lays the page out at
 * the *current* viewport width and slices it into sheets. Saved from a phone
 * that means a 375px column chopped across a dozen pages, with cards split down
 * the middle — technically a PDF, but not a readable document. There is no
 * print stylesheet that fixes it either, because the mobile layout is the one
 * being printed.
 *
 * How the desktop layout is forced
 * --------------------------------
 * html2canvas renders into a cloned document in an offscreen iframe, and
 * `windowWidth` sets that iframe's width. Media queries in the clone evaluate
 * against it, so the capture comes out in the desktop layout even though the
 * real viewport is a phone. The clone is taken from the live DOM, so whatever
 * the reader has done — the subtab they opened, the values they typed, the
 * answers they saved — is in the export.
 *
 * Then the capture is placed on a single jsPDF page whose height is whatever
 * the content needed. US Letter width, so it still prints at true size.
 *
 * Public API
 * ----------
 *   GSICPdf.save(element, {fileName, title, subtitle})
 *   GSICPdf.button(getTarget, getOpts) -> a Save as PDF row to place yourself
 *
 * On a one-tool-per-page file the button places itself, capturing the page's
 * `.container`. calculator.html calls save() directly with a single card for its
 * per-scenario exports.
 *
 * A page opts out of the self-placing button with
 * <meta name="gsic-print" content="off"> — either because it has its own export
 * (the worksheet) or because one button for the whole page is the wrong shape.
 * The Nonprofit Capital Access Hub holds all six of its tabs in one document, so
 * it opts out and builds a row per tab with GSICPdf.button().
 */
(function () {
  'use strict';

  // Rendered layout width. 1100 is wide enough to trigger every desktop
  // breakpoint in these tools and narrow enough that the tallest page still
  // fits in one canvas.
  var LAYOUT_WIDTH = 1100;

  // Canvas ceilings. Browsers cap both the longest side and the total pixel
  // area, and iOS is far stricter than desktop Chrome; these are the
  // conservative numbers, so an export that works on a laptop also works on the
  // phone it is most likely to be saved from. Exceeding them does not throw —
  // it silently yields a blank or truncated canvas — so scale is chosen to stay
  // inside them rather than discovering the limit afterwards.
  var MAX_DIM = 8192;
  var MAX_AREA = 16.7e6;
  var TARGET_SCALE = 2;   // ~293 DPI once placed on the page
  var MIN_SCALE = 0.6;

  var PAGE_W = 612;       // US Letter width in pt
  var MARGIN = 36;
  var MAX_PAGE_PT = 14400; // PDF's own 200in limit on a page dimension

  // JPEG, not PNG. jsPDF embeds a JPEG as-is but stores a PNG as raw
  // uncompressed pixels, so the same capture is 2MB as JPEG and 32MB as PNG,
  // and takes 39ms to add instead of 736ms. At 0.92 the artefacts around text
  // are not visible at the size this is placed on the page.
  var IMAGE_TYPE = 'image/jpeg';
  var IMAGE_QUALITY = 0.92;

  var CDN = {
    html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  };

  var loading = {};

  function loadScript(src) {
    if (loading[src]) return loading[src];
    loading[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
    return loading[src];
  }

  // Loaded on demand rather than on every page view: most readers never export,
  // and these two libraries together are larger than any of the tools.
  function ensureLibs() {
    var jobs = [];
    if (!window.html2canvas) jobs.push(loadScript(CDN.html2canvas));
    if (!window.jspdf || !window.jspdf.jsPDF) jobs.push(loadScript(CDN.jspdf));
    return Promise.all(jobs);
  }

  // The capture height is not known until after the render, but the scale has
  // to be chosen before it. Estimate it from the height at the current width:
  // laying the same content out wider makes it shorter, roughly in proportion,
  // and the fudge factor covers content that reflows less than proportionally
  // (tables, images, anything with a fixed height).
  function estimateHeight(el) {
    var current = el.getBoundingClientRect();
    var width = current.width || LAYOUT_WIDTH;
    return Math.max(400, Math.ceil(current.height * (width / LAYOUT_WIDTH) * 1.15));
  }

  function pickScale(height) {
    var byDim = Math.min(MAX_DIM / LAYOUT_WIDTH, MAX_DIM / height);
    var byArea = Math.sqrt(MAX_AREA / (LAYOUT_WIDTH * height));
    return Math.max(MIN_SCALE, Math.min(TARGET_SCALE, byDim, byArea));
  }

  function slug(s) {
    return (s || 'gsic')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'gsic';
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // Everything that should not appear in a document: the export buttons
  // themselves, and the subtab bar, whose inactive tabs are meaningless once
  // there is nothing to click. The open subtab's name is not lost — it goes
  // into the heading block below.
  function prepareClone(cloneDoc, opts) {
    var hide = cloneDoc.querySelectorAll(
      '.gsic-pdf-row, [data-gsic-pdf-hide], .cf-save-row, .cf-actions, .tab-bar, .phase-nav'
    );
    Array.prototype.forEach.call(hide, function (el) { el.style.display = 'none'; });

    // html2canvas carries form state into the clone, but it draws a textarea's
    // contents as a single unwrapped line clipped to the box — so a long answer
    // comes out as one line running off the edge, with the rest missing. Simply
    // growing the box does not help; the text still does not wrap.
    //
    // Swapping each textarea for a div holding the same text fixes both at once:
    // text wraps the way text does, and the box grows to fit it. The computed
    // styling is copied across so it still reads as a filled-in answer field.
    var view = cloneDoc.defaultView;
    Array.prototype.forEach.call(cloneDoc.querySelectorAll('textarea'), function (t) {
      var cs = view.getComputedStyle(t);
      var box = cloneDoc.createElement('div');
      box.textContent = t.value || '';
      box.setAttribute('style', [
        'white-space:pre-wrap', 'overflow-wrap:break-word', 'box-sizing:border-box',
        'width:' + Math.round(t.getBoundingClientRect().width) + 'px',
        'min-height:' + cs.height,
        'padding:' + cs.paddingTop + ' ' + cs.paddingRight + ' ' +
          cs.paddingBottom + ' ' + cs.paddingLeft,
        'border:' + cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
        'border-radius:' + cs.borderRadius,
        'font-family:' + cs.fontFamily, 'font-size:' + cs.fontSize,
        'line-height:' + cs.lineHeight, 'color:' + cs.color,
        'background:' + cs.backgroundColor
      ].join(';'));
      t.parentNode.replaceChild(box, t);
    });

    // Escape hatch for anything else that scrolls its own content.
    Array.prototype.forEach.call(cloneDoc.querySelectorAll('[data-gsic-pdf-expand]'), function (el) {
      el.style.overflow = 'hidden';
      el.style.maxHeight = 'none';
      el.style.height = 'auto';
    });

    var head = cloneDoc.createElement('div');
    head.setAttribute('style', [
      'padding:0 0 18px', 'margin:0 0 24px',
      'border-bottom:2px solid #149a49',
      'font-family:inherit'
    ].join(';'));
    head.innerHTML =
      '<div style="font-size:26px;font-weight:800;color:#149a49;line-height:1.2">' +
      escapeHtml(opts.title) + '</div>' +
      (opts.subtitle
        ? '<div style="font-size:16px;font-weight:600;color:#4750a2;margin-top:6px">' +
          escapeHtml(opts.subtitle) + '</div>'
        : '') +
      '<div style="font-size:12px;color:#000;opacity:.6;margin-top:8px">' +
      'Georgia Social Impact Collaborative &middot; saved ' + today() + '</div>';

    // The heading has to go inside the element being captured, or it falls
    // outside the crop and never appears. The element is tagged just before the
    // render so its counterpart in the clone can be found by selector.
    var target = cloneDoc.querySelector('[data-gsic-pdf-capture]') ||
      cloneDoc.querySelector('.container') || cloneDoc.body;
    target.insertBefore(head, target.firstChild);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function activeSubtabName() {
    var btn = document.querySelector('.tab-btn.active, .tab.active, .phase-btn.active');
    return btn ? btn.textContent.trim() : '';
  }

  function save(el, opts) {
    opts = opts || {};
    var title = opts.title || (document.title || 'GSIC Tool').trim();
    var subtitle = 'subtitle' in opts ? opts.subtitle : activeSubtabName();

    return ensureLibs().then(function () {
      var height = estimateHeight(el);
      var scale = pickScale(height);

      el.setAttribute('data-gsic-pdf-capture', '');
      return window.html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: scale,
        useCORS: true,
        logging: false,
        // The whole point: lay the clone out at desktop width so media queries
        // give us the desktop layout, not the phone one.
        windowWidth: LAYOUT_WIDTH,
        onclone: function (doc) { prepareClone(doc, { title: title, subtitle: subtitle }); }
      }).then(function (canvas) {
        el.removeAttribute('data-gsic-pdf-capture');
        return canvas;
      }, function (err) {
        el.removeAttribute('data-gsic-pdf-capture');
        throw err;
      });
    }).then(function (canvas) {
      if (!canvas || !canvas.width || !canvas.height) {
        throw new Error('The page could not be captured.');
      }

      var usableW = PAGE_W - MARGIN * 2;
      var imgH = (canvas.height / canvas.width) * usableW;
      var pageH = imgH + MARGIN * 2;

      // A page taller than the PDF format allows: shrink the whole thing to fit
      // rather than paginate, since a single page is the point.
      if (pageH > MAX_PAGE_PT) {
        var k = (MAX_PAGE_PT - MARGIN * 2) / imgH;
        imgH *= k;
        usableW *= k;
        pageH = imgH + MARGIN * 2;
      }

      var jsPDF = window.jspdf.jsPDF;
      var pdf = new jsPDF({ unit: 'pt', format: [PAGE_W, pageH], orientation: 'portrait' });
      pdf.addImage(
        canvas.toDataURL(IMAGE_TYPE, IMAGE_QUALITY), 'JPEG',
        MARGIN, MARGIN, usableW, imgH
      );
      pdf.save((opts.fileName || slug(title)) + '-' + today() + '.pdf');
    });
  }

  /* ------------------------------------------------------------- the button */

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  var styleAdded = false;

  function ensureStyle() {
    if (styleAdded) return;
    styleAdded = true;

    var style = document.createElement('style');
    style.textContent = [
      '.gsic-pdf-row{display:flex; justify-content:flex-end; padding:16px 0 0}',
      '.gsic-pdf-btn{',
      '  display:inline-flex; align-items:center; gap:8px;',
      '  font-family:inherit; font-size:13.5px; font-weight:600; line-height:1;',
      '  padding:10px 16px; border-radius:8px; cursor:pointer;',
      '  color:#4750a2; background:#fff; border:1.5px solid #4750a2;',
      '  transition:background .18s ease, color .18s ease;',
      '}',
      '.gsic-pdf-btn:hover{background:#4750a2; color:#fff}',
      '.gsic-pdf-btn[disabled]{opacity:.6; cursor:progress}',
      '.gsic-pdf-btn svg{width:15px; height:15px; flex-shrink:0}',
      '@media print{.gsic-pdf-row{display:none !important}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // A ready-to-place Save as PDF row.
  //
  // Both arguments are resolved at click time rather than now, so a page whose
  // tabs come and go can hand over whichever one is open, with a title and
  // subtitle that match it. A page holding every tab at once — the Nonprofit
  // Capital Access Hub — gives one row per tab this way.
  function button(getTarget, getOpts) {
    ensureStyle();

    var row = document.createElement('div');
    row.className = 'gsic-pdf-row';
    row.innerHTML =
      '<button type="button" class="gsic-pdf-btn">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
      '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' +
      '</svg><span>Save as PDF</span></button>';

    var btn = row.querySelector('button');
    var label = row.querySelector('span');

    btn.addEventListener('click', function () {
      btn.disabled = true;
      label.textContent = 'Preparing PDF…';
      save(getTarget(), getOpts ? getOpts() : null).catch(function (err) {
        console.error(err);
        alert('Sorry, the PDF could not be created. ' + (err && err.message ? err.message : ''));
      }).then(function () {
        btn.disabled = false;
        label.textContent = 'Save as PDF';
      });
    });

    return row;
  }

  ready(function () {
    var opt = document.querySelector('meta[name="gsic-print"]');
    if (opt && opt.content === 'off') return;
    if (document.querySelector('.gsic-pdf-row')) return;

    var host = document.querySelector('.container') || document.body;
    host.insertBefore(button(function () {
      return document.querySelector('[data-gsic-pdf-root]') ||
        document.querySelector('.container') || document.body;
    }), host.firstChild);
  });

  window.GSICPdf = { save: save, button: button, slug: slug };
})();
