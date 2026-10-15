// ---------------------------------------------------------------------------
// pdf.js — writes a PDF file, by hand, with no library.
//
// Why this exists: Chrome's print dialog is a security boundary an extension
// cannot skip, so "print to PDF" always means a dialog and a file picker. The
// alternatives were a debugger permission (which shows students an alarming
// banner) or copying a PDF library into the project. Neither was worth it,
// because a PDF is not a mysterious binary — it is a text format with a
// documented structure, and a report like this one uses a small corner of it.
//
// The shape of a PDF file:
//
//   %PDF-1.4                  a version line
//   1 0 obj … endobj          numbered objects: the catalogue, the page list,
//   2 0 obj … endobj          two fonts, then one page + one content stream
//   …                         for each page
//   xref                      a table of where each object starts, in bytes
//   trailer                   which object is the catalogue
//   %%EOF
//
// A content stream is a tiny drawing language: `m` move, `l` line, `re`
// rectangle, `f` fill, `S` stroke, and BT/Tj/ET to place text.
// ---------------------------------------------------------------------------

import { CHIEF_AREAS, areaLabel, areaShort, levelLabel, schoolFull } from './taxonomy.js';
import { tallyByArea, tallyVisitTypes } from './store.js';
import { ACHIEVEMENTS, evaluate } from './achievements.js';

// --- page geometry (points; 72 per inch, so US Letter is 612 x 792) --------

// US Letter, landscape. The case table is what the report is for, and seven
// columns of clinical text need width far more than they need height.
const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;   // 712
const PAGE_BOTTOM = PAGE_H - 46;

// --- colours, as "red green blue" each 0..1 -------------------------------

const INK = '0.07 0.14 0.17';
const SOFT = '0.36 0.44 0.48';
const TEAL = '0.10 0.42 0.53';
const TEAL_TINT = '0.85 0.91 0.93';
const RULE = '0.84 0.88 0.90';

// --- Helvetica character widths, in thousandths of the font size ----------
// Needed to wrap text properly: without real widths you either guess and clip,
// or leave so much slack the columns look wrong.

const HELV = [
  278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
  1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
  667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
  333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
  556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,
];

const charWidth = (code) => (code >= 32 && code <= 126 ? HELV[code - 32] : 556);

// Bold Helvetica is a little wider; a flat factor is close enough for wrapping
// and avoids carrying a second 95-number table.
const textWidth = (str, size, bold) => {
  let w = 0;
  for (let i = 0; i < str.length; i++) w += charWidth(str.charCodeAt(i));
  return (w / 1000) * size * (bold ? 1.06 : 1);
};

// --- turning JavaScript text into something a PDF accepts -----------------
// PDF strings live in parentheses, so parentheses and backslashes are escaped.
// Anything above plain ASCII is written as an octal escape in WinAnsi encoding,
// which is what a patient called "Léo" needs to survive the trip.

const WINANSI_EXTRA = {
  '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92,
  '“': 0x93, '”': 0x94, '•': 0x95, '…': 0x85,
};

function enc(input) {
  let out = '';
  for (const ch of String(input == null ? '' : input)) {
    if (ch === '\\' || ch === '(' || ch === ')') { out += '\\' + ch; continue; }
    const code = ch.codePointAt(0);
    if (code >= 32 && code <= 126) { out += ch; continue; }
    const mapped = WINANSI_EXTRA[ch] !== undefined ? WINANSI_EXTRA[ch] : (code <= 0xff ? code : null);
    out += mapped === null ? '?' : '\\' + mapped.toString(8).padStart(3, '0');
  }
  return out;
}

const num = (n) => (Math.round(n * 100) / 100).toString();

// ---------------------------------------------------------------------------
// A tiny drawing surface. Y is measured DOWN from the top of the page, because
// that is how humans lay out documents; the conversion to the PDF's
// bottom-left origin happens in one place, here.
// ---------------------------------------------------------------------------

