import { readPatientFromPage } from '../src/panel/extract.js';

function stubDom(sidebarText, { focusedTab = true } = {}) {
  const first = sidebarText.split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
  const sidebar = {
    id: 'patientSideBar7',
    innerText: sidebarText,
    offsetParent: {},
    querySelector: () => ({ innerText: first, textContent: first }),
  };
  global.document = {
    querySelector: (sel) => (focusedTab && sel.includes('focusedRecordTab') ? { id: 'rtab7' } : null),
    querySelectorAll: (sel) => (sel.startsWith('[id^="patientSideBar"]') ? [sidebar] : []),
    getElementById: (id) => (id === 'patientSideBar7' ? sidebar : null),
  };
}

const cases = [
  ['mockup layout',        'Fluffy (FS)\n9 years old\nCanine (Dog) - Cavapoo',            { patientName:'Fluffy', sex:'FS', species:'Canine', breed:'Cavapoo', age:'9 years' }],
  ['abbreviated age',      'Biscuit (MN)\nCanine (Dog) - Shih Tzu\n11y 4m',              { patientName:'Biscuit', sex:'MN', species:'Canine', breed:'Shih Tzu', age:'11y 4m' }],
  ['feline, en dash',      'Pixel (FS)\nFeline (Cat) – Domestic Shorthair\n4 yrs',       { patientName:'Pixel', sex:'FS', species:'Feline', breed:'Domestic Shorthair', age:'4 yrs' }],
  ['no breed given',       'Tuna (MN)\nFeline (Cat)\n13 years 2 months',                 { patientName:'Tuna', sex:'MN', species:'Feline', breed:'', age:'13 years 2 months' }],
  ['months only',          'Sprout (F)\nCanine (Dog) - Beagle\n7 months old',            { patientName:'Sprout', sex:'F', species:'Canine', breed:'Beagle', age:'7 months old' }],
  ['name with spaces',     'Sir Reginald (MN)\nCanine (Dog) - Pug\n5 y',                 { patientName:'Sir Reginald', sex:'MN', species:'Canine', breed:'Pug', age:'5 y' }],
  ['all on one line',      'Olive (FS)  Canine (Dog) - Beagle  6 years',                 { patientName:'Olive', sex:'FS', species:'Canine', breed:'Beagle', age:'6 years' }],
  ['no sex shown',         'Rocket\nCanine (Dog) - Border Collie\n5 years',              { patientName:'Rocket', sex:'', species:'Canine', breed:'Border Collie', age:'5 years' }],
  ['unknown sex code',     'Mystery (U)\nAvian (Bird) - Cockatiel\n2 years',             { patientName:'Mystery', sex:'U', species:'Avian', breed:'Cockatiel', age:'2 years' }],
];

let pass = 0, fail = 0;
for (const [label, text, want] of cases) {
  stubDom(text);
  const got = readPatientFromPage();
  const f = got.fields || {};
  const bad = Object.entries(want).filter(([k, v]) => (f[k] || '') !== v);
  if (bad.length === 0) { pass++; console.log(`  PASS  ${label}`); }
  else {
    fail++;
    console.log(`  FAIL  ${label}`);
    for (const [k, v] of bad) console.log(`          ${k}: want "${v}"  got "${f[k] || ''}"`);
  }
}

// The failure path must never throw and must never leak text.
global.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null };
const none = readPatientFromPage();
console.log(`\n  no-sidebar case -> ok:${none.ok} fields:${none.fields}`);
if (none.ok !== false || none.fields !== null) { fail++; console.log('  FAIL  the no-sidebar case must return nothing'); }
else console.log('  PASS  the no-sidebar case returns nothing and does not throw');


console.log(`\n${pass} passed, ${fail} failed`);

// Run with:  npm test      (or)   node tests/extract.test.mjs
// There is no test framework here on purpose — it is a list of inputs, the
// expected reading of each, and a count at the end.
