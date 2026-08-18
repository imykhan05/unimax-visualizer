import { floodFillMask, dilateMask } from '../src/utils/floodFill.js';
import { applyPaintColor, hexToRgb, rgbToLab, labToRgb, rgbToHex } from '../src/utils/colorBlend.js';

let fails = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};

// --- LAB round trip ---
for (const hex of ['#FAFAFA', '#A03048', '#1A1A1A', '#78A8D8', '#2A8B50']) {
  const { r, g, b } = hexToRgb(hex);
  const lab = rgbToLab(r, g, b);
  const back = labToRgb(lab.L, lab.a, lab.b);
  check(`LAB round-trip ${hex}`, rgbToHex(back.r, back.g, back.b) === hex.toUpperCase());
}

// --- scene: flat wall over floor, hard boundary at y=30 ---
const W = 100, H = 60;
const mk = (fn) => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4;
    const [r, g, b] = fn(x, y);
    data[p] = r; data[p+1] = g; data[p+2] = b; data[p+3] = 255;
  }
  return { width: W, height: H, data };
};
const flat = mk((x, y) => (y < 30 ? [230, 230, 225] : [90, 70, 55]));

const pipeline = (img, x, y, tol) => {
  const { mask, count } = floodFillMask(img, x, y, tol);
  return { raw: count, mask: dilateMask(mask, img.width, img.height, 2) };
};

const wall = pipeline(flat, 10, 10, 40);
const wallCount = wall.mask.reduce((a, b) => a + b, 0);
check('flat wall fully covered after dilate', wallCount >= W * 30, `${wallCount}/${W * 30}`);
const leak = wall.mask.slice(32 * W).reduce((a, b) => a + b, 0);
check('no leak past the boundary', leak === 0, `leaked ${leak}px`);

const floor = pipeline(flat, 10, 50, 40);
check('floor fills separately', floor.raw > W * 25, `${floor.raw}`);

check('out-of-bounds click is a no-op', floodFillMask(flat, 500, 500, 40).count === 0);

// --- gradient wall: the case a seed-relative fill fails ---
// Luminance ramps 250 -> 150 across the wall; a coloured skirting sits below it.
const grad = mk((x, y) => {
  if (y < 45) { const v = Math.round(250 - (x / W) * 100); return [v, v, v - 4]; }
  return [150, 120, 96]; // wooden skirting: clearly different chroma
});
const g = pipeline(grad, 5, 5, 40);
const gCount = g.mask.reduce((a, b) => a + b, 0);
check('gradient wall spans full width', gCount >= W * 45 * 0.97, `${gCount}/${W * 45}`);
const gLeak = g.mask.slice(47 * W).reduce((a, b) => a + b, 0);
check('gradient fill stops at coloured skirting', gLeak === 0, `leaked ${gLeak}px`);

// Worst case for any magic wand: the wall's ramp passes straight through the
// neighbouring surface's own colour, so at the contact point they are the same
// pixel value. High tolerance bleeds; dropping the slider separates them, which
// is exactly what the control is for.
const twin = mk((x, y) => {
  if (y < 45) { const v = Math.round(250 - (x / W) * 100); return [v, v, v - 4]; }
  return [176, 182, 190];
});
// Measured past the boundary (y=45) plus the deliberate ~2px dilation rim, so
// this counts region leak only, not the rim that exists to hide anti-aliasing.
const beyondRim = (m) => m.slice(49 * W).reduce((a, b) => a + b, 0);
const tHi = beyondRim(pipeline(twin, 5, 5, 80).mask);
const tLo = beyondRim(pipeline(twin, 5, 5, 20).mask);
check('low tolerance separates same-coloured neighbours', tLo === 0 && tHi > 0, `hi=${tHi}px lo=${tLo}px`);

// The dilation rim itself must stay small — a few pixels, never a whole surface.
const rim = pipeline(flat, 10, 10, 40).mask.slice(30 * W).reduce((a, b) => a + b, 0);
check('dilation rim stays within a few pixels', rim <= 3 * W, `${rim}px past the edge`);

// --- blend ---
const copy = { width: W, height: H, data: new Uint8ClampedArray(flat.data) };
applyPaintColor(copy, wall.mask, '#A03048');
const pw = (5 * W + 5) * 4, pf = (50 * W + 5) * 4;
check('painted wall reads red', copy.data[pw] > copy.data[pw + 1] + 40);
check('unmasked floor untouched', copy.data[pf] === 90 && copy.data[pf+1] === 70 && copy.data[pf+2] === 55);
const c2 = { width: W, height: H, data: new Uint8ClampedArray(flat.data) };
applyPaintColor(c2, new Uint8Array(W * H), '#A03048');
check('empty mask is a no-op', c2.data[pw] === 230);

// texture retention: noisy wall keeps its per-pixel variation
const noisy = mk((x, y) => { const n = ((x * 7 + y * 13) % 17) - 8; return y < 30 ? [225 + n, 225 + n, 220 + n] : [90, 70, 55]; });
const nm = pipeline(noisy, 10, 10, 40);
const before = [], after = [];
const nc = { width: W, height: H, data: new Uint8ClampedArray(noisy.data) };
for (let i = 0; i < W * 28; i++) before.push(noisy.data[i * 4]);
applyPaintColor(nc, nm.mask, '#78A8D8');
for (let i = 0; i < W * 28; i++) after.push(nc.data[i * 4]);
const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
check('texture survives the repaint', sd(after) > sd(before) * 0.6, `std ${sd(before).toFixed(1)} -> ${sd(after).toFixed(1)}`);

console.log(fails ? `\n${fails} FAILURE(S)` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
