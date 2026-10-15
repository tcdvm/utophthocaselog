// ---------------------------------------------------------------------------
// privacy.test.mjs — turns the privacy review into something re-checked on
// every test run, rather than a snapshot that was true on the day it was
// written. Each check corresponds to a claim in docs/build-notes.md.
// ---------------------------------------------------------------------------

import { makeCase } from '../src/panel/store.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) fails++;
};

// Collect every source file, with comment lines stripped so that *mentioning*
// an API in a comment does not trip a check.
const sources = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) sources.push(full);
  }
})('src');

const codeOf = (file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

console.log('\n  The extension cannot reach the network');

const NETWORK_APIS = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'navigator.connection'];
const found = [];
for (const file of sources) {
  const code = codeOf(file);
  for (const api of NETWORK_APIS) if (code.includes(api)) found.push(`${api} in ${file}`);
}
check('no way to open a connection exists in any source file', found.length === 0, found.join(', '));

const httpRefs = [];
for (const file of sources) {
  for (const m of codeOf(file).matchAll(/https?:\/\/[^\s'"`)]+/g)) {
    if (m[0].startsWith('http://www.w3.org/2000/svg')) continue;   // an XML namespace, not an address
    httpRefs.push(`${m[0]} in ${file}`);
  }
}
check('no web address appears in the source', httpRefs.length === 0, httpRefs.join(', '));

const dynamic = [];
for (const file of sources) {
  const code = codeOf(file);
  if (/\beval\s*\(/.test(code)) dynamic.push(`eval in ${file}`);
  if (/new Function\s*\(/.test(code)) dynamic.push(`new Function in ${file}`);
}
check('no code is built from strings at run time', dynamic.length === 0, dynamic.join(', '));

console.log('\n  The extension asks for the least it can');

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
check('no always-on content script', !('content_scripts' in manifest));
check('permissions are exactly the three needed',
  JSON.stringify([...manifest.permissions].sort()) === JSON.stringify(['scripting', 'sidePanel', 'storage']),
  manifest.permissions.join(', '));
check('only ezyVet is reachable',
  JSON.stringify(manifest.host_permissions) === JSON.stringify(['https://*.ezyvet.com/*']),
  manifest.host_permissions.join(', '));
check('no permission covers all sites',
  !JSON.stringify(manifest).includes('<all_urls>') && !JSON.stringify(manifest).includes('*://*/*'));

console.log('\n  Storage holds only what was agreed');

// If someone adds a field to a saved case, this fails and forces the addition
// to be a decision rather than a drift.
const AGREED_FIELDS = [
  'age', 'breed', 'chiefArea', 'createdAt', 'dateSeen', 'id', 'patientName',
  'procedure', 'secondaryAreas', 'sex', 'source', 'species', 'summary', 'visitType',
];
const actual = Object.keys(makeCase({ chiefArea: 'cornea', dateSeen: '2026-01-01' })).sort();
check('a saved case has exactly the agreed fields',
  JSON.stringify(actual) === JSON.stringify(AGREED_FIELDS),
  actual.filter((f) => !AGREED_FIELDS.includes(f)).join(', ') || '');

// The record tab label carries the owner's surname; the appointment grid carries
// identifiers for every booking that day. Neither may ever be read.
const extractor = codeOf('src/panel/extract.js');
check('the extractor never reads the record tab label',
  !/\.recordTab\b(?!.*focusedRecordTab)/.test(extractor) || !extractor.includes('label'),
  'tab labels contain the client surname');
check('the extractor never touches the appointment grid',
  !extractor.includes('.appt') && !extractor.includes('data-animal') && !extractor.includes('data-contact'));

console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
