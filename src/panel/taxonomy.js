// ---------------------------------------------------------------------------
// taxonomy.js — the vocabulary of the case log.
//
// This file is plain data on purpose. To add an eighth area of interest later,
// add one line to CHIEF_AREAS. Nothing else in the extension needs to change:
// the radar chart, the form, and the report all read from this list.
//
// `id`    never changes once cases are saved against it (it is what gets stored)
// `label` is what the student reads in the form
// `short` is what fits on a radar chart axis in a narrow panel
// ---------------------------------------------------------------------------

export const CHIEF_AREAS = [
  { id: 'orbit',    label: 'Orbit / Globe',                         short: 'Orbit/Globe' },
  { id: 'adnexa',   label: 'Eyelid / Third Eyelid / Conjunctiva',   short: 'Adnexa' },
  { id: 'cornea',   label: 'Cornea',                                short: 'Cornea' },
  { id: 'kcs',      label: 'Keratoconjunctivitis sicca',            short: 'KCS' },
  { id: 'uvea',     label: 'Uvea / Uveitis',                        short: 'Uvea' },
  { id: 'glaucoma', label: 'Glaucoma',                              short: 'Glaucoma' },
  { id: 'retina',   label: 'Retina / Neuro-ophthalmology',          short: 'Retina' },
];

export const VISIT_TYPES = [
  { id: 'new',     label: 'New' },
  { id: 'recheck', label: 'Recheck' },
];

// Depth of student involvement, only asked when a procedure is logged.
export const PROCEDURE_LEVELS = [
  { id: 'periop',    label: 'Pre / post-op patient care' },
  { id: 'assisted',  label: 'Partial involvement (scrubbed in, assisting)' },
  { id: 'performed', label: 'Performed most of the procedure (supervised)' },
];

// --- who is keeping the log ------------------------------------------------
// Add a school by adding a line. Nothing else needs changing.

export const SCHOOLS = [
  { id: 'SGU',  label: 'SGU',  full: "St. George's University" },
  { id: 'Ross', label: 'Ross', full: 'Ross University' },
  { id: 'UT',   label: 'UT',   full: 'University of Tennessee' },
];

export const GRAD_TERMS = ['Fall', 'Spring', 'Summer'];

// Generated rather than hard-coded, so the list is still right next year
// without anyone remembering to edit it.
export function gradYears(from = new Date().getFullYear(), span = 5) {
  return Array.from({ length: span }, (_, i) => String(from + i));
}

export const schoolFull = (id) => {
  const s = SCHOOLS.find((x) => x.id === id);
  return s ? s.full : id;
};

// A short, known list — offered as a dropdown, not as type-ahead hints.
export const SPECIES = ['Canine', 'Feline', 'Equine', 'Bovine', 'Avian', 'Exotic', 'Other'];

// Lookup helpers so the rest of the code never hard-codes an id string.
export const areaById = (id) => CHIEF_AREAS.find((a) => a.id === id) || null;
export const areaLabel = (id) => (areaById(id) ? areaById(id).label : id);
export const areaShort = (id) => (areaById(id) ? areaById(id).short : id);
export const levelLabel = (id) => {
  const l = PROCEDURE_LEVELS.find((p) => p.id === id);
  return l ? l.label : id;
};
