// LAB-space paint blending, mirroring backend/utils/color_engine.py.
//
// A wall photo keeps its texture, shadows and highlights in the L channel.
// Replace only a/b and the surface still reads as the same wall — just a
// different colour of paint on it.

export function hexToRgb(hex) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) throw new Error(`Invalid hex colour: ${hex}`);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHex(r, g, b) {
  const p = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`.toUpperCase();
}

const REF_X = 95.047;
const REF_Y = 100.0;
const REF_Z = 108.883;

function pivotRgb(v) {
  const c = v / 255;
  return (c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92) * 100;
}

function pivotXyz(v) {
  return v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
}

export function rgbToLab(r, g, b) {
  const R = pivotRgb(r);
  const G = pivotRgb(g);
  const B = pivotRgb(b);

  const x = pivotXyz((R * 0.4124 + G * 0.3576 + B * 0.1805) / REF_X);
  const y = pivotXyz((R * 0.2126 + G * 0.7152 + B * 0.0722) / REF_Y);
  const z = pivotXyz((R * 0.0193 + G * 0.1192 + B * 0.9505) / REF_Z);

  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

function unpivotXyz(v) {
  const c = v * v * v;
  return c > 0.008856 ? c : (v - 16 / 116) / 7.787;
}

function unpivotRgb(v) {
  const c = v / 100;
  const s = c > 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c;
  return Math.max(0, Math.min(255, s * 255));
}

export function labToRgb(L, a, bb) {
  const y = (L + 16) / 116;
  const x = a / 500 + y;
  const z = y - bb / 200;

  const X = unpivotXyz(x) * REF_X;
  const Y = unpivotXyz(y) * REF_Y;
  const Z = unpivotXyz(z) * REF_Z;

  return {
    r: unpivotRgb(X * 3.2406 + Y * -1.5372 + Z * -0.4986),
    g: unpivotRgb(X * -0.9689 + Y * 1.8758 + Z * 0.0415),
    b: unpivotRgb(X * 0.0557 + Y * -0.204 + Z * 1.057),
  };
}

export function hexToLab(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

/**
 * Paint `hex` onto every pixel the mask marks, in place on `imageData`.
 *
 * @param {ImageData} imageData  pixels to modify (already a copy of the source)
 * @param {Uint8Array} mask      one byte per pixel, non-zero = paint here
 * @param {string} hex           Unimax shade hex
 * @param {object} [opts]
 * @param {number} [opts.opacity=0.95]      blend strength against the original
 * @param {number} [opts.lightnessShift=1]  how far the region's average lightness
 *        moves toward the paint's own lightness
 *
 * Defaults note: texture survives because each pixel keeps its *deviation* from
 * the region's mean lightness, so the blend does not need to be weak to look
 * real. Shifting the mean only part-way (or blending heavily with the original)
 * washes the shade out instead — at 0.72/0.35 the Black shade renders as mid
 * grey, which is useless to a customer choosing paint. Both values stay tunable.
 */
export function applyPaintColor(imageData, mask, hex, opts = {}) {
  const opacity = opts.opacity ?? 0.95;
  const lightnessShift = opts.lightnessShift ?? 1.0;

  const data = imageData.data;
  const paint = hexToLab(hex);

  // Pass 1 — mean lightness of the masked region.
  let sumL = 0;
  let count = 0;
  const labs = new Float32Array(mask.length * 3);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const p = i * 4;
    const lab = rgbToLab(data[p], data[p + 1], data[p + 2]);
    labs[i * 3] = lab.L;
    labs[i * 3 + 1] = lab.a;
    labs[i * 3 + 2] = lab.b;
    sumL += lab.L;
    count++;
  }
  if (count === 0) return imageData;

  const delta = (paint.L - sumL / count) * lightnessShift;

  // Pass 2 — keep L (shifted), swap a/b, then blend for opacity.
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const p = i * 4;
    const L = Math.max(0, Math.min(100, labs[i * 3] + delta));
    const out = labToRgb(L, paint.a, paint.b);
    data[p] = out.r * opacity + data[p] * (1 - opacity);
    data[p + 1] = out.g * opacity + data[p + 1] * (1 - opacity);
    data[p + 2] = out.b * opacity + data[p + 2] * (1 - opacity);
  }
  return imageData;
}

/** Readable text colour for a swatch background. */
export function contrastText(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0F1C2E' : '#F0F0F0';
}
