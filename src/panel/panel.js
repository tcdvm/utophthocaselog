// ---------------------------------------------------------------------------
// panel.js — the side panel's brain.
//
// There are two "views" (dashboard and the case form) living in one HTML file;
// switching views just means hiding one and showing the other. That is why the
// panel never flickers or reloads the way a normal web page does.
// ---------------------------------------------------------------------------

import { CHIEF_AREAS, PROCEDURE_LEVELS, SPECIES, SCHOOLS, GRAD_TERMS, gradYears, areaShort } from './taxonomy.js';
import * as store from './store.js';
import { renderRadar, animateRadar } from './radar.js';
import { ACHIEVEMENTS, evaluate, nextGoal } from './achievements.js';
import { readPatientFromPage } from './extract.js';
import { toTitleCase } from './text.js';
import { buildCaseLogPdf } from './pdf.js';

const $ = (id) => document.getElementById(id);

let state = null;      // the whole saved log, kept in memory while the panel is open
let editingId = null;  // null when adding, a case id when editing
let highlightId = null;      // a just-saved case, flashed once in the list
const form = { visitType: null, procedureLevel: null, secondary: new Set() };

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function renderDashboard() {
  $('student-name').value = state.studentName || '';
  renderProfile();

  renderRadar($('radar'), CHIEF_AREAS, store.tallyByArea(state.cases));

  const t = store.tallyVisitTypes(state.cases);
  $('stat-new').textContent = t.new;
  $('stat-recheck').textContent = t.recheck;
  $('stat-proc').textContent = t.procedures;

  $('case-count').textContent = state.cases.length
    ? `${state.cases.length} case${state.cases.length === 1 ? '' : 's'}`
    : '';

  renderCaseList();
  renderBadges();
}

// ---------------------------------------------------------------------------
// The student's own details — set once at the start of a rotation, then left
// alone. They appear on the report so a service chief knows whose log this is.
// ---------------------------------------------------------------------------

const PROFILE_FIELDS = [
  { el: 'p-school', key: 'school',   placeholder: 'School', options: () => SCHOOLS.map((s) => [s.id, s.label]) },
  { el: 'p-term',   key: 'gradTerm', placeholder: 'Term',   options: () => GRAD_TERMS.map((t) => [t, t]) },
  { el: 'p-year',   key: 'gradYear', placeholder: 'Year',   options: () => gradYears().map((y) => [y, y]) },
];

function buildProfileControls() {
  for (const field of PROFILE_FIELDS) {
    const select = $(field.el);
    select.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = field.placeholder;
    select.appendChild(blank);
    for (const [value, label] of field.options()) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      select.appendChild(o);
    }
    select.addEventListener('change', async (e) => {
      state = await store.setProfile({ [field.key]: e.target.value });
      renderProfile();
    });
  }
}

function renderProfile() {
  for (const field of PROFILE_FIELDS) {
    const select = $(field.el);
    const value = state[field.key] || '';
    ensureOption(select, value);
    select.value = value;
    select.classList.toggle('set', Boolean(value));
  }
}

