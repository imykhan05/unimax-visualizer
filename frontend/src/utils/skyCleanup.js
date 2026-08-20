// Clean the sky: flatten cloud blotches into a smooth gradient and, with them,
// erase the power lines, antennas and stray branches that cross it.
//
// This is not inpainting. It works because sky is the one part of a facade
// photo whose true appearance is known without guessing — a smooth vertical
// ramp. Rebuilding it from its own per-row colour removes anything crossing it
// as a side effect. (Nothing here can reconstruct the *building* behind a tree;
// that needs a generative model.)

/** Median of a small array — resistant to clouds and wires alike. */
function median(values) {
  if (!values.length) return null;
  const a = Float32Array.from(values).sort();
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * @param {ImageData} imageData  modified in place
 * @param {Uint8Array} skyMask   1 where sky (holes already filled)
 * @param {object} [opts]
 * @param {number} [opts.strength=1] 0 = untouched, 1 = fully rebuilt
 * @returns {{changed: number}}
 */
export function cleanSky(imageData, skyMask, { strength = 1 } = {}) {
  const { width, height, data } = imageData;
  if (!skyMask || strength <= 0) return { changed: 0 };

  // Per row: the median sky colour. Clouds are brighter than the median and
  // wires darker, so both drop out.
  const rowR = new Float32Array(height);
  const rowG = new Float32Array(height);
  const rowB = new Float32Array(height);
  const rowHas = new Uint8Array(height);

  for (let y = 0; y < height; y++) {
    const rs = [], gs = [], bs = [];
    for (let x = 0; x < width; x += 2) {
      const i = y * width + x;
      if (!skyMask[i]) continue;
      const p = i * 4;
      rs.push(data[p]); gs.push(data[p + 1]); bs.push(data[p + 2]);
    }
    if (rs.length > 8) {
      rowR[y] = median(rs); rowG[y] = median(gs); rowB[y] = median(bs);
      rowHas[y] = 1;
    }
  }

  // Carry the nearest known row into rows with too little sky, so the ramp is
  // defined everywhere the mask touches.
  let last = -1;
  for (let y = 0; y < height; y++) {
    if (rowHas[y]) { last = y; continue; }
    if (last >= 0) { rowR[y] = rowR[last]; rowG[y] = rowG[last]; rowB[y] = rowB[last]; rowHas[y] = 1; }
  }
  last = -1;
  for (let y = height - 1; y >= 0; y--) {
    if (rowHas[y] && last < 0) { last = y; continue; }
    if (!rowHas[y] && last >= 0) { rowR[y] = rowR[last]; rowG[y] = rowG[last]; rowB[y] = rowB[last]; rowHas[y] = 1; }
    else if (rowHas[y]) last = y;
  }
  if (last < 0) return { changed: 0 };

  // Heavy vertical smoothing: what survives is the gradient, not the weather.
  const smooth = (src) => {
    const out = new Float32Array(height);
    const r = Math.max(4, Math.round(height * 0.06));
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += src[Math.min(height - 1, Math.max(0, y))];
    const win = r * 2 + 1;
    for (let y = 0; y < height; y++) {
      out[y] = sum / win;
      sum += src[Math.min(height - 1, y + r + 1)] - src[Math.min(height - 1, Math.max(0, y - r))];
    }
    return out;
  };
  const sR = smooth(rowR), sG = smooth(rowG), sB = smooth(rowB);

  let changed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!skyMask[i]) continue;
      const p = i * 4;
      data[p] = data[p] * (1 - strength) + sR[y] * strength;
      data[p + 1] = data[p + 1] * (1 - strength) + sG[y] * strength;
      data[p + 2] = data[p + 2] * (1 - strength) + sB[y] * strength;
      changed++;
    }
  }
  return { changed };
}

export default cleanSky;
