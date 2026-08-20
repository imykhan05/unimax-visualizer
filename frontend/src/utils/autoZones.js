// Automatic surface detection for a building photo.
//
// The goal is one photo in, painted schemes out — with no clicking. The hard
// part is telling a green *wall* from a green *tree*, which colour alone cannot
// do. Texture can: paint is smooth, foliage is noisy at every scale. So the
// pass below classifies by colour AND local variance, drops sky, greenery and
// road, then clusters what remains into the surfaces worth painting.

import { rgbToLab } from './colorBlend.js';

const ANALYSIS_W = 220;

/** Downscale for analysis — full resolution is far more detail than this needs. */
function downscale(imageData, targetW) {
  const { width, height, data } = imageData;
  const scale = Math.min(1, targetW / width);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const out = new Float32Array(w * h * 3);
  const bx = width / w;
  const by = height / h;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      const x0 = Math.floor(x * bx), x1 = Math.min(width, Math.ceil((x + 1) * bx));
      const y0 = Math.floor(y * by), y1 = Math.min(height, Math.ceil((y + 1) * by));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const p = (yy * width + xx) * 4;
          r += data[p]; g += data[p + 1]; b += data[p + 2]; n++;
        }
      }
      const i = (y * w + x) * 3;
      out[i] = r / n; out[i + 1] = g / n; out[i + 2] = b / n;
    }
  }
  return { w, h, rgb: out };
}

/** Local luminance standard deviation — the texture signal. */
function textureMap(rgb, w, h, radius = 2) {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, sq = 0, n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const v = lum[yy * w + xx];
          sum += v; sq += v * v; n++;
        }
      }
      const mean = sum / n;
      out[y * w + x] = Math.sqrt(Math.max(0, sq / n - mean * mean));
    }
  }
  return { texture: out, lum };
}

function kmeans(points, k, iterations = 12) {
  if (!points.length) return { centres: [], assign: [] };
  k = Math.min(k, points.length);

  // k-means++ seeding keeps the clusters from collapsing onto one surface.
  const centres = [points[Math.floor(points.length / 2)].slice()];
  while (centres.length < k) {
    let best = null, bestD = -1;
    for (let i = 0; i < points.length; i += Math.max(1, Math.floor(points.length / 400))) {
      const p = points[i];
      let d = Infinity;
      for (const c of centres) {
        const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (dd < d) d = dd;
      }
      if (d > bestD) { bestD = d; best = p; }
    }
    centres.push(best.slice());
  }

  const assign = new Int32Array(points.length);
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      let bi = 0, bd = Infinity;
      for (let c = 0; c < centres.length; c++) {
        const q = centres[c];
        const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
        if (d < bd) { bd = d; bi = c; }
      }
      assign[i] = bi;
    }
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      const s = sums[assign[i]], p = points[i];
      s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    for (let c = 0; c < centres.length; c++) {
      if (sums[c][3]) {
        centres[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
      }
    }
  }
  return { centres, assign };
}

/**
 * Drop islands: keep only the components that carry the surface.
 *
 * A real wall is one or two large connected regions. Stray fragments — a gap
 * seen through a canopy, speckle along an edge — are small and disconnected,
 * and painting them looks like a mistake.
 */
function keepMainComponents(mask, w, h, keepRatio = 0.18) {
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const stack = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    stack.push(start);
    label[start] = id;
    while (stack.length) {
      const i = stack.pop();
      size++;
      const x = i % w, y = (i / w) | 0;
      if (x > 0 && mask[i - 1] && label[i - 1] === -1) { label[i - 1] = id; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && label[i + 1] === -1) { label[i + 1] = id; stack.push(i + 1); }
      if (y > 0 && mask[i - w] && label[i - w] === -1) { label[i - w] = id; stack.push(i - w); }
      if (y < h - 1 && mask[i + w] && label[i + w] === -1) { label[i + w] = id; stack.push(i + w); }
    }
    sizes.push(size);
  }

  if (!sizes.length) return mask;
  const biggest = Math.max(...sizes);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && sizes[label[i]] >= biggest * keepRatio) out[i] = 1;
  }
  return out;
}

/**
 * 5x5 median filter over the LAB planes.
 *
 * Used only to prepare the sky search. A median erases structures thinner than
 * its window — power lines, antenna masts, twigs — while leaving a roofline
 * edge exactly where it was, which is the difference between a sky region that
 * grows across the whole frame and one that stops dead at the first wire.
 */
function medianLab(lab, w, h, radius = 2) {
  const out = new Float32Array(lab.length);
  const buf = [];
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        buf.length = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            buf.push(lab[(yy * w + xx) * 3 + c]);
          }
        }
        buf.sort((m, k) => m - k);
        out[(y * w + x) * 3 + c] = buf[buf.length >> 1];
      }
    }
  }
  return out;
}