function renderCaseList() {
  const host = $('case-list');
  host.innerHTML = '';

  if (!state.cases.length) {
    const p = document.createElement('div');
    p.className = 'empty-note';
    p.textContent = 'No cases yet. Open a patient in ezyVet and press Import case.';
    host.appendChild(p);
    return;
  }

  const list = document.createElement('div');
  list.className = 'case-list';

  // Newest first; the store already unshifts, but sort defensively.
  const sorted = [...state.cases].sort((a, b) => (b.dateSeen || '').localeCompare(a.dateSeen || ''));

  for (const c of sorted) {
    const row = document.createElement('button');
    row.className = `case-row${c.id === highlightId ? ' just-added' : ''}`;
    row.type = 'button';

    const top = document.createElement('div');
    top.className = 'case-row-top';
    const name = document.createElement('span');
    name.className = 'case-patient';
    // textContent, never innerHTML — a patient name is data, never markup.
    name.textContent = c.patientName || 'Unnamed patient';
    const date = document.createElement('span');
    date.className = 'case-date';
    date.textContent = formatDate(c.dateSeen);
    top.append(name, date);

    const bottom = document.createElement('div');
    bottom.className = 'case-row-bottom';
    const area = document.createElement('span');
    area.className = 'tag';
    area.textContent = areaShort(c.chiefArea);
    bottom.appendChild(area);
    if (c.visitType) bottom.appendChild(tag(c.visitType === 'new' ? 'New' : 'Recheck', true));
    if (c.procedure) bottom.appendChild(tag('Procedure', true));
    if ((c.secondaryAreas || []).length) {
      const extra = document.createElement('span');
      extra.textContent = `+${c.secondaryAreas.length}`;
      bottom.appendChild(extra);
    }

    row.append(top, bottom);
    row.addEventListener('click', () => openForm({ mode: 'edit', caseRecord: c }));
    list.appendChild(row);
  }

  host.appendChild(list);
}

function tag(text, plain = false) {
  const s = document.createElement('span');
  s.className = plain ? 'tag tag-plain' : 'tag';
  s.textContent = text;
  return s;
}

function badgeEl(a, earned, state) {
  const el = document.createElement('span');
  el.className = `badge ${earned ? 'earned' : 'locked'}`;
  el.title = a.hint;
  const ico = document.createElement('span');
  ico.className = 'ico';
  ico.textContent = a.icon;
  const label = document.createElement('span');
  label.textContent = a.label;
  el.append(ico, label);
  // Locked goals with measurable progress say how far along they are, so the
  // tray shows a path rather than a wall of grey.
  if (!earned && typeof a.progress === 'function') {
    const p = a.progress(state);
    const prog = document.createElement('span');
    prog.className = 'progress';
    prog.textContent = `${p.have}/${p.need}`;
    el.appendChild(prog);
  }
  return el;
}

function renderBadges() {
  const earned = new Set(evaluate(state).earned);
  const host = $('badges');
  host.innerHTML = '';
  for (const a of ACHIEVEMENTS) host.appendChild(badgeEl(a, earned.has(a.id), state));
  $('badge-count').textContent = `${ACHIEVEMENTS.filter((a) => earned.has(a.id)).length}/${ACHIEVEMENTS.length}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}/${String(y).slice(2)}`;
}

// ---------------------------------------------------------------------------
// The case form
// ---------------------------------------------------------------------------

/**
 * Makes sure a select can actually show `value`, adding it as an option if the
 * offered list does not contain it. Used for species (ezyVet may report one we
 * do not list) and for a graduating year that has scrolled out of range. Without
 * this, assigning an unknown value silently leaves the select blank.
 */
function ensureOption(select, value) {
  if (!value) return;
  if (Array.from(select.options).some((o) => o.value === value)) return;
  const o = document.createElement('option');
  o.value = value;
  o.textContent = value;
  select.appendChild(o);
}

function buildFormControls() {
  // Species is a short, known list, so it is a proper dropdown rather than a
  // text box with type-ahead hints. A datalist filters its suggestions by what
  // is already typed, which meant that reopening a saved case showed a list
  // containing only the value already in the field.
  const species = $('f-species');
  species.innerHTML = '<option value="">Species</option>';
  for (const name of SPECIES) {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    species.appendChild(o);
  }

  // Chief area dropdown
  const chief = $('f-chief');
  chief.innerHTML = '<option value="">Select one…</option>';
  for (const a of CHIEF_AREAS) {
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = a.label;
    chief.appendChild(o);
  }
  chief.addEventListener('change', renderSecondaryChips);

  // Procedure involvement levels
  const levels = $('procedure-levels');
  levels.innerHTML = '';
  for (const l of PROCEDURE_LEVELS) {
    const line = document.createElement('label');
    line.className = 'radio-line';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'proc-level';
    input.value = l.id;
    input.addEventListener('change', () => { form.procedureLevel = l.id; });
    const text = document.createElement('span');
    text.textContent = l.label;
    line.append(input, text);
    levels.appendChild(line);
  }

  // New / Recheck are mutually exclusive, and clicking the active one clears it.
  $('t-new').addEventListener('click', () => setVisitType('new'));
  $('t-recheck').addEventListener('click', () => setVisitType('recheck'));

  $('f-procedure').addEventListener('change', (e) => {
    $('procedure-levels').classList.toggle('hidden', !e.target.checked);
    if (!e.target.checked) {
      form.procedureLevel = null;
      for (const r of levels.querySelectorAll('input')) r.checked = false;
    }
  });
}

