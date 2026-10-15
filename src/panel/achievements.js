// ---------------------------------------------------------------------------
// achievements.js — goals that reward breadth, not just volume.
//
// Each entry is a label plus a `test` that answers "given the whole log, has
// this been earned?", and optionally a `progress` that answers "how far along?"
// Adding a goal means adding one entry. Nothing else changes.
// ---------------------------------------------------------------------------

import { CHIEF_AREAS } from './taxonomy.js';

const caseCount = (s) => s.cases.length;
const areasSeen = (s) => new Set(s.cases.map((c) => c.chiefArea).filter(Boolean));
const procs = (s) => s.cases.filter((c) => c.procedure);

const countGoal = (id, icon, label, hint, need) => ({
  id, icon, label, hint,
  test: (s) => caseCount(s) >= need,
  progress: (s) => ({ have: Math.min(caseCount(s), need), need }),
});

export const ACHIEVEMENTS = [
  countGoal('cases-1',  '🩺', 'First case', 'Log your first case', 1),
  countGoal('cases-5',  '📈', '5 cases',    'Log 5 cases', 5),
  countGoal('cases-10', '🎯', '10 cases',   'Log 10 cases', 10),
  countGoal('cases-15', '🏅', '15 cases',   'Log 15 cases', 15),
  {
    id: 'areas-4', icon: '🧭', label: 'Four corners', hint: 'See a case in four different areas',
    test: (s) => areasSeen(s).size >= 4,
    progress: (s) => ({ have: Math.min(areasSeen(s).size, 4), need: 4 }),
  },
  {
    id: 'areas-all', icon: '🕸️', label: 'Complete the wheel', hint: 'See a case in all seven areas',
    test: (s) => areasSeen(s).size >= CHIEF_AREAS.length,
    progress: (s) => ({ have: areasSeen(s).size, need: CHIEF_AREAS.length }),
  },
  {
    id: 'procedure-assisted', icon: '🧤', label: 'Scrubbed in', hint: 'Assist in a procedure',
    test: (s) => procs(s).some((c) => c.procedure.level === 'assisted' || c.procedure.level === 'performed'),
  },
  {
    id: 'procedure-performed', icon: '✂️', label: 'Primary surgeon', hint: 'Perform most of a procedure under supervision',
    test: (s) => procs(s).some((c) => c.procedure.level === 'performed'),
  },
  {
    // Two, not one: 'Scrubbed in' above already rewards the first procedure, so
    // a threshold of one would fire both badges in the same moment. Two is
    // still reachable inside a two-week rotation and stays distinct.
    id: 'procedures-2', icon: '🏆', label: 'Two procedures', hint: 'Take part in two procedures',
    test: (s) => procs(s).length >= 2,
    progress: (s) => ({ have: Math.min(procs(s).length, 2), need: 2 }),
  },
];

// A note for later: these ids are written into saved data. Renaming one now is
// free because nobody has used the extension yet. Once students have logs, a
// rename orphans every badge already earned — at that point labels stay free to
// change and ids do not.

/** Ids currently earned, and which of those are newly earned. */
export function evaluate(state) {
  const earned = ACHIEVEMENTS.filter((a) => a.test(state)).map((a) => a.id);
  const known = new Set(state.unlockedAchievements || []);
  return { earned, newly: earned.filter((id) => !known.has(id)) };
}

/**
 * The nearest goal not yet earned, for the "what's next" line on the unlock
 * panel. Goals with measurable progress are preferred, closest first.
 */
export function nextGoal(state, excludeIds = []) {
  const skip = new Set(excludeIds);
  const remaining = ACHIEVEMENTS.filter((a) => !skip.has(a.id) && !a.test(state));
  if (!remaining.length) return null;

  const measurable = remaining
    .filter((a) => typeof a.progress === 'function')
    .map((a) => ({ a, p: a.progress(state) }))
    .sort((x, y) => (y.p.have / y.p.need) - (x.p.have / x.p.need));

  if (measurable.length) return { achievement: measurable[0].a, progress: measurable[0].p };
  return { achievement: remaining[0], progress: null };
}
