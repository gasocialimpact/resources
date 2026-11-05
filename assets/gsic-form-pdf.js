/*!
 * gsic-form-pdf.js — "Download Fillable PDF" for the worksheet.
 *
 * How this differs from gsic-pdf.js
 * ---------------------------------
 * gsic-pdf.js photographs the page: html2canvas renders it to a bitmap and that
 * bitmap is placed on a PDF page. Perfect for a case study or a calculator
 * scenario, useless for a worksheet someone wants to keep working on, because a
 * picture of a text box is not a text box.
 *
 * This module builds the PDF the other way round — real text drawn with jsPDF,
 * and real AcroForm fields on top, so every answer box can be typed into and
 * every checkbox ticked in Preview, Acrobat, or a browser's PDF viewer. The
 * result is also a quarter the size of the bitmap version and its text is
 * selectable and searchable.
 *
 * It reads the live DOM rather than a hardcoded copy of the questions, so
 * editing reflective-worksheet.html is enough — the PDF follows. The structure
 * it expects is the worksheet's own:
 *
 *   .section
 *     .section-header  ->  .section-number, .section-title, .section-description
 *     .form-group      ->  .form-label, optional .form-hint, then one control:
 *                          textarea | .checkbox-group | .radio-group |
 *                          input[type=text] (optionally in .action-item-row)
 *
 * Whatever the reader has already typed or ticked is carried into the PDF as
 * each field's starting value, so this works both as a blank form to print and
 * as a copy of a worksheet filled in online — still editable either way.
 *
 * Public API
 * ----------
 *   GSICFormPdf.save(rootElement, {fileName, title, subtitle})
 */
