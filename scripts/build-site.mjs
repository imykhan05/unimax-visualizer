#!/usr/bin/env node
// Assemble the public site: the built app at /, the download page at
// /download.html, and the APK beside it when one is available.
//
// Used by both the local share script and the Pages workflow, so what visitors
// see is the same either way.

import { cp, mkdir, rm, access, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'frontend', 'dist');
const out = path.join(root, 'site');

const exists = async (p) => access(p, constants.F_OK).then(() => true, () => false);

if (!(await exists(dist))) {
  console.error('frontend/dist not found — run "npm run build" in frontend/ first.');
  process.exit(1);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await cp(dist, out, { recursive: true });
await cp(path.join(root, 'site-src', 'download.html'), path.join(out, 'download.html'));

// The APK is optional: locally it may not be built yet, and the page detects
// that and hides the button rather than offering a broken link.
const apkCandidates = [
  process.env.APK_PATH,
  path.join(root, 'out', 'unimax-visualizer.apk'),
  path.join(root, 'frontend', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
].filter(Boolean);

let apk = null;
for (const c of apkCandidates) {
  if (await exists(c)) {
    apk = c;
    break;
  }
}
if (apk) {
  await cp(apk, path.join(out, 'unimax-visualizer.apk'));
  console.log('site: included APK from', path.relative(root, apk));
} else {
  console.log('site: no APK found — the download page will hide that button');
}

console.log('site: built ->', path.relative(root, out));
console.log('       ', (await readdir(out)).join('  '));