function setVisitType(type) {
  form.visitType = form.visitType === type ? null : type;
  $('t-new').setAttribute('aria-pressed', String(form.visitType === 'new'));
  $('t-recheck').setAttribute('aria-pressed', String(form.visitType === 'recheck'));
}

function renderSecondaryChips() {
  const host = $('secondary-chips');
  const chief = $('f-chief').value;
  host.innerHTML = '';
  for (const a of CHIEF_AREAS) {
    if (a.id === chief) continue;              // the chief problem cannot also be secondary
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = a.short;
    b.title = a.label;
    b.setAttribute('aria-pressed', String(form.secondary.has(a.id)));
    b.addEventListener('click', () => {
      if (form.secondary.has(a.id)) form.secondary.delete(a.id);
      else form.secondary.add(a.id);
      b.setAttribute('aria-pressed', String(form.secondary.has(a.id)));
    });
    host.appendChild(b);
  }
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @param {object} opts
 *   mode: 'add' | 'edit'
 *   caseRecord: existing case when editing
 *   prefill: fields read from the ezyVet page when adding
 */
function openForm({ mode = 'add', caseRecord = null, prefill = null } = {}) {
  editingId = mode === 'edit' ? caseRecord.id : null;
  form.visitType = null;
  form.procedureLevel = null;
  form.secondary = new Set();

  const src = caseRecord || prefill || {};

  $('form-title').textContent = mode === 'edit' ? 'Edit case' : 'Add case';
  $('btn-save').textContent = mode === 'edit' ? 'Save changes' : 'Save case';
  $('btn-delete').classList.toggle('hidden', mode !== 'edit');
  $('autofill-note').classList.toggle('hidden', !(prefill && prefill.autofilled));
  $('diag-note').classList.add('hidden');

  $('f-date').value = src.dateSeen || todayISO();
  $('f-name').value = src.patientName || '';
  ensureOption($('f-species'), src.species);
  $('f-species').value = src.species || '';
  $('f-breed').value = src.breed || '';
  $('f-sex').value = src.sex || '';
  $('f-age').value = src.age || '';
  $('f-summary').value = src.summary || '';
  $('f-chief').value = src.chiefArea || '';

  if (src.visitType) setVisitType(src.visitType);
  else { $('t-new').setAttribute('aria-pressed', 'false'); $('t-recheck').setAttribute('aria-pressed', 'false'); }

  const hasProc = Boolean(src.procedure);
  $('f-procedure').checked = hasProc;
  $('procedure-levels').classList.toggle('hidden', !hasProc);
  for (const r of $('procedure-levels').querySelectorAll('input')) {
    r.checked = hasProc && src.procedure.level === r.value;
  }
  form.procedureLevel = hasProc ? src.procedure.level : null;

  for (const s of src.secondaryAreas || []) form.secondary.add(s);
  renderSecondaryChips();

  $('form-error').textContent = '';
  showView('form');
  $('f-name').focus();
}

function readForm() {
  return {
    dateSeen: $('f-date').value,
    patientName: toTitleCase($('f-name').value),
    species: $('f-species').value.trim(),
    breed: toTitleCase($('f-breed').value),
    sex: $('f-sex').value,
    age: $('f-age').value.trim(),
    visitType: form.visitType,
    procedure: $('f-procedure').checked ? { level: form.procedureLevel } : null,
    chiefArea: $('f-chief').value,
    secondaryAreas: [...form.secondary],
    summary: $('f-summary').value.trim(),
  };
}

function validate(data) {
  if (!data.dateSeen) return 'Pick the date you saw this case.';
  if (!data.chiefArea) return 'Choose a chief area or disease of interest.';
  if (!data.visitType && !data.procedure) return 'Mark this as New, Recheck, or a Procedure.';
  if (data.procedure && !data.procedure.level) return 'Choose your level of involvement in the procedure.';
  return null;
}

async function handleSave() {
  const data = readForm();
  const problem = validate(data);
  if (problem) { $('form-error').textContent = problem; return; }

  const before = new Set(evaluate(state).earned);
  const chartBefore = store.tallyByArea(state.cases);   // the shape to grow from

  if (editingId) state = await store.updateCase(editingId, data);
  else state = await store.addCase(data);

  const savedCase = editingId
    ? state.cases.find((c) => c.id === editingId)
    : state.cases[0];

  state = await syncAchievements();
  highlightId = savedCase ? savedCase.id : null;
  renderDashboard();
  showView('dashboard');

  // Three pieces of feedback that the case landed: the chart springs into its
  // new shape with a halo on the axis that changed, the new row pulses in the
  // list, and — only if that row is off-screen — the list scrolls just enough
  // to show it. None of them block.
  animateRadar($('radar'), CHIEF_AREAS, chartBefore, store.tallyByArea(state.cases));

  if (highlightId) {
    const id = highlightId;

    // After the chart has finished, bring the new row into view. `block:
    // 'nearest'` does nothing when the row is already visible, so this never
    // yanks the panel around for no reason.
    setTimeout(() => {
      if (highlightId !== id) return;
      const row = document.querySelector('.case-row.just-added');
      if (!row) return;
      const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      row.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' });
    }, 950);

    setTimeout(() => {
      if (highlightId !== id) return;      // another save happened meanwhile
      highlightId = null;
      renderCaseList();
    }, 3400);
  }

  showUnlocks(evaluate(state).earned.filter((id) => !before.has(id)));
}

/** Records any newly earned achievements so they are not re-announced. */
async function syncAchievements() {
  const { earned, newly } = evaluate(state);
  if (!newly.length) return state;
  state.unlockedAchievements = earned;
  return store.saveState(state);
}

async function handleDelete() {
  if (!editingId) return;
  state = await store.deleteCase(editingId);
  renderDashboard();
  showView('dashboard');
}

// ---------------------------------------------------------------------------
// Reading the open patient out of ezyVet
//
// This is the only moment the extension touches the ezyVet page. Chrome sends
// readPatientFromPage() into the tab, runs it once, and hands back the five
// fields. Nothing is installed in the page and nothing keeps running there.
// ---------------------------------------------------------------------------

async function importFromEzyvet() {
  const btn = $('btn-import');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Reading page…';

  let result = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab');
    const runs = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readPatientFromPage,
    });
    result = runs && runs[0] ? runs[0].result : null;
  } catch (err) {
    // Almost always means the active tab is not an ezyVet page, so the
    // extension has no permission to read it. That is the system working.
    result = null;
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }

  if (result && result.ok) {
    openForm({
      mode: 'add',
      prefill: {
        ...result.fields,
        // Tidied here rather than after saving, so the form shows exactly what
        // will be stored and the student can correct it if the guess is wrong.
        patientName: toTitleCase(result.fields.patientName),
        breed: toTitleCase(result.fields.breed),
        autofilled: true,
      },
    });
    return;
  }

  // Every failure path ends the same way: an empty form the student can type
  // into. The tool never blocks on not being able to read the page.
  openForm({ mode: 'add' });
  if (result) {
    $('diag-note').classList.remove('hidden');
    flash(result.reason || 'Could not read the signalment.');
  } else {
    flash('Open an ezyVet patient record first, or type the details in.');
  }
}

