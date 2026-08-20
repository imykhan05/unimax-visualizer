#!/usr/bin/env node
// Run the whole Auto Schemes pipeline over a real photo and write the results
// to disk, so a sample can be checked without clicking through the UI.
//
//   cd frontend && npm run test:sample -- ../samples/house1.jpg
// or node frontend/scripts/test-sample.mjs samples/house1.jpg [outDir]
//
// Writes: a zone map (what was detected), the tidied base image, and one board
// per scheme. The zone map is the useful one when detection gets something
// wrong — it shows exactly which surface was read as what.

import { chromium } from '@playwright/test';
import { mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// repo root, two levels up from frontend/scripts/
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sample = process.argv[2];
const outDir = path.resolve(root, process.argv[3] || 'sample-out');

if (!sample || !existsSync(path.resolve(root, sample))) {
  console.error('Usage: node scripts/test-sample.mjs <image> [outDir]');
  process.exit(1);
}

const src = path.resolve(root, sample);
const served = path.join(root, 'frontend', 'public');
await mkdir(served, { recursive: true });
const servedName = `__sample${path.extname(src)}`;
await copyFile(src, path.join(served, servedName));
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));

const base = process.env.APP_URL || 'http://localhost:5173/';
await page.goto(base, { waitUntil: 'networkidle' });

const result = await page.evaluate(async (file) => {
  const zones = await import('/src/utils/autoZones.js');
  const sky = await import('/src/utils/skyCleanup.js');
  const blend = await import('/src/utils/colorBlend.js');
  const combos = await import('/src/data/combinations.js');
  const card = await import('/src/utils/schemeCard.js');

  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = '/' + file; });

  const MAXW = 900, MAXH = 640;
  const s = Math.min(MAXW / img.naturalWidth, MAXH / img.naturalHeight, 1);
  const oc = document.createElement('canvas');
  oc.width = Math.round(img.naturalWidth * s);
  oc.height = Math.round(img.naturalHeight * s);
  const octx = oc.getContext('2d', { willReadFrequently: true });
  octx.drawImage(img, 0, 0, oc.width, oc.height);
  const original = octx.getImageData(0, 0, oc.width, oc.height);

  const t0 = performance.now();
  const { roles, skyMask, skyPixels } = zones.detectZones(original);
  const detectMs = performance.now() - t0;

  // Zone map: red = wall, blue = trim, yellow = gate, violet = sky.
  const vis = new ImageData(new Uint8ClampedArray(original.data), oc.width, oc.height);
  const tint = (mask, col) => {
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const q = i * 4;
      vis.data[q] = (vis.data[q] + col[0] * 2) / 3;
      vis.data[q + 1] = (vis.data[q + 1] + col[1] * 2) / 3;
      vis.data[q + 2] = (vis.data[q + 2] + col[2] * 2) / 3;
    }
  };
  if (skyMask) tint(skyMask, [170, 0, 255]);
  const COL = { wall: [255, 0, 0], trim: [0, 160, 255], gate: [255, 220, 0] };
  for (const r of roles) tint(r.mask, COL[r.role] || [255, 0, 255]);
  const vc = document.createElement('canvas');
  vc.width = oc.width; vc.height = oc.height;
  vc.getContext('2d').putImageData(vis, 0, 0);

  // Tidy the sky on the base, exactly as the app does.
  const tidy = new ImageData(new Uint8ClampedArray(original.data), oc.width, oc.height);
  if (skyMask) sky.cleanSky(tidy, skyMask);
  const tc = document.createElement('canvas');
  tc.width = oc.width; tc.height = oc.height;
  tc.getContext('2d').putImageData(tidy, 0, 0);

  const available = roles.map((r) => r.role);
  const boards = [];
  for (const scheme of combos.COMBINATIONS) {
    const frame = new ImageData(new Uint8ClampedArray(tidy.data), oc.width, oc.height);
    for (const r of roles) {
      const shade = scheme.roles[r.role];
      if (shade) blend.applyPaintColor(frame, r.mask, shade.hex);
    }
    const pc = document.createElement('canvas');
    pc.width = oc.width; pc.height = oc.height;
    pc.getContext('2d').putImageData(frame, 0, 0);
    const cv = card.renderSchemeCard({
      painted: pc, original: tc,
      shades: combos.schemeShades(scheme, available),
      schemeName: scheme.name,
    });
    boards.push({ name: scheme.name, png: cv.toDataURL('image/jpeg', 0.9) });
  }

  const total = oc.width * oc.height;
  return {
    size: `${oc.width}x${oc.height}`,
    detectMs: Math.round(detectMs),
    skyPct: +((100 * (skyPixels || 0)) / total).toFixed(1),
    roles: roles.map((r) => ({ role: r.role, pct: +((100 * r.pixels) / total).toFixed(1), meanHex: r.meanHex })),
    zonesPng: vc.toDataURL('image/jpeg', 0.9),
    tidyPng: tc.toDataURL('image/jpeg', 0.9),
    boards,
  };
}, servedName);

const save = (name, dataUrl) =>
  writeFile(path.join(outDir, name), Buffer.from(dataUrl.split(',')[1], 'base64'));

await save('00-zones.jpg', result.zonesPng);
await save('01-sky-tidied.jpg', result.tidyPng);
for (const [i, b] of result.boards.entries()) {
  await save(`${String(i + 2).padStart(2, '0')}-${b.name.toLowerCase().replace(/\s+/g, '-')}.jpg`, b.png);
}

console.log(`image        ${sample}  (${result.size})`);
console.log(`detection    ${result.detectMs} ms`);
console.log(`sky          ${result.skyPct}% of frame`);
for (const r of result.roles) {
  console.log(`  ${r.role.padEnd(5)} ${String(r.pct).padStart(5)}%   mean ${r.meanHex}`);
}
console.log(`boards       ${result.boards.length} written to ${path.relative(root, outDir)}/`);
console.log(`problems     ${problems.length ? problems.join(' | ') : 'none'}`);

await rm(path.join(served, servedName), { force: true });
await browser.close();
