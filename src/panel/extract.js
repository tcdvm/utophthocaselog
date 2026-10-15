// ---------------------------------------------------------------------------
// extract.js — the only code in this extension that ever touches an ezyVet page.
//
// Three rules govern this file:
//
//   1. It runs ONLY when the student presses "Import case". There is no
//      content_scripts entry in the manifest, so nothing runs on its own.
//   2. It reads ONE element — the patient sidebar of the open record — and
//      never the rest of the page. The same page contains the day's whole
//      appointment grid, with owner and patient IDs for every booking. Scoping
//      to one element is what keeps all of that out of reach.
//   3. It returns a FIXED list of five fields. It is not a "read the page"
//      function that we then filter; it cannot return anything else.
//
// Deliberately NOT read: the record tab label. It looks like the obvious place
// to find a patient name — it reads  1204311 - "Fluffy" KUPRITZ (09-09-2026) —
// but that trailing surname belongs to the client, not the animal.
// ---------------------------------------------------------------------------

/**
 * This whole function is sent into the ezyVet page by chrome.scripting and run
 * there. That means it must be entirely self-contained: it cannot call anything
 * defined outside itself, which is why the helpers live inside it.
 */
export function readPatientFromPage() {
  // --- helpers -------------------------------------------------------------

  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  // --- find the sidebar belonging to the OPEN record -----------------------
  //
  // ezyVet keeps several records open as tabs. The focused tab is #rtab7 and
  // its patient sidebar is #patientSideBar7 — the trailing number links them.
  // If that fails, fall back to whichever patient sidebar is actually visible.

  const findSidebar = () => {
    const tab = document.querySelector('[role="tab"].focusedRecordTab, .focusedRecordTab');
    const n = tab && tab.id ? (tab.id.match(/(\d+)$/) || [])[1] : null;
    if (n) {
      const byTab = document.getElementById('patientSideBar' + n);
      if (byTab) return { el: byTab, how: 'focused-tab' };
    }
    const visible = [...document.querySelectorAll('[id^="patientSideBar"]')]
      .find((el) => el.offsetParent !== null);
    if (visible) return { el: visible, how: 'visible-sidebar' };
    return { el: null, how: 'none' };
  };

  const { el: sidebar, how } = findSidebar();

  if (!sidebar) {
    return {
      ok: false,
      reason: 'No patient record appears to be open in ezyVet.',
      fields: null,
    };
  }

  // --- read that one element ----------------------------------------------
  // innerText gives us what a human sees, laid out in lines. We cap both the
  // number of lines and their length so a surprise layout change can never turn
  // this into a bulk page reader.

  // NOTE: split into lines FIRST, then tidy each one. Tidying first would
  // collapse the newlines and fuse the whole sidebar into a single string —
  // which is exactly the bug the offline tests caught.
  const raw = String(sidebar.innerText || sidebar.textContent || '');

  const candidates = [];
  for (const rawLine of raw.split(/\r?\n+/).slice(0, 20)) {
    const line = clean(rawLine);
    if (!line) continue;
    candidates.push(line.slice(0, 120));
    // Some layouts put several facts on one visual line, separated by wide gaps.
    for (const piece of rawLine.split(/\s{2,}|·|\|/)) {
      const p = clean(piece);
      if (p && p !== line) candidates.push(p.slice(0, 120));
    }
  }

  // --- parse ---------------------------------------------------------------
  // Each field is a list of strategies tried in order. If ezyVet changes its
  // layout, an earlier strategy stops matching and a later one usually still
  // works — and if none do, the field simply comes back empty and the student
  // types it. Nothing here throws, and nothing blocks saving a case.

  const out = { patientName: '', sex: '', species: '', breed: '', age: '' };

  // Name and sex: the sidebar's first span reads  Name (FS)
  const firstSpan = sidebar.querySelector(':scope > span, span');
  const nameSexRe = /^(.+?)\s*\(\s*(M|F|MN|FS|MC|FN|N|U|Unknown)\s*\)\s*$/i;
  for (const text of [firstSpan ? clean(firstSpan.innerText || firstSpan.textContent) : '', ...candidates]) {
    const m = text && text.match(nameSexRe);
    if (m) {
      out.patientName = clean(m[1]).replace(/^["']|["']$/g, '');
      out.sex = m[2].toUpperCase();
      break;
    }
  }
  // If no "(SEX)" was present, take the first span as the name on its own.
  if (!out.patientName && firstSpan) {
    const t = clean(firstSpan.innerText || firstSpan.textContent);
    if (t && t.length <= 40 && !/\d{2}[-/]\d{2}/.test(t)) out.patientName = t.replace(/^["']|["']$/g, '');
  }

  // Species and breed:  Canine (Dog) - Cavapoo
  const speciesBreedRe = /^([A-Za-z][A-Za-z ]{2,20}?)\s*\(([^)]{1,20})\)\s*[-–—]\s*(.{1,40})$/;
  const speciesOnlyRe = /^([A-Za-z][A-Za-z ]{2,20}?)\s*\(([^)]{1,20})\)\s*$/;
  for (const text of candidates) {
    const m = text.match(speciesBreedRe);
    if (m) {
      out.species = clean(m[1]);
      out.breed = clean(m[3]);
      break;
    }
  }
  if (!out.species) {
    for (const text of candidates) {
      const m = text.match(speciesOnlyRe);
      // Guard against re-matching the "Name (FS)" line.
      if (m && !nameSexRe.test(text)) { out.species = clean(m[1]); break; }
    }
  }

  // Age: anything shaped like  9 years 3 months  /  9y 3m  /  9 yr old
  const ageRe = /\b(\d{1,2}\s*(?:y|yr|yrs|year|years)\b(?:\s*\d{1,2}\s*(?:m|mo|mos|month|months)\b)?|\d{1,2}\s*(?:m|mo|mos|month|months)\s*old\b|\d{1,2}\s*(?:w|wk|wks|week|weeks)\b)/i;
  for (const text of candidates) {
    const m = text.match(ageRe);
    if (m) { out.age = clean(m[1]); break; }
  }

  const gotSomething = Boolean(out.patientName || out.species || out.breed || out.age);

  return {
    ok: gotSomething,
    reason: gotSomething ? null : 'Found the patient sidebar but could not read the signalment from it.',
    fields: out,
    how,
  };
}
