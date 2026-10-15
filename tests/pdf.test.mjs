import { buildCaseLogPdf } from '../src/panel/pdf.js';
import { writeFileSync } from 'node:fs';

const mk = (o) => ({ id: Math.random().toString(36).slice(2), createdAt: '', secondaryAreas: [], procedure: null, ...o });

const state = {
  schemaVersion: 1,
  studentName: 'A. Student',
  school: 'SGU',
  gradTerm: 'Spring',
  gradYear: '2027',
  unlockedAchievements: [],
  cases: [
    mk({ dateSeen:'2026-09-02', patientName:'Fluffy',   species:'Canine', breed:'Cavapoo',            sex:'FS', age:'9 y',  visitType:'new',     chiefArea:'uvea',     secondaryAreas:['glaucoma'], summary:'Anterior uveitis OD with secondary pressure elevation; started on topical steroid and dorzolamide.' }),
    mk({ dateSeen:'2026-09-02', patientName:'Biscuit',  species:'Canine', breed:'Shih Tzu',           sex:'MN', age:'11 y', visitType:'recheck', chiefArea:'kcs',      secondaryAreas:['cornea'], summary:'STT improved from 6 to 14 mm/min on cyclosporine.' }),
    mk({ dateSeen:'2026-09-03', patientName:'Pixel',    species:'Feline', breed:'Domestic Shorthair', sex:'FS', age:'4 y',  visitType:'new',     chiefArea:'cornea',   summary:'Indolent-appearing ulcer, fluorescein positive with loose epithelial lip.' }),
    mk({ dateSeen:'2026-09-03', patientName:'Duke',     species:'Canine', breed:'Labrador Retriever', sex:'MN', age:'7 y',  visitType:'recheck', procedure:{level:'assisted'}, chiefArea:'glaucoma', secondaryAreas:['uvea'], summary:'Assisted with gonioimplant revision; tube patent, IOP 14 mmHg at discharge.' }),
    mk({ dateSeen:'2026-09-04', patientName:'Marzipan', species:'Canine', breed:'Pug',                sex:'F',  age:'2 y',  visitType:'new',     chiefArea:'adnexa',   secondaryAreas:['cornea'], summary:'Medial entropion with pigmentary keratitis; Hotz-Celsus discussed with owner.' }),
    mk({ dateSeen:'2026-09-04', patientName:'Olive',    species:'Canine', breed:'Beagle',             sex:'FS', age:'6 y',  visitType:'recheck', chiefArea:'cornea',   summary:'Healed.' }),
    mk({ dateSeen:'2026-09-05', patientName:'Rocket',   species:'Canine', breed:'Border Collie',      sex:'MN', age:'5 y',  visitType:'new',     chiefArea:'retina',   summary:'Acute vision loss with normal fundus; SARDS suspected, ERG scheduled for next week to differentiate from retrobulbar optic neuritis.' }),
    mk({ dateSeen:'2026-09-05', patientName:'Tuna',     species:'Feline', breed:'Maine Coon',         sex:'MN', age:'13 y', visitType:'recheck', procedure:{level:'periop'}, chiefArea:'orbit', summary:'Post-op orbital mass excision; recovery care and discharge instructions.' }),
    mk({ dateSeen:'2026-09-06', patientName:'Léo',      species:'Canine', breed:'Poodle (Standard)',  sex:'MN', age:'8 y',  visitType:'new',     procedure:{level:'performed'}, chiefArea:'glaucoma', secondaryAreas:['uvea','cornea'], summary:'Performed most of the enucleation under supervision — accented name included deliberately to test character encoding in the PDF.' }),
  ],
};

// Enough cases to force a second page.
for (let i = 0; i < 22; i++) {
  state.cases.push(mk({
    dateSeen: '2026-09-08', patientName: `Filler ${i + 1}`, species: 'Canine', breed: 'Mixed breed',
    sex: 'MN', age: '4 y', visitType: i % 2 ? 'recheck' : 'new', chiefArea: 'cornea',
    summary: 'Routine recheck with a summary long enough to wrap onto more than one line in the printed table.',
  }));
}

const bytes = buildCaseLogPdf(state);
const text = Buffer.from(bytes).toString('latin1');

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) fails++;
};

check('starts with a PDF header', text.startsWith('%PDF-1.4'));
check('ends with the EOF marker', text.trimEnd().endsWith('%%EOF'));

const objCount = (text.match(/^\d+ 0 obj$/gm) || []).length;
const declaredSize = Number((text.match(/\/Size (\d+)/) || [])[1]);
check('object count matches trailer /Size', objCount === declaredSize - 1, `${objCount} objects, /Size ${declaredSize}`);

const pageCount = Number((text.match(/\/Count (\d+)/) || [])[1]);
check('produced more than one page', pageCount > 1, `${pageCount} pages`);
check('every page object exists', (text.match(/\/Type \/Page[^s]/g) || []).length === pageCount);

// The cross-reference table is the part most likely to be silently wrong:
// each offset must land exactly on the start of its object.
const xrefBody = text.slice(text.indexOf('\nxref\n') + 6);
const offsets = [...xrefBody.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
check('xref lists every object', offsets.length === objCount, `${offsets.length} entries`);
const badOffsets = offsets.filter((off, i) => !text.startsWith(`${i + 1} 0 obj`, off));
check('every xref offset lands on its object', badOffsets.length === 0, badOffsets.length ? `${badOffsets.length} wrong` : '');

const startxref = Number((text.match(/startxref\n(\d+)/) || [])[1]);
check('startxref points at the xref table', text.startsWith('xref', startxref));

check('accented characters are escaped, not dropped', text.includes('L\\351o'), 'Léo -> L\\351o');
check('the report names the school in full', text.includes("St. George"));
check('the report states the graduation term', text.includes('Graduating Spring 2027'));
check('every stream declares a matching length', (() => {
  for (const m of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    const end = text.indexOf('\nendstream', start);
    if (end - start !== Number(m[1])) return false;
  }
  return true;
})());

writeFileSync('docs/sample-report.pdf', bytes);
console.log(`\n  wrote docs/sample-report.pdf (${(bytes.length / 1024).toFixed(0)} KB, ${pageCount} pages)`);
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