(function () {
  'use strict';

  var PAGE_W = 612, PAGE_H = 792;   // US Letter, points
  var M = 36;                        // same margin as gsic-pdf.js
  var CW = PAGE_W - M * 2;           // 540, same content width as gsic-pdf.js

  // The bitmap exports lay the page out at 1100 CSS px and then place that
  // capture across 540pt of paper, so everything in them is drawn at this
  // scale. Deriving every size here from the worksheet's own CSS pixel values
  // times the same number is what makes a worksheet PDF and a case-study PDF
  // look like the same document family rather than two unrelated exports.
  var SCALE = CW / 1100;             // 0.4909
  function px(n) { return n * SCALE; }

  // Straight from reflective-worksheet.html's stylesheet.
  var T = {
    docTitle:   px(26),
    docSub:     px(16),
    docMeta:    px(12),
    secTitle:   px(22),
    secDesc:    px(14),
    label:      px(15),
    hint:       px(13),
    option:     px(14),
    field:      px(15)
  };

  var GREEN  = [20, 154, 73];
  var PURPLE = [71, 80, 162];
  var INK    = [17, 17, 17];
  var GREY   = [105, 105, 112];
  var LINE   = [206, 210, 219];
  var FIELD_BG = [252, 252, 253];

  var CDN_JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  var FONT_SRC = 'gsic-font-familjen.js';

  // Resolved against this script's own URL so the worksheet does not have to
  // know how deep in the tree it sits.
  function fontUrl() {
    var me = document.currentScript;
    if (!me) {
      var all = document.getElementsByTagName('script');
      for (var i = 0; i < all.length; i++) {
        if (/gsic-form-pdf\.js/.test(all[i].src)) { me = all[i]; break; }
      }
    }
    var base = me && me.src ? me.src.replace(/[^/]*$/, '') : '';
    return base + FONT_SRC;
  }

  var loaders = {};
  function loadOnce(src, already) {
    if (already()) return Promise.resolve();
    if (loaders[src]) return loaders[src];
    loaders[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
    return loaders[src];
  }

  function ensureLibs() {
    return Promise.all([
      loadOnce(CDN_JSPDF, function () { return window.jspdf && window.jspdf.jsPDF; }),
      // The font is ~160KB, so it is fetched when someone actually exports
      // rather than on every worksheet page view. A failure here is not fatal.
      loadOnce(fontUrl(), function () { return !!window.GSICFont; }).catch(function (e) {
        if (window.console) console.warn(e);
      })
    ]);
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function txt(el) {
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  // AcroForm field names must be unique across the document and must avoid '.',
  // which PDF readers treat as a parent/child separator.
  function fieldName(base, used) {
    var n = String(base || 'field').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) || 'field';
    var name = n, i = 2;
    while (used[name]) { name = n + '_' + i; i++; }
    used[name] = true;
    return name;
  }

  /* ----------------------------------------------------------- the document */

  function Doc(jsPDFCtor, title, subtitle) {
    this.pdf = new jsPDFCtor({ unit: 'pt', format: 'letter', orientation: 'portrait' });
    this.y = M;
    this.title = title;
    this.subtitle = subtitle;
    this.used = {};
    this.font = (window.GSICFont ? window.GSICFont.register(this.pdf) : 'helvetica');
    this.pdf.setFont(this.font, 'normal');
    this.coverBlock();
  }

  Doc.prototype.coverBlock = function () {
    var p = this.pdf;
    p.setFont(this.font, 'bold'); p.setFontSize(T.docTitle);
    p.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
    var lines = p.splitTextToSize(this.title, CW);
    for (var i = 0; i < lines.length; i++) {
      this.y += T.docTitle * 1.2;
      p.text(lines[i], M, this.y);
    }
    if (this.subtitle) {
      p.setFont(this.font, 'normal'); p.setFontSize(T.docSub);
      p.setTextColor(PURPLE[0], PURPLE[1], PURPLE[2]);
      var sl = p.splitTextToSize(this.subtitle, CW);
      for (var j = 0; j < sl.length; j++) { this.y += T.docSub * 1.45; p.text(sl[j], M, this.y); }
    }
    this.y += T.docMeta * 1.6;
    p.setFont(this.font, 'normal'); p.setFontSize(T.docMeta);
    p.setTextColor(GREY[0], GREY[1], GREY[2]);
    p.text('Georgia Social Impact Collaborative  ·  ' + today() +
           '  ·  Type directly into this PDF and save it.', M, this.y);
    this.y += px(14);
    p.setDrawColor(GREEN[0], GREEN[1], GREEN[2]); p.setLineWidth(1.2);
    p.line(M, this.y, PAGE_W - M, this.y);
    this.y += px(26);
  };

  Doc.prototype.newPage = function () {
    this.pdf.addPage('letter', 'portrait');
    this.y = M;
  };

  // Page breaks happen before a block is drawn, never inside one, so a question
  // and its answer box always travel together.
  Doc.prototype.need = function (h) {
    if (this.y + h > PAGE_H - M - px(60)) this.newPage();
  };

  Doc.prototype.wrapped = function (text, size, style, color, width) {
    var p = this.pdf;
    p.setFont(this.font, style); p.setFontSize(size);
    p.setTextColor(color[0], color[1], color[2]);
    return p.splitTextToSize(text, width == null ? CW : width);
  };

  Doc.prototype.drawLines = function (lines, size, style, color, x, lead, width) {
    var p = this.pdf;
    p.setFont(this.font, style); p.setFontSize(size);
    p.setTextColor(color[0], color[1], color[2]);
    for (var i = 0; i < lines.length; i++) {
      this.y += lead;
      p.text(lines[i], x == null ? M : x, this.y);
    }
  };

  /* -------------------------------------------------------------- the blocks */

  Doc.prototype.section = function (number, title, description) {
    var p = this.pdf;
    var badge = px(34);
    var indent = badge + px(14);
    var titleLines = this.wrapped(title, T.secTitle, 'bold', PURPLE, CW - indent);
    var descLines = description ? this.wrapped(description, T.secDesc, 'normal', GREY, CW - indent) : [];
    this.need(px(20) + titleLines.length * T.secTitle * 1.3 +
              descLines.length * T.secDesc * 1.35 + px(24));

    this.y += px(20);
    var top = this.y;
    if (number) {
      p.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
      p.roundedRect(M, top, badge, badge, px(8), px(8), 'F');
      p.setFont(this.font, 'bold'); p.setFontSize(px(16));
      p.setTextColor(255, 255, 255);
      p.text(String(number), M + badge / 2, top + badge / 2 + px(6), { align: 'center' });
    }
    var x = number ? M + indent : M;
    this.y = top - px(2);
    this.drawLines(titleLines, T.secTitle, 'bold', PURPLE, x, T.secTitle * 1.3, CW - indent);
    if (descLines.length) {
      this.drawLines(descLines, T.secDesc, 'normal', GREY, x, T.secDesc * 1.35, CW - indent);
    }
    this.y += px(14);
    p.setDrawColor(LINE[0], LINE[1], LINE[2]); p.setLineWidth(0.6);
    p.line(M, this.y, PAGE_W - M, this.y);
    this.y += px(8);
  };

  Doc.prototype.label = function (text, hint) {
    var labelLines = this.wrapped(text, T.label, 'bold', INK, CW);
    // No italic face is bundled, so the hint leans on colour and size instead
    // of a synthesised slant.
    var hintLines = hint ? this.wrapped(hint, T.hint, 'normal', GREY, CW) : [];
    this.need(labelLines.length * T.label * 1.35 + hintLines.length * T.hint * 1.3 + px(70));
    this.y += px(20);
    this.drawLines(labelLines, T.label, 'bold', INK, M, T.label * 1.35, CW);
    if (hintLines.length) this.drawLines(hintLines, T.hint, 'normal', GREY, M, T.hint * 1.3, CW);
    this.y += px(8);
  };

  // A visible box drawn by hand, with a borderless form field laid over it.
  // Left to itself, a jsPDF text field is invisible until clicked; this way the
  // box reads as a box on paper and as a field on screen.
  Doc.prototype.textField = function (name, value, height, multiline) {
    var p = this.pdf;
    this.need(height + px(16));
    var top = this.y;
    p.setFillColor(FIELD_BG[0], FIELD_BG[1], FIELD_BG[2]);
    p.setDrawColor(LINE[0], LINE[1], LINE[2]); p.setLineWidth(0.8);
    p.roundedRect(M, top, CW, height, px(10), px(10), 'FD');

    var f = new window.jspdf.AcroFormTextField();
    f.fieldName = fieldName(name, this.used);
    f.Rect = [M + px(4), top + px(4), CW - px(8), height - px(8)];
    f.multiline = !!multiline;
    f.fontSize = T.field;
    f.color = '#111111';
    if (value) { f.value = value; f.V = value; f.DV = value; }
    p.addField(f);

    this.y = top + height + px(8);
  };

  Doc.prototype.optionRow = function (kind, name, value, labelText, checked, radioGroup) {
    var p = this.pdf;
    var size = px(20);                 // .checkbox-item input is 20px
    var gap = px(14);
    var textX = M + size + gap;
    var lines = this.wrapped(labelText, T.option, 'normal', INK, CW - (size + gap));
    var lead = T.option * 1.35;
    var rowH = Math.max(size + px(8), lines.length * lead + px(6));
    this.need(rowH);

    var top = this.y + px(3);
    p.setFillColor(255, 255, 255);
    p.setDrawColor(90, 95, 110); p.setLineWidth(0.7);
    if (kind === 'radio') p.circle(M + size / 2, top + size / 2, size / 2, 'FD');
    else p.roundedRect(M, top, size, size, px(4), px(4), 'FD');

    if (kind === 'radio' && radioGroup) {
      var opt = radioGroup.createOption(value);
      opt.Rect = [M, top, size, size];
      opt.AS = checked ? '/' + value : '/Off';
      opt.appearanceState = checked ? value : 'Off';
    } else {
      var cb = new window.jspdf.AcroFormCheckBox();
      cb.fieldName = fieldName(name + '_' + value, this.used);
      cb.Rect = [M, top, size, size];
      cb.appearanceState = checked ? 'On' : 'Off';
      cb.value = checked ? 'On' : 'Off';
      p.addField(cb);
    }

    var baseline = this.y;
    p.setFont(this.font, 'normal'); p.setFontSize(T.option);
    p.setTextColor(INK[0], INK[1], INK[2]);
    for (var i = 0; i < lines.length; i++) {
      p.text(lines[i], textX, baseline + size * 0.78 + i * lead);
    }
    this.y += rowH;
  };

  Doc.prototype.numberedField = function (num, name, value) {
    var p = this.pdf;
    var h = px(52);
    var r = px(13);
    this.need(h + px(12));
    var top = this.y;
    p.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
    p.circle(M + r, top + h / 2, r, 'F');
    p.setFont(this.font, 'bold'); p.setFontSize(T.option);
    p.setTextColor(255, 255, 255);
    p.text(String(num), M + r, top + h / 2 + T.option * 0.35, { align: 'center' });

    var fx = M + r * 2 + px(10), fw = CW - (r * 2 + px(10));
    p.setFillColor(FIELD_BG[0], FIELD_BG[1], FIELD_BG[2]);
    p.setDrawColor(LINE[0], LINE[1], LINE[2]); p.setLineWidth(0.8);
    p.roundedRect(fx, top, fw, h, px(10), px(10), 'FD');

    var f = new window.jspdf.AcroFormTextField();
    f.fieldName = fieldName(name, this.used);
    f.Rect = [fx + px(4), top + px(4), fw - px(8), h - px(8)];
    f.fontSize = T.field;
    f.color = '#111111';
    if (value) { f.value = value; f.V = value; f.DV = value; }
    p.addField(f);

    this.y = top + h + px(12);
  };

  Doc.prototype.footers = function () {
    var p = this.pdf;
    var n = p.internal.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      p.setPage(i);
      p.setFont(this.font, 'normal'); p.setFontSize(T.docMeta);
      p.setTextColor(GREY[0], GREY[1], GREY[2]);
      p.text('Georgia Social Impact Collaborative', M, PAGE_H - px(40));
      p.text('Page ' + i + ' of ' + n, PAGE_W - M, PAGE_H - px(40), { align: 'right' });
    }
  };

  /* ------------------------------------------------------------- the walker */

  // A question and its options belong together: a page that ends between
  // "Select all that apply" and the boxes reads as a mistake. The whole block
  // is measured first and the break taken before it, unless the block is
  // taller than a page can hold, in which case it has to flow.
  function reserveBlock(doc, group, label, hint) {
    var h = 0;
    if (label) h += doc.wrapped(label, T.label, 'bold', INK, CW).length * T.label * 1.35 + px(20);
    if (hint) h += doc.wrapped(hint, T.hint, 'normal', GREY, CW).length * T.hint * 1.3;

    var items = group.querySelectorAll('.checkbox-item, .radio-item');
    if (items.length) {
      var size = px(20), gap = px(14), lead = T.option * 1.35;
      Array.prototype.forEach.call(items, function (item) {
        var t = txt(item.querySelector('.checkbox-label, .radio-label')) || txt(item);
        var lines = doc.wrapped(t, T.option, 'normal', INK, CW - (size + gap)).length;
        h += Math.max(size + px(8), lines * lead + px(6));
      });
    }

    var ta = group.querySelector('textarea');
    if (ta) h += px(ta.classList.contains('small') ? 80 : 120) + px(16);

    var rows = group.querySelectorAll('.action-item-row');
    if (rows.length) h += rows.length * (px(52) + px(12));
    else if (!ta && !items.length && group.querySelector('input[type="text"]')) h += px(52) + px(16);

    var usable = PAGE_H - M * 2 - px(60);
    if (h > 0 && h < usable) doc.need(h);
  }

  function renderGroup(doc, group) {
    var labelEl = group.querySelector('.form-label');
    var hintEl = group.querySelector('.form-hint');
    var label = txt(labelEl);
    reserveBlock(doc, group, label, txt(hintEl));
    if (label) doc.label(label, txt(hintEl));

    var ta = group.querySelector('textarea');
    if (ta) {
      var h = px(ta.classList.contains('small') ? 80 : 120);  // CSS min-heights
      doc.textField(ta.name || ta.id || 'answer', ta.value, h, true);
      return;
    }

    var checkGroup = group.querySelector('.checkbox-group');
    if (checkGroup) {
      var items = checkGroup.querySelectorAll('.checkbox-item');
      Array.prototype.forEach.call(items, function (item) {
        var input = item.querySelector('input[type="checkbox"]');
        if (!input) return;
        doc.optionRow('check', input.name || input.id || 'option',
          input.value || 'on', txt(item.querySelector('.checkbox-label')) || txt(item),
          input.checked);
      });
      doc.y += 4;
      return;
    }

    var radioGroupEl = group.querySelector('.radio-group');
    if (radioGroupEl) {
      var radios = radioGroupEl.querySelectorAll('.radio-item');
      var first = radioGroupEl.querySelector('input[type="radio"]');
      var rg = null;
      if (first) {
        // One AcroForm radio group holds every option, which is what makes the
        // options mutually exclusive in the reader.
        rg = new window.jspdf.AcroFormRadioButton();
        rg.fieldName = fieldName(first.name || first.id || 'choice', doc.used);
        var chosen = radioGroupEl.querySelector('input[type="radio"]:checked');
        rg.value = chosen ? chosen.value : 'Off';
        doc.pdf.addField(rg);
      }
      Array.prototype.forEach.call(radios, function (item) {
        var input = item.querySelector('input[type="radio"]');
        if (!input) return;
        doc.optionRow('radio', input.name, input.value,
          txt(item.querySelector('.radio-label')) || txt(item), input.checked, rg);
      });
      doc.y += 4;
      return;
    }

    var rows = group.querySelectorAll('.action-item-row');
    if (rows.length) {
      Array.prototype.forEach.call(rows, function (row, i) {
        var input = row.querySelector('input[type="text"]');
        if (!input) return;
        doc.numberedField(txt(row.querySelector('.action-item-number')) || (i + 1),
          input.name || input.id || 'action' + (i + 1), input.value);
      });
      doc.y += 4;
      return;
    }

    var text = group.querySelector('input[type="text"]');
    if (text) doc.textField(text.name || text.id || 'answer', text.value, px(52), false);
  }

  function save(root, opts) {
    opts = opts || {};
    root = root || document;
    var title = opts.title || (document.title || 'GSIC Worksheet').trim();

    return ensureLibs().then(function () {
      var doc = new Doc(window.jspdf.jsPDF, title, opts.subtitle || '');

      var sections = root.querySelectorAll('.section');
      if (!sections.length) throw new Error('No worksheet sections were found on the page.');

      Array.prototype.forEach.call(sections, function (sec) {
        doc.section(
          txt(sec.querySelector('.section-number')),
          txt(sec.querySelector('.section-title')),
          txt(sec.querySelector('.section-description'))
        );
        var groups = sec.querySelectorAll('.form-group');
        Array.prototype.forEach.call(groups, function (g) { renderGroup(doc, g); });
      });

      doc.footers();
      doc.pdf.save((opts.fileName || 'GSIC-Worksheet') + '-' + today() + '.pdf');
      return doc.pdf;
    });
  }

  window.GSICFormPdf = { save: save };
})();
