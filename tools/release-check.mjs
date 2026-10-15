// ---------------------------------------------------------------------------
// release-check.mjs — everything that must be true before a store upload.
//
// The Chrome Web Store rejects slowly: a missing file or a bad icon comes back
// days later as a review failure. These checks take a second.
// ---------------------------------------------------------------------------

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) fails++;
};

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

console.log('\n  Manifest');
check('manifest version 3', manifest.manifest_version === 3);
check('version is a store-legal number', /^\d+(\.\d+){0,3}$/.test(manifest.version), manifest.version);
check('name is at most 45 characters', manifest.name.length <= 45, `${manifest.name.length} chars`);
check('description is at most 132 characters', manifest.description.length <= 132, `${manifest.description.length} chars`);
check('description is not the default placeholder', !/^__MSG/.test(manifest.description));

console.log('\n  Every file the manifest names exists');
const referenced = [
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
].filter(Boolean);
for (const path of [...new Set(referenced)]) check(path, existsSync(path));

console.log('\n  Icons are real PNGs at the declared sizes');
// A PNG's width and height live in the IHDR chunk, bytes 16-23.
const pngSize = (file) => {
  const b = readFileSync(file);
  if (b.toString('latin1', 1, 4) !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
for (const [declared, file] of Object.entries(manifest.icons || {})) {
  const size = pngSize(file);
  check(`${file} is ${declared}x${declared}`,
    size && size.w === Number(declared) && size.h === Number(declared),
    size ? `${size.w}x${size.h}` : 'not a PNG');
}
check('a 128px icon is present (the store requires one)', Boolean(manifest.icons?.['128']));

console.log('\n  Every import resolves');
const sources = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith('.js')) sources.push(full);
  }
})('src');

for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/^\s*import[^'"]*['"](\.[^'"]+)['"]/gm)) {
    const target = resolve(dirname(file), m[1]);
    check(`${file} -> ${m[1]}`, existsSync(target));
  }
}

console.log('\n  The side panel loads what it claims to');
const html = readFileSync(manifest.side_panel.default_path, 'utf8');
const panelDir = dirname(manifest.side_panel.default_path);
for (const m of html.matchAll(/(?:src|href)="([^":]+)"/g)) {
  check(`panel.html -> ${m[1]}`, existsSync(join(panelDir, m[1])));
}

console.log('\n  Nothing in src/ is dead weight');
const entry = new Set([resolve(manifest.background.service_worker), resolve(panelDir, 'panel.js')]);
const reached = new Set();
const follow = (file) => {
  if (reached.has(file)) return;
  reached.add(file);
  if (!existsSync(file)) return;
  for (const m of readFileSync(file, 'utf8').matchAll(/^\s*import[^'"]*['"](\.[^'"]+)['"]/gm)) {
    follow(resolve(dirname(file), m[1]));
  }
};
for (const e of entry) follow(e);
const orphans = sources.map((f) => resolve(f)).filter((f) => !reached.has(f));
check('no unreachable source files', orphans.length === 0, orphans.join(', '));

console.log('\n  No debugging left behind');
const debris = [];
for (const file of sources) {
  const code = readFileSync(file, 'utf8').split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
  if (/console\.(log|debug|table)\s*\(/.test(code)) debris.push(`console.log in ${file}`);
  if (/\bdebugger\b/.test(code)) debris.push(`debugger in ${file}`);
  if (/\bTODO\b|\bFIXME\b/.test(code)) debris.push(`TODO/FIXME in ${file}`);
}
check('no stray logging, debugger or TODO', debris.length === 0, debris.join(', '));

console.log(fails ? `\n${fails} check(s) FAILED — do not upload` : '\nready to package');
process.exit(fails ? 1 : 0);