/**
 * Sky as a *region*, not a colour.
 *
 * A colour test cannot hold across one photo's sky: the shaded side reads blue
 * and the sunlit side washes out to near-white, so any threshold either misses
 * half the sky or swallows a pale wall. What is reliably true is structural —
 * sky touches the top edge and changes smoothly. So this grows from the top
 * border, following the gradient the way the wall fill does, and stops where
 * the photo steps sharply: a roofline, a branch, a wire.
 */
function growSky(lab, texture, w, h, texLow) {
  const sky = new Uint8Array(w * h);
  const stack = [];
  const smoothEnough = texLow * 2.2;

  for (let x = 0; x < w; x++) {
    if (texture[x] <= smoothEnough) { sky[x] = 1; stack.push(x); }
  }

  const step = 9; // LAB distance allowed between neighbours
  const stepSq = step * step;
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    const visit = (j, jy) => {
      if (sky[j] || jy / h > 0.85) return;      // sky never reaches the ground
      if (texture[j] > smoothEnough) return;    // an edge is where sky ends
      const dL = lab[j * 3] - lab[i * 3];
      const da = lab[j * 3 + 1] - lab[i * 3 + 1];
      const db = lab[j * 3 + 2] - lab[i * 3 + 2];
      if (dL * dL + da * da + db * db > stepSq) return;
      sky[j] = 1;
      stack.push(j);
    };
    if (x > 0) visit(i - 1, y);
    if (x < w - 1) visit(i + 1, y);
    if (y > 0) visit(i - w, y - 1);
    if (y < h - 1) visit(i + w, y + 1);
  }
  return sky;
}

/**
 * Morphological closing: dilate then erode by the same radius.
 *
 * Hole filling alone cannot remove a power line, because a wire that crosses
 * the whole frame touches the border and so is never "enclosed". Closing
 * bridges it regardless, and eroding afterwards puts the sky's real edge back.
 */
function closeMask(mask, w, h, radius) {
  const pass = (src, want) => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let hit = 0;
        for (let dy = -radius; dy <= radius && !hit; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            if (src[yy * w + xx] === want) { hit = 1; break; }
          }
        }
        out[y * w + x] = want === 1 ? (hit ? 1 : src[y * w + x]) : (hit ? 0 : 1);
      }
    }
    return out;
  };
  return pass(pass(mask, 1), 0); // dilate, then erode
}

