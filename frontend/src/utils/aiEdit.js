// Talks to the local Stable Diffusion bridge (backend/routers/ai.py).
//
// Only works when the app is run with the FastAPI backend behind it AND a
// Stable Diffusion WebUI running with --api — both on the user's own machine.
// Every call fails soft: a fetch error (no backend reachable at all, e.g. the
// GitHub Pages build or the offline single-file build) is reported the same
// way as the backend saying "no SD server" — the caller shows one hint either
// way instead of an unhandled rejection.

async function safeFetch(path, options) {
  try {
    const res = await fetch(path, options);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = body?.detail || body?.message || `${res.status} ${res.statusText}`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return body;
  } catch (err) {
    if (err instanceof TypeError) {
      // fetch itself rejected — no backend at this origin at all.
      const e = new Error('Backend nahi mila. Ye feature sirf local run mein kaam karta hai.');
      e.offline = true;
      throw e;
    }
    throw err;
  }
}

/** Is a Stable Diffusion server reachable through our backend? */
export async function checkAiStatus() {
  try {
    return await safeFetch('/api/ai/status');
  } catch (err) {
    return { available: false, reason: err.offline ? 'no_backend' : 'error', hint: err.message };
  }
}

export async function fetchAiPresets() {
  return safeFetch('/api/ai/presets');
}

/**
 * @param {object} p
 * @param {string} p.imageDataUrl  data:image/png;base64,... (the working photo)
 * @param {string} p.maskDataUrl   data:image/png;base64,... (white = regenerate)
 * @param {string} [p.preset]
 * @param {number} [p.steps]
 * @returns {Promise<{imageDataUrl: string, tookMs: number}>}
 */
export async function runAiEdit({ imageDataUrl, maskDataUrl, preset = 'remove_clutter', steps = 28 }) {
  const body = await safeFetch('/api/ai/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_base64: imageDataUrl,
      mask_base64: maskDataUrl,
      preset,
      steps,
    }),
  });
  return { imageDataUrl: body.image_base64, tookMs: body.took_ms };
}