// ---------------------------------------------------------------------------
// Exporting
//
// One click, one file in the Downloads folder. The PDF is written byte by byte
// by pdf.js — no library, no print dialog, no choosing a destination.
// ---------------------------------------------------------------------------

function exportFilename(state) {
  const who = (state.studentName || '').replace(/[^\w .'-]/g, '').trim();
  const today = todayISO();
  return who ? `Ophtho Case Log - ${who} - ${today}.pdf` : `Ophtho Case Log - ${today}.pdf`;
}

function exportPdf() {
  if (!state.cases.length) { flash('Log a case first — the report would be empty.'); return; }
  let url = null;
  try {
    const bytes = buildCaseLogPdf(state);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFilename(state);
    document.body.appendChild(link);
    link.click();
    link.remove();
    flash(`Downloaded ${link.download}`);
  } catch (err) {
    flash('Could not build the PDF report.');
  } finally {
    // Give the download a moment to start before releasing the blob.
    if (url) setTimeout(() => URL.revokeObjectURL(url), 20000);
  }
}

// ---------------------------------------------------------------------------
// The unlock moment
//
// A badge appearing silently in a tray is not a reward. This stops the panel,
// shows what was earned and what it took, and points at the next goal.
// Several can be earned at once, so they are shown one after another.
// ---------------------------------------------------------------------------

function showUnlocks(ids, onDone) {
  if (!ids || !ids.length) { if (onDone) onDone(); return; }

  const [first, ...rest] = ids;
  const a = ACHIEVEMENTS.find((x) => x.id === first);
  if (!a) return showUnlocks(rest, onDone);

  $('unlock-icon').textContent = a.icon;
  $('unlock-name').textContent = a.label;
  $('unlock-hint').textContent = a.hint;

  const next = nextGoal(state, ids);
  $('unlock-next').textContent = next
    ? next.progress
      ? `Next: ${next.achievement.label} — ${next.progress.have} of ${next.progress.need}`
      : `Next: ${next.achievement.hint}`
    : 'Every goal earned. That is the whole board.';

  $('unlock').classList.remove('hidden');
  // Assigned rather than added, so repeated unlocks never stack listeners.
  $('unlock-close').onclick = () => {
    $('unlock').classList.add('hidden');
    showUnlocks(rest, onDone);
  };
}

// ---------------------------------------------------------------------------
// View switching + small helpers
// ---------------------------------------------------------------------------

function showView(name) {
  $('view-dashboard').classList.toggle('hidden', name !== 'dashboard');
  $('view-form').classList.toggle('hidden', name !== 'form');
  window.scrollTo(0, 0);
}

let flashTimer = null;
function flash(message) {
  let el = $('flash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'flash';
    el.style.cssText =
      'position:fixed;left:10px;right:10px;bottom:10px;background:var(--accent);color:var(--on-accent);' +
      'padding:9px 12px;border-radius:10px;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,.2);z-index:9';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.style.display = 'none'; }, 3200);
}

async function clearAll() {
  if (!confirm('Delete every case in this log? This cannot be undone.')) return;
  await chrome.storage.local.clear();
  state = await store.loadState();
  renderDashboard();
  flash('Case log cleared');
}

// ---------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------

async function init() {
  state = await store.loadState();
  buildFormControls();
  buildProfileControls();
  renderDashboard();

  $('btn-import').addEventListener('click', importFromEzyvet);
  $('btn-back').addEventListener('click', () => showView('dashboard'));
  $('btn-save').addEventListener('click', handleSave);
  $('btn-delete').addEventListener('click', handleDelete);
  $('btn-clear').addEventListener('click', clearAll);
  $('btn-export').addEventListener('click', exportPdf);

  let nameTimer = null;
  $('student-name').addEventListener('input', (e) => {
    clearTimeout(nameTimer);
    const v = e.target.value;
    nameTimer = setTimeout(() => store.setProfile({ studentName: v }).then((s) => { state = s; }), 400);
  });
}

init();
