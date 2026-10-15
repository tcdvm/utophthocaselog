// ---------------------------------------------------------------------------
// store.js — everything that touches saved data.
//
// Storage is chrome.storage.local: a small database that lives inside this
// Chrome profile on this computer. It is not synced to a Google account, it is
// not sent anywhere, and no other website can read it. There is deliberately no
// networking code in this extension at all.
//
// Every read and write in the whole app goes through this one file, so there is
// exactly one place to audit when asking "what does this thing actually store?"
// ---------------------------------------------------------------------------

const KEY = 'ophthoCaseLog';
const SCHEMA_VERSION = 1;

const emptyState = () => ({
  schemaVersion: SCHEMA_VERSION,
  studentName: '',
  school: '',        // one of SCHOOLS ids
  gradTerm: '',      // Fall | Spring | Summer
  gradYear: '',      // four-digit year as text
  cases: [],
  unlockedAchievements: [],
});

export async function loadState() {
  const bag = await chrome.storage.local.get(KEY);
  const saved = bag[KEY];
  if (!saved) return emptyState();

  // Only known keys survive a load. A field left over from a removed feature is
  // dropped here rather than sitting in storage forever, which keeps the answer
  // to "what does this thing store?" the same as the list in emptyState().
  const base = emptyState();
  const state = { ...base };
  for (const key of Object.keys(base)) {
    if (saved[key] !== undefined) state[key] = saved[key];
  }
  return state;
}

export async function saveState(state) {
  await chrome.storage.local.set({ [KEY]: state });
  return state;
}

// A case record. This object IS the privacy surface of the extension —
// if a field is not listed here, it is never stored.
export function makeCase(input) {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    dateSeen: input.dateSeen,                  // yyyy-mm-dd
    patientName: input.patientName || '',      // pet's name only, no owner, no record number
    species: input.species || '',
    breed: input.breed || '',
    sex: input.sex || '',                      // e.g. FS, MN, F, M
    age: input.age || '',                      // free text, e.g. "9 years"
    visitType: input.visitType || null,        // 'new' | 'recheck' | null
    procedure: input.procedure || null,        // null | { level: 'periop'|'assisted'|'performed' }
    chiefArea: input.chiefArea,                // one CHIEF_AREAS id — this is what the radar counts
    secondaryAreas: input.secondaryAreas || [],
    summary: input.summary || '',
    source: input.source || 'manual',          // 'extracted' | 'manual'
  };
}

export async function addCase(caseInput) {
  const state = await loadState();
  state.cases.unshift(makeCase(caseInput));
  return saveState(state);
}

export async function updateCase(id, patch) {
  const state = await loadState();
  const i = state.cases.findIndex((c) => c.id === id);
  if (i === -1) return state;
  state.cases[i] = { ...state.cases[i], ...patch };
  return saveState(state);
}

export async function deleteCase(id) {
  const state = await loadState();
  state.cases = state.cases.filter((c) => c.id !== id);
  return saveState(state);
}

/** Updates one or more of the student's own details. */
export async function setProfile(patch) {
  const state = await loadState();
  for (const [key, value] of Object.entries(patch)) {
    if (key in state) state[key] = value;
  }
  return saveState(state);
}

// ---- derived numbers used by the dashboard -------------------------------

export function tallyByArea(cases, { includeSecondary = false } = {}) {
  const counts = {};
  for (const c of cases) {
    if (c.chiefArea) counts[c.chiefArea] = (counts[c.chiefArea] || 0) + 1;
    if (includeSecondary) {
      for (const s of c.secondaryAreas || []) counts[s] = (counts[s] || 0) + 1;
    }
  }
  return counts;
}

export function tallyVisitTypes(cases) {
  return {
    new: cases.filter((c) => c.visitType === 'new').length,
    recheck: cases.filter((c) => c.visitType === 'recheck').length,
    procedures: cases.filter((c) => c.procedure).length,
  };
}
