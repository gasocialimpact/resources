/*!
 * gsic-print.js — the "Save as PDF" button on each GSIC tool page.
 *
 * Why it lives on the tool page and not on the Starter Kit shell
 * -------------------------------------------------------------
 * The shell used to carry one Print button in its header. That printed the
 * shell, which is a height:100vh app whose tool sits in an iframe, so the
 * printout was one screen's worth of frame with the rest of the content cut
 * off. A tool page calling print() on itself has no such problem: it prints its
 * own document, top to bottom, however long it is.
 *
 * So each tool page includes this script and gets its own button. Whichever tool
 * the reader is looking at is the one that saves, and it saves all of it.
 *
 * On a page with subtabs only the open subtab prints, because the others are
 * display:none and a hidden element does not print. That is the behaviour we
 * want and it needs no special casing.
 *
 * Placement: first choice is the page's own `.container`, so the button lines up
 * with the content column; otherwise the top of <body>. A page that already has
 * its own PDF export (the worksheet's action bar, the calculator's per-scenario
 * exports) can opt out with <meta name="gsic-print" content="off">.
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    var opt = document.querySelector('meta[name="gsic-print"]');
    if (opt && opt.content === 'off') return;
    if (document.querySelector('.gsic-print-row')) return;

    var style = document.createElement('style');
    style.textContent = [
      '.gsic-print-row{display:flex; justify-content:flex-end; padding:16px 0 0}',
      '.gsic-print-btn{',
      '  display:inline-flex; align-items:center; gap:8px;',
      '  font-family:inherit; font-size:13.5px; font-weight:600; line-height:1;',
      '  padding:10px 16px; border-radius:8px; cursor:pointer;',
      '  color:#4750a2; background:#fff; border:1.5px solid #4750a2;',
      '  transition:background .18s ease, color .18s ease;',
      '}',
      '.gsic-print-btn:hover{background:#4750a2; color:#fff}',
      '.gsic-print-btn svg{width:15px; height:15px; flex-shrink:0}',
      // Print rules. The button itself must never appear in the PDF, and cards
      // and sections should not be split across a page break where avoidable.
      '@media print{',
      '  .gsic-print-row{display:none !important}',
      '  html,body{height:auto !important; overflow:visible !important; background:#fff !important}',
      '  .card,.section,.q-theme,.foundation-content,.metric-card{break-inside:avoid; page-break-inside:avoid}',
      '  a[href]:after{content:""}',
      '}'
    ].join('\n');
    document.head.appendChild(style);

    var row = document.createElement('div');
    row.className = 'gsic-print-row';
    row.innerHTML =
      '<button type="button" class="gsic-print-btn">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
      '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' +
      '</svg>Save as PDF</button>';

    row.querySelector('button').addEventListener('click', function () { window.print(); });

    var host = document.querySelector('.container') || document.body;
    host.insertBefore(row, host.firstChild);
  });
})();