function createDoc() {
  const pages = [];
  let ops = [];

  const flip = (y) => PAGE_H - y;

  const api = {
    get pageCount() { return pages.length + 1; },

    newPage() { pages.push(ops.join('\n')); ops = []; },

    finish() { pages.push(ops.join('\n')); return pages; },

    text(str, x, y, { size = 9, bold = false, color = INK } = {}) {
      const s = String(str == null ? '' : str);
      if (!s) return;
      ops.push(`${color} rg BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf 1 0 0 1 ${num(x)} ${num(flip(y))} Tm (${enc(s)}) Tj ET`);
    },

    textRight(str, xRight, y, opts = {}) {
      const w = textWidth(String(str), opts.size || 9, opts.bold);
      api.text(str, xRight - w, y, opts);
    },

    textCenter(str, xMid, y, opts = {}) {
      const w = textWidth(String(str), opts.size || 9, opts.bold);
      api.text(str, xMid - w / 2, y, opts);
    },

    line(x1, y1, x2, y2, { color = RULE, width = 0.6 } = {}) {
      ops.push(`${color} RG ${num(width)} w ${num(x1)} ${num(flip(y1))} m ${num(x2)} ${num(flip(y2))} l S`);
    },

    rect(x, y, w, h, { stroke = null, fill = null, width = 0.6 } = {}) {
      if (fill) ops.push(`${fill} rg ${num(x)} ${num(flip(y + h))} ${num(w)} ${num(h)} re f`);
      if (stroke) ops.push(`${stroke} RG ${num(width)} w ${num(x)} ${num(flip(y + h))} ${num(w)} ${num(h)} re S`);
    },

    polygon(points, { stroke = null, fill = null, width = 1 } = {}) {
      if (!points.length) return;
      const path = points.map((p, i) => `${num(p.x)} ${num(flip(p.y))} ${i ? 'l' : 'm'}`).join(' ');
      if (fill) ops.push(`${fill} rg ${path} h f`);
      if (stroke) ops.push(`${stroke} RG ${num(width)} w ${path} h S`);
    },

    dot(x, y, r, color) {
      // A small circle drawn with four Bezier curves.
      const k = 0.5523 * r;
      const cy = flip(y);
      ops.push(
        `${color} rg ${num(x + r)} ${num(cy)} m ` +
        `${num(x + r)} ${num(cy + k)} ${num(x + k)} ${num(cy + r)} ${num(x)} ${num(cy + r)} c ` +
        `${num(x - k)} ${num(cy + r)} ${num(x - r)} ${num(cy + k)} ${num(x - r)} ${num(cy)} c ` +
        `${num(x - r)} ${num(cy - k)} ${num(x - k)} ${num(cy - r)} ${num(x)} ${num(cy - r)} c ` +
        `${num(x + k)} ${num(cy - r)} ${num(x + r)} ${num(cy - k)} ${num(x + r)} ${num(cy)} c f`
      );
    },
  };

  return api;
}

// --- word wrapping ---------------------------------------------------------