/** Fill holes in a mask that do not touch the image border. */
function fillEnclosedHoles(mask, w, h) {
  const outside = new Uint8Array(w * h);
  const stack = [];
  const push = (i) => {
    if (!mask[i] && !outside[i]) { outside[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] || !outside[i] ? 1 : 0;
  return out;
}

/**
 * Detect paintable surfaces.
 *
 * @returns {{roles: Array<{role, mask, pixels, meanHex, bounds}>, debug: object}}
 *   `mask` is a Uint8Array at the FULL image resolution (1 = belongs to role).
 */
export function detectZones(imageData, { maxRoles = 3 } = {}) {
  const { width: fullW, height: fullH } = imageData;
  const { w, h, rgb } = downscale(imageData, ANALYSIS_W);
  // Two scales: a fine one catches leaf edges, a coarse one catches the inside
  // of a dense canopy, where neighbouring blobs are all similarly dark.
  const { texture } = textureMap(rgb, w, h, 2);
  const { texture: textureWide } = textureMap(rgb, w, h, 5);

  const n = w * h;
  const lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = rgbToLab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    lab[i * 3] = c.L; lab[i * 3 + 1] = c.a; lab[i * 3 + 2] = c.b;
  }

  // Texture threshold adapts to the photo: a smooth studio shot and a grainy
  // phone photo should not need different constants.
  const sorted = Float32Array.from(texture).sort();
  const texMid = sorted[Math.floor(n * 0.55)];
  const texHigh = Math.max(3.5, sorted[Math.floor(n * 0.80)]);
  // "Smooth" is relative to the photo's own grain, not an absolute number.
  const texLow = Math.max(2.5, sorted[Math.floor(n * 0.30)]);

  // Wires and masts are removed before the search, not fought during it.
  const labSmooth = medianLab(lab, w, h, 2);
  const textureSmooth = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, sq = 0, cnt = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const v = labSmooth[(yy * w + xx) * 3];
          sum += v; sq += v * v; cnt++;
        }
      }
      const m = sum / cnt;
      textureSmooth[y * w + x] = Math.sqrt(Math.max(0, sq / cnt - m * m));
    }
  }
  const sSorted = Float32Array.from(textureSmooth).sort();
  const texLowSmooth = Math.max(1.2, sSorted[Math.floor(n * 0.35)]);
  const grownSky = growSky(labSmooth, textureSmooth, w, h, texLowSmooth);

  const EXCLUDED = 0, CANDIDATE = 1;
  const kind = new Uint8Array(n);
  const leaf = new Uint8Array(n);
  const sky = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const L = lab[i * 3], A = lab[i * 3 + 1], B = lab[i * 3 + 2];
      const t = texture[i];
      const yFrac = y / h;

      const isSky = grownSky[i] === 1;

      // Foliage: dark, weakly yellow, and busy.
      //
      // Texture alone cannot carry this. Measured on a real facade, a painted
      // wall scores 26-31 for coarse texture and a tree 32 — indistinguishable,
      // because real walls have panel lines and shadows. What separates them is
      // that foliage is much darker and far less yellow than paint: the wall
      // sits at L 52-75 with b +13..+16, the canopy at L 26 with b +1. Keying
      // on texture alone classified the whole green building as a tree.
      // Deep green needs no texture test at all: no exterior wall paint sits at
      // L 20 while still reading green. Sunlit foliage measured L 19.6 with
      // barely any local variance, and slipped through a texture-only rule.
      // The b* bound is what keeps a *shadowed* wall out of this: measured,
      // foliage sits near b +9 while the same paint in shade stays b +13..+17.
      const isDeepGreen = L < 30 && A < -4 && B < 10;
      const isLeaf =
        isDeepGreen ||
        (A < -2 && B < 8 && L < 45 &&
          (t > texHigh * 0.7 || textureWide[i] > texHigh * 0.8));
      // Road / ground: bottom band, low chroma.
      const isGround = yFrac > 0.9 && Math.abs(A) < 8 && Math.abs(B) < 12;

      kind[i] = isSky || isLeaf || isGround ? EXCLUDED : CANDIDATE;
      if (isLeaf) leaf[i] = 1;
      if (isSky) sky[i] = 1;
    }
  }

  // Grow the foliage mask so the smooth pockets inside a canopy are excluded
  // too — but only into pixels that could themselves be canopy. A wall next to
  // a tree is often the same hue, and growing blindly eats the building.
  let leafL = 0, leafN = 0;
  for (let i = 0; i < n; i++) if (leaf[i]) { leafL += lab[i * 3]; leafN++; }
  if (leafN) {
    const meanLeafL = leafL / leafN;
    for (let pass = 0; pass < 3; pass++) {
      const grown = Uint8Array.from(leaf);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (leaf[i]) continue;
          // Only a greenish pixel of similar darkness can be absorbed.
          if (lab[i * 3 + 1] > -2 || lab[i * 3] > meanLeafL + 14) continue;
          let hits = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const yy = y + dy, xx = x + dx;
              if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
              if (leaf[yy * w + xx]) hits++;
            }
          }
          if (hits >= 7) grown[i] = 1;
        }
      }
      leaf.set(grown);
    }
  }
  for (let i = 0; i < n; i++) if (leaf[i]) kind[i] = EXCLUDED;

  // Anything still standing but ringed by foliage is a gap seen *through* the
  // canopy, not a surface someone wants painted.
  const enclosed = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (kind[i] !== CANDIDATE) continue;
      let leafN = 0, total = 0;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          total++;
          if (leaf[yy * w + xx]) leafN++;
        }
      }
      if (leafN / total > 0.5) enclosed[i] = 1;
    }
  }
  for (let i = 0; i < n; i++) if (enclosed[i]) kind[i] = EXCLUDED;

  // Counters for tuning: which stage removed what.
  const stats0 = { sky: 0, leaf: 0, ground: 0, enclosed: 0, candidate: 0 };
  for (let i = 0; i < n; i++) {
    if (sky[i]) stats0.sky++;
    if (leaf[i]) stats0.leaf++;
    if (kind[i] === CANDIDATE) stats0.candidate++;
  }

  const idx = [];
  const pts = [];
  for (let i = 0; i < n; i++) {
    if (kind[i] !== CANDIDATE) continue;
    idx.push(i);
    pts.push([lab[i * 3], lab[i * 3 + 1] * 2.2, lab[i * 3 + 2] * 2.2]); // weight chroma
  }
  if (!idx.length) return { roles: [], debug: { w, h, kind, texMid } };

  const k = Math.min(maxRoles + 1, 4);
  const { centres, assign } = kmeans(pts, k);

  const stats = centres.map(() => ({
    count: 0, sumL: 0, sumX: 0, sumY: 0,
    minX: w, maxX: -1, minY: h, maxY: -1, sumR: 0, sumG: 0, sumB: 0,
  }));
  for (let j = 0; j < idx.length; j++) {
    const c = assign[j], i = idx[j];
    const s = stats[c];
    const x = i % w, y = (i / w) | 0;
    s.count++; s.sumL += lab[i * 3]; s.sumX += x; s.sumY += y;
    s.sumR += rgb[i * 3]; s.sumG += rgb[i * 3 + 1]; s.sumB += rgb[i * 3 + 2];
    if (x < s.minX) s.minX = x; if (x > s.maxX) s.maxX = x;
    if (y < s.minY) s.minY = y; if (y > s.maxY) s.maxY = y;
  }

  const order = stats
    .map((s, c) => ({ c, ...s }))
    .filter((s) => s.count > n * 0.012)
    .sort((a, b) => b.count - a.count);
  if (!order.length) return { roles: [], debug: { w, h, kind, texMid } };

  const wall = order[0];
  const rest = order.slice(1);
  // The gate reads as a compact block low in the frame whose lightness is far
  // from the wall's; anything else left over is trim.
  let gate = null;
  let bestScore = -1;
  for (const s of rest) {
    const cy = s.sumY / s.count / h;
    const lDiff = Math.abs(s.sumL / s.count - wall.sumL / wall.count);
    const score = lDiff * (cy > 0.45 ? 1.6 : 0.7);
    if (score > bestScore) { bestScore = score; gate = s; }
  }

  // One cluster per role. Anything left over (a neighbour's brick wall, a
  // parked car) stays unassigned rather than being lumped in and repainted.
  const roleOf = new Map();
  roleOf.set(wall.c, 'wall');
  if (gate) roleOf.set(gate.c, 'gate');
  const trim = rest.find((s) => !roleOf.has(s.c));
  if (trim) roleOf.set(trim.c, 'trim');

  // Blow the small-scale masks back up to full resolution.
  const byRole = new Map();
  for (const [c, role] of roleOf) {
    if (!byRole.has(role)) byRole.set(role, new Uint8Array(n));
    byRole.get(role)[0] = byRole.get(role)[0]; // keep shape
  }
  for (let j = 0; j < idx.length; j++) {
    const role = roleOf.get(assign[j]);
    if (role) byRole.get(role)[idx[j]] = 1;
  }

  const sx = w / fullW, sy = h / fullH;

  // Sky, upscaled and hole-filled. Wires, birds and antennas read as "not sky"
  // because they are dark and busy, so they survive as holes inside it —
  // closing those holes is what lets the cleanup erase them in one pass.
  const skySmall = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (sky[i]) skySmall[i] = 1;
  const skyClosed = closeMask(skySmall, w, h, 3);
  const skyFilled = fillEnclosedHoles(skyClosed, w, h);
  const skyMask = new Uint8Array(fullW * fullH);
  let skyPixels = 0;
  for (let y = 0; y < fullH; y++) {
    const syy = Math.min(h - 1, (y * sy) | 0);
    for (let x = 0; x < fullW; x++) {
      const sxx = Math.min(w - 1, (x * sx) | 0);
      if (skyFilled[syy * w + sxx]) { skyMask[y * fullW + x] = 1; skyPixels++; }
    }
  }

  const roles = [];
  for (const [role, rawSmall] of byRole) {
    const small = keepMainComponents(rawSmall, w, h);
    const full = new Uint8Array(fullW * fullH);
    let pixels = 0;
    for (let y = 0; y < fullH; y++) {
      const syy = Math.min(h - 1, (y * sy) | 0);
      for (let x = 0; x < fullW; x++) {
        const sxx = Math.min(w - 1, (x * sx) | 0);
        if (small[syy * w + sxx]) { full[y * fullW + x] = 1; pixels++; }
      }
    }
    const st = order.find((s) => roleOf.get(s.c) === role) || order[0];
    const hex = `#${[st.sumR, st.sumG, st.sumB]
      .map((v) => Math.round(v / st.count).toString(16).padStart(2, '0'))
      .join('')}`;
    roles.push({ role, mask: full, pixels, meanHex: hex.toUpperCase() });
  }

  const rank = { wall: 0, trim: 1, gate: 2 };
  roles.sort((a, b) => rank[a.role] - rank[b.role]);
  return {
    roles,
    skyMask,
    skyPixels,
    debug: {
      w, h, kind, texMid, clusters: order.length,
      stage: stats0,
      total: n,
      clusterStats: order.map((s) => ({
        count: s.count,
        pct: +((100 * s.count) / n).toFixed(1),
        hex: `#${[s.sumR, s.sumG, s.sumB].map((v) => Math.round(v / s.count).toString(16).padStart(2, '0')).join('')}`,
        cy: +(s.sumY / s.count / h).toFixed(2),
      })),
    },
  };
}

export default detectZones;
