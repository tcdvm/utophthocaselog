import { toTitleCase } from '../src/panel/text.js';

let fails = 0;
const is = (input, want) => {
  const got = toTitleCase(input);
  const ok = got === want;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${JSON.stringify(input)} -> ${JSON.stringify(got)}${ok ? '' : `  (wanted ${JSON.stringify(want)})`}`);
  if (!ok) fails++;
};

console.log('\n  The cases ezyVet actually produces');
is('FLUFFY', 'Fluffy');
is('fluffy', 'Fluffy');
is('Fluffy', 'Fluffy');
is('fLuFfY', 'Fluffy');

console.log('\n  More than one word');
is('sir reginald', 'Sir Reginald');
is('MARY JANE', 'Mary Jane');
is('SHIH TZU', 'Shih Tzu');
is('domestic shorthair', 'Domestic Shorthair');
is('LABRADOR RETRIEVER', 'Labrador Retriever');

console.log('\n  Punctuation inside names');
is("o'malley", "O'Malley");          // an apostrophe followed by a syllable
is("buddy's girl", "Buddy's Girl");  // a possessive must NOT gain a capital
is("o'malley's", "O'Malley's");      // both rules in one name
is('mary-jane', 'Mary-Jane');
is('poodle (standard)', 'Poodle (Standard)');
is('shepherd/lab mix', 'Shepherd/Lab Mix');
is('COCKER–SPANIEL', 'Cocker–Spaniel');   // en dash, not a hyphen

console.log('\n  Whitespace and nothing at all');
is('  fluffy  ', 'Fluffy');
is('mary   jane', 'Mary Jane');
is('', '');
is(null, '');
is(undefined, '');

console.log('\n  Known limitations — asserted so a future change is deliberate');
is('mcdonald', 'Mcdonald');   // capitalising after Mc would break Macy, Mack, Machado
is('JD', 'Jd');               // initials used as a name lose their shape

console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
