// Scanline flood fill over an ImageData buffer.
//
// Returns a per-pixel mask instead of writing colour, so the caller can hand
// the same mask to the LAB blend and keep the region as a re-editable "zone".
//
// Matching is deliberately *not* a plain seed comparison. Every real wall photo
// carries a lighting ramp — one end of the wall can sit 100 luminance levels
// below the other — so a seed-relative test stops halfway across the wall with a
// ragged frontier. Instead a pixel joins when it is close to the neighbour it
// spread from (gradients are gradual, so they are followed; skirting boards and
// trim are a hard step, so they still block), bounded by a generous global limit
// from the seed so the region cannot drift indefinitely.

/** Separable box blur used only for the match test — painting uses real pixels. */
function smoothLuma(data, width, height, radius) {
  const n = width * height;
  const src = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    src[i * 3] = data[p];
    src[i * 3 + 1] = data[p + 1];
    src[i * 3 + 2] = data[p + 2];
  }
  if (radius <= 0) return src;

  const tmp = new Float32Array(n * 3);
  const win = radius * 2 + 1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let x = -radius; x <= radius; x++) {
        sum += src[(row + Math.min(width - 1, Math.max(0, x))) * 3 + c];
      }
      for (let x = 0; x < width; x++) {
        tmp[(row + x) * 3 + c] = sum / win;
        const out = Math.min(width - 1, Math.max(0, x - radius));
        const inn = Math.min(width - 1, Math.max(0, x + radius + 1));
        sum += src[(row + inn) * 3 + c] - src[(row + out) * 3 + c];
      }
    }
  }

  const dst = new Float32Array(n * 3);
  for (let x = 0; x < width; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) {
        sum += tmp[(Math.min(height - 1, Math.max(0, y)) * width + x) * 3 + c];
      }
      for (let y = 0; y < height; y++) {
        dst[(y * width + x) * 3 + c] = sum / win;
        const out = Math.min(height - 1, Math.max(0, y - radius));
        const inn = Math.min(height - 1, Math.max(0, y + radius + 1));
        sum += tmp[(inn * width + x) * 3 + c] - tmp[(out * width + x) * 3 + c];
      }
    }
  }
  return dst;
}

/**
 * @param {ImageData} imageData source pixels (never modified)
 * @param {number} startX
 * @param {number} startY
 * @param {number} tolerance per-channel distance still counted as "same colour" (20-80)
 * @returns {{mask: Uint8Array, count: number, bounds: {minX,minY,maxX,maxY}}}
 */
export function floodFillMask(imageData, startX, startY, tolerance = 40) {
  const { width, height, data } = imageData;
  const x0 = Math.round(startX);
  const y0 = Math.round(startY);

  const mask = new Uint8Array(width * height);
  const empty = { mask, count: 0, bounds: { minX: 0, minY: 0, maxX: -1, maxY: -1 } };
  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return empty;

  // Smoothed copy for matching: wall grain and JPEG noise otherwise read as
  // edges and stall the fill a few pixels from the seed.
  const s = smoothLuma(data, width, height, 2);

  const seed = y0 * width + x0;
  const sr = s[seed * 3];
  const sg = s[seed * 3 + 1];
  const sb = s[seed * 3 + 2];

  // Local step: how much colour may change from one pixel to the next. A
  // lighting ramp moves a fraction of a level per pixel and passes; a skirting
  // board or window frame is a hard jump and blocks.
  const localTol = Math.max(9, tolerance * 0.42);
  const localSq = localTol * localTol;

  // Global gate, split the way the physics splits: a surface's paint colour
  // lives in its chroma, the lighting on it lives in its luminance. So chroma
  // is held close to the seed while luminance is allowed to roam — that is what
  // lets one click cover a wall that is bright at one end and shadowed at the
  // other without also swallowing differently-coloured trim beside it.
  const chromaTol = Math.max(7, tolerance * 0.45);
  const chromaSq = chromaTol * chromaTol;
  const lumaTol = tolerance * 4;

  const luma = (idx) =>
    0.299 * s[idx * 3] + 0.587 * s[idx * 3 + 1] + 0.114 * s[idx * 3 + 2];

  const seedLuma = luma(seed);
  const seedCr = sr - seedLuma;
  const seedCg = sg - seedLuma;
  const seedCb = sb - seedLuma;

  const withinGlobal = (idx) => {
    const l = luma(idx);
    if (Math.abs(l - seedLuma) > lumaTol) return false;
    const dr = s[idx * 3] - l - seedCr;
    const dg = s[idx * 3 + 1] - l - seedCg;
    const db = s[idx * 3 + 2] - l - seedCb;
    return dr * dr + dg * dg + db * db <= chromaSq;
  };

  const withinLocal = (a, b) => {
    const dr = s[a * 3] - s[b * 3];
    const dg = s[a * 3 + 1] - s[b * 3 + 1];
    const db = s[a * 3 + 2] - s[b * 3 + 2];
    return dr * dr + dg * dg + db * db <= localSq;
  };

  const accepts = (idx, from) => !mask[idx] && withinGlobal(idx) && withinLocal(idx, from);

  let count = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  // Stack of [x, y] scanline seeds. Iterative — recursion blows up on big walls.
  const stack = [[x0, y0]];
  mask[seed] = 1;
  count = 1;
  minX = maxX = x0;
  minY = maxY = y0;

  while (stack.length) {
    const [sx, sy] = stack.pop();
    const rowStart = sy * width;

    // Walk out from the seed pixel of this scanline, each step compared with
    // the pixel it came from.
    let left = sx;
    while (left > 0 && accepts(rowStart + left - 1, rowStart + left)) {
      left--;
      mask[rowStart + left] = 1;
      count++;
    }
    let right = sx;
    while (right < width - 1 && accepts(rowStart + right + 1, rowStart + right)) {
      right++;
      mask[rowStart + right] = 1;
      count++;
    }

    if (left < minX) minX = left;
    if (right > maxX) maxX = right;
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;

    let spanAbove = false;
    let spanBelow = false;
    for (let x = left; x <= right; x++) {
      const idx = rowStart + x;

      if (sy > 0) {
        const up = idx - width;
        const ok = accepts(up, idx);
        if (ok && !spanAbove) {
          mask[up] = 1;
          count++;
          stack.push([x, sy - 1]);
          spanAbove = true;
        } else if (!ok) {
          spanAbove = false;
        }
      }
      if (sy < height - 1) {
        const down = idx + width;
        const ok = accepts(down, idx);
        if (ok && !spanBelow) {
          mask[down] = 1;
          count++;
          stack.push([x, sy + 1]);
          spanBelow = true;
        } else if (!ok) {
          spanBelow = false;
        }
      }
    }
  }

  return { mask, count, bounds: { minX, minY, maxX, maxY } };
}

/**
 * Grow the mask by one pixel and soften its rim.
 *
 * Flood fill stops right where anti-aliased pixels start, which leaves a
 * one-pixel halo of the old colour along every edge. Dilating once swallows it.
 */
export function dilateMask(mask, width, height, passes = 1) {
  let src = mask;
  for (let p = 0; p < passes; p++) {
    const out = new Uint8Array(src);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (src[i]) continue;
        if (
          (x > 0 && src[i - 1]) ||
          (x < width - 1 && src[i + 1]) ||
          (y > 0 && src[i - width]) ||
          (y < height - 1 && src[i + width])
        ) {
          out[i] = 1;
        }
      }
    }
    src = out;
  }
  return src;
}

export default floodFillMask;
