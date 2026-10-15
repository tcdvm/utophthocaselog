// ---------------------------------------------------------------------------
// text.js — tidying names that arrive in whatever case the record happened to
// hold them in.
//
// ezyVet entries are typed by many different people over many years, so the
// same field turns up as FLUFFY, fluffy and Fluffy. Left alone, a case list
// shows what looks like three different patients and a printed table looks like
// a data-entry error. Normalising on the way in fixes it once.
//
// Title Case here means: lowercase everything, then capitalise the first letter
// of each word — where a "word" also starts after a hyphen, a dash, a slash or
// an opening bracket.
//
// Known limitations, all of them deliberate rather than overlooked:
//
//   McDonald   -> Mcdonald     capitalising after "Mc" would break Macy, Mack,
//                              Machado and every other ordinary word
//   JD         -> Jd           initials used as a name lose their shape
//   van Gogh   -> Van Gogh     lowercase particles are not preserved
//
// Every field this touches stays editable, so the student can correct any of
// these in the form. Guessing harder would produce confident mistakes instead
// of obvious ones.
// ---------------------------------------------------------------------------

/**
 * @param {string} input
 * @returns {string} the same text in Title Case, with runs of whitespace
 *                   collapsed and the ends trimmed
 */
export function toTitleCase(input) {
  const text = String(input == null ? '' : input).trim().replace(/\s+/g, ' ');
  if (!text) return '';

  return text
    .toLowerCase()
    // The start of the string, or anything following a separator, begins a word.
    .replace(/(^|[\s\-–—/(\[])([a-z])/g, (_, before, letter) => before + letter.toUpperCase())
    // After an apostrophe, capitalise only when a real syllable follows:
    // O'Malley gains a capital, Buddy's does not.
    .replace(/'([a-z]{2,})/g, (_, rest) => `'${rest.charAt(0).toUpperCase()}${rest.slice(1)}`);
}