function wrapText(str, maxWidth, size, bold) {
  // Break points are spaces, and also just after a hyphen or slash — so
  // "Retina / Neuro-ophthalmology" splits at "Neuro-" rather than mid-word.
  const tokens = [];
  // Split on ordinary whitespace only: a no-break space (\u00a0) is left inside
  // a token on purpose, which is how "9 y" is kept from splitting across lines.
  for (const word of String(str == null ? '' : str).split(/[ \t\n\r\f\v]+/).filter(Boolean)) {
    const parts = word.split(/(?<=[-/])/).filter(Boolean);
    parts.forEach((part, i) => tokens.push({ text: part, spaced: i === 0 }));
  }
  if (!tokens.length) return [''];

  const lines = [];
  let line = '';
  for (const tok of tokens) {
    const joiner = line && tok.spaced ? ' ' : '';
    const trial = line + joiner + tok.text;
    if (textWidth(trial, size, bold) <= maxWidth || !line) {
      line = trial;
    } else {
      lines.push(line.trimEnd());
      line = tok.text;
    }
    // A single token wider than the column is hard-broken rather than
    // spilling into the next column.
    while (textWidth(line, size, bold) > maxWidth && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && textWidth(line.slice(0, cut), size, bold) > maxWidth) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}

// --- the radar chart, same geometry as the panel's ------------------------

function drawRadar(doc, cx, cy, radius, counts) {
  const n = CHIEF_AREAS.length;
  const values = CHIEF_AREAS.map((a) => counts[a.id] || 0);
  const scaleMax = Math.max(3, ...values);
  const rings = Math.min(scaleMax, 5);

  const at = (i, r) => {
    const angle = (-90 + (360 / n) * i) * (Math.PI / 180);
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  for (let ring = 1; ring <= rings; ring++) {
    doc.polygon(Array.from({ length: n }, (_, i) => at(i, (radius * ring) / rings)), { stroke: RULE, width: 0.5 });
  }
  for (let i = 0; i < n; i++) {
    const p = at(i, radius);
    doc.line(cx, cy, p.x, p.y, { color: RULE, width: 0.5 });
  }

  const shape = values.map((v, i) => at(i, (radius * v) / scaleMax));
  doc.polygon(shape, { fill: TEAL_TINT });
  doc.polygon(shape, { stroke: TEAL, width: 1.2 });
  values.forEach((v, i) => { if (v > 0) doc.dot(shape[i].x, shape[i].y, 2, TEAL); });

  CHIEF_AREAS.forEach((area, i) => {
    const p = at(i, radius + 13);
    const label = values[i] ? `${area.short} ${values[i]}` : area.short;
    const dx = p.x - cx;
    const opts = { size: 6.5, color: values[i] ? INK : SOFT };
    if (Math.abs(dx) < 10) doc.textCenter(label, p.x, p.y + 2, opts);
    else if (dx > 0) doc.text(label, p.x, p.y + 2, opts);
    else doc.textRight(label, p.x, p.y + 2, opts);
  });
}

// --- the report ------------------------------------------------------------

const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
};

export function buildCaseLogPdf(state) {
  const doc = createDoc();
  const cases = [...state.cases].sort((a, b) => (a.dateSeen || '').localeCompare(b.dateSeen || ''));
  const dates = cases.map((c) => c.dateSeen).filter(Boolean);
  const generated = new Date();

  let y = MARGIN + 12;

  // ---- masthead ----
  doc.text('Ophthalmology Rotation Case Log', MARGIN, y, { size: 15, bold: true });
  y += 15;

  // Line one is who the log belongs to; line two is what is in it. Empty
  // details are left out rather than printed as blanks.
  const graduating = [state.gradTerm, state.gradYear].filter(Boolean).join(' ');
  const who = [
    state.studentName || 'Student name not set',
    state.school ? schoolFull(state.school) : null,
    graduating ? `Graduating ${graduating}` : null,
  ].filter(Boolean).join('   ·   ');
  doc.text(who, MARGIN, y, { size: 9.5, color: INK });
  y += 12;

  const span = dates.length ? `${fmtDate(dates[0])} to ${fmtDate(dates[dates.length - 1])}` : 'No cases logged';
  doc.text(
    `${span}   ·   ${cases.length} case${cases.length === 1 ? '' : 's'}`,
    MARGIN, y, { size: 9, color: SOFT }
  );
  y += 8;
  doc.line(MARGIN, y, PAGE_W - MARGIN, y, { color: TEAL, width: 1.2 });
  y += 24;

  // ---- the summary block, laid out across the page ----
  // Portrait stacked these three; landscape sets the chart beside the counters
  // and the area breakdown, which buys back vertical room for the case table.
  const blockTop = y;
  drawRadar(doc, MARGIN + 105, blockTop + 78, 60, tallyByArea(cases));

  const counts = tallyVisitTypes(cases);
  const tiles = [
    [cases.length, 'Total'],
    [counts.new, 'New'],
    [counts.recheck, 'Recheck'],
    [counts.procedures, 'Procedures'],
  ];
  const tileW = 100, tileGap = 12, tileX0 = MARGIN + 245, tileY = blockTop + 2;
  tiles.forEach(([value, label], i) => {
    const x = tileX0 + i * (tileW + tileGap);
    doc.rect(x, tileY, tileW, 46, { stroke: RULE });
    doc.textCenter(String(value), x + tileW / 2, tileY + 24, { size: 17, bold: true });
    doc.textCenter(label.toUpperCase(), x + tileW / 2, tileY + 37, { size: 6, color: SOFT });
  });

  // ---- breakdown by area, beneath the counters ----
  const areaLeft = tileX0;
  const chiefRight = areaLeft + 300;
  const secondRight = areaLeft + 400;
  let ay = blockTop + 66;

  doc.text('CASES BY CHIEF AREA', areaLeft, ay, { size: 7, bold: true, color: SOFT });
  ay += 12;

  const areaTally = tallyByArea(cases);
  const secondaryTally = {};
  for (const c of cases) for (const s of c.secondaryAreas || []) secondaryTally[s] = (secondaryTally[s] || 0) + 1;

  doc.line(areaLeft, ay, secondRight, ay, { color: INK, width: 1 });
  ay += 10;
  doc.text('AREA OF INTEREST', areaLeft, ay, { size: 6.5, bold: true, color: SOFT });
  doc.textRight('CHIEF', chiefRight, ay, { size: 6.5, bold: true, color: SOFT });
  doc.textRight('SECONDARY', secondRight, ay, { size: 6.5, bold: true, color: SOFT });
  ay += 4;

  for (const area of CHIEF_AREAS) {
    doc.line(areaLeft, ay, secondRight, ay, { color: RULE });
    ay += 10;
    doc.text(area.label, areaLeft, ay, { size: 7.5 });
    doc.textRight(String(areaTally[area.id] || 0), chiefRight, ay, { size: 7.5, bold: true });
    doc.textRight(String(secondaryTally[area.id] || 0), secondRight, ay, { size: 7.5, color: SOFT });
    ay += 3;
  }
  doc.line(areaLeft, ay, secondRight, ay, { color: RULE });

  // ---- achievement summary ----
  // One short line. These milestones reflect the shape of the rotation as much
  // as the student, so they are reported plainly rather than as a score.
  // Sits below whichever of the chart and the table runs longer.
  y = Math.max(blockTop + 176, ay + 18);
  const earnedIds = new Set(evaluate(state).earned);
  const earnedNames = ACHIEVEMENTS.filter((a) => earnedIds.has(a.id)).map((a) => a.label);

  doc.text('PROGRESS', MARGIN, y, { size: 7, bold: true, color: SOFT });
  y += 12;
  const progressLine = earnedNames.length
    ? `${earnedNames.length} of ${ACHIEVEMENTS.length} milestones reached: ${earnedNames.join(', ')}.`
    : 'No milestones reached yet.';
  for (const lineText of wrapText(progressLine, CONTENT_W, 8.5, false)) {
    doc.text(lineText, MARGIN, y, { size: 8.5 });
    y += 11;
  }
  y += 16;

  // ---- case detail table ----
  const COLS = [
    // Widths total exactly CONTENT_W (712). The extra width landscape buys goes
    // mostly to the summary, which is the column that actually holds sentences.
    { key: 'date',      head: 'DATE',       w: 52 },
    { key: 'patient',   head: 'PATIENT',    w: 70 },
    { key: 'signal',    head: 'SIGNALMENT', w: 120 },
    { key: 'type',      head: 'TYPE',       w: 95 },
    { key: 'chief',     head: 'CHIEF AREA', w: 95 },
    { key: 'secondary', head: 'SECONDARY',  w: 70 },
    { key: 'summary',   head: 'SUMMARY',    w: 210 },
  ];
  const SIZE = 7.5;
  const LEADING = 9.5;

  const drawTableHead = () => {
    doc.line(MARGIN, y, PAGE_W - MARGIN, y, { color: INK, width: 1 });
    y += 10;
    let x = MARGIN;
    for (const col of COLS) {
      doc.text(col.head, x, y, { size: 6.5, bold: true, color: SOFT });
      x += col.w;
    }
    y += 4;
  };

  doc.text('CASE DETAIL', MARGIN, y, { size: 7, bold: true, color: SOFT });
  y += 12;
  drawTableHead();

  if (!cases.length) {
    y += 14;
    doc.text('No cases have been logged yet.', MARGIN, y, { size: 8, color: SOFT });
  }

  for (const c of cases) {
    const cells = {
      date: fmtDate(c.dateSeen),
      patient: c.patientName || '—',
      // "9 y" travels as one word so a column edge cannot strand the unit.
      signal: [c.species, c.breed, c.sex, String(c.age || '').replace(/(\d)\s+(?=\S)/g, '$1\u00a0')]
        .filter(Boolean).join(', ') || '—',
      type: [
        c.visitType ? (c.visitType === 'new' ? 'New' : 'Recheck') : null,
        c.procedure ? `Procedure — ${levelLabel(c.procedure.level)}` : null,
      ].filter(Boolean).join('; ') || '—',
      chief: areaLabel(c.chiefArea),
      secondary: (c.secondaryAreas || []).map(areaShort).join(', ') || '—',
      summary: c.summary || '',
    };

    const wrapped = COLS.map((col) => wrapText(cells[col.key], col.w - 6, SIZE, false));
    const rowHeight = Math.max(...wrapped.map((l) => l.length)) * LEADING + 5;

    if (y + rowHeight > PAGE_BOTTOM) {
      doc.line(MARGIN, y, PAGE_W - MARGIN, y, { color: RULE });
      doc.newPage();
      y = MARGIN + 6;
      doc.text('Ophthalmology Rotation Case Log — continued', MARGIN, y, { size: 8, color: SOFT });
      y += 14;
      drawTableHead();
    }

    doc.line(MARGIN, y, PAGE_W - MARGIN, y, { color: RULE });
    y += 10;
    let x = MARGIN;
    wrapped.forEach((lines, i) => {
      lines.forEach((lineText, li) => {
        doc.text(lineText, x, y + li * LEADING, { size: SIZE, bold: i === 1 });
      });
      x += COLS[i].w;
    });
    y += rowHeight - 6;
  }

  doc.line(MARGIN, y, PAGE_W - MARGIN, y, { color: RULE });

  const pages = doc.finish();

  // ---- footer on every page, added once the page count is known ----
  const footer = `Generated ${generated.toLocaleString()} from a local case log. ` +
    `Contains patient name and signalment only — no client details, no medical record numbers.`;
  const footed = pages.map((ops, i) => {
    const parts = [ops];
    const fy = PAGE_H - 30;
    parts.push(`${RULE} RG 0.6 w ${num(MARGIN)} ${num(PAGE_H - fy)} m ${num(PAGE_W - MARGIN)} ${num(PAGE_H - fy)} l S`);
    parts.push(`${SOFT} rg BT /F1 6.5 Tf 1 0 0 1 ${num(MARGIN)} ${num(PAGE_H - fy - 9)} Tm (${enc(footer)}) Tj ET`);
    const label = `Page ${i + 1} of ${pages.length}`;
    const lw = textWidth(label, 6.5, false);
    parts.push(`${SOFT} rg BT /F1 6.5 Tf 1 0 0 1 ${num(PAGE_W - MARGIN - lw)} ${num(PAGE_H - fy - 9)} Tm (${enc(label)}) Tj ET`);
    return parts.join('\n');
  });

  return serialize(footed);
}

// ---------------------------------------------------------------------------
// Assembling the file: objects, then a cross-reference table listing the byte
// offset of each one. That table is why a PDF can be opened at page 400
// without reading pages 1 to 399.
// ---------------------------------------------------------------------------

function serialize(pageStreams) {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };

  const catalogNum = add(null);          // reserved, filled below
  const pagesNum = add(null);
  const fontRegular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  const pageNums = [];
  for (const stream of pageStreams) {
    const contentNum = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageNum = add(
      `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> ` +
      `/Contents ${contentNum} 0 R >>`
    );
    pageNums.push(pageNum);
  }

  objects[catalogNum - 1] = `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`;
  objects[pagesNum - 1] =
    `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageNums.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefAt = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
