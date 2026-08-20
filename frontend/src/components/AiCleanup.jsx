import { useCallback, useEffect, useRef, useState } from 'react';
import { detectZones } from '../utils/autoZones.js';
import { checkAiStatus, runAiEdit } from '../utils/aiEdit.js';
import { saveBlob, timestamp } from '../utils/pdfExport.js';

const BRUSH_MIN = 8;
const BRUSH_MAX = 90;

/**
 * Removes what recolouring cannot: a tree in front of the wall, wires, a
 * cluttered patch of ground. That means inventing what is behind the object,
 * which needs a diffusion model — this panel is only the front end for one
 * running locally (see backend/routers/ai.py). It never touches the network
 * beyond this machine's own backend.
 *
 * Flow: detect a starting mask automatically (foliage), let the user brush it
 * to match the actual photo, send photo + mask to the local bridge, and hand
 * the result back to the app as the new working photo.
 */
export default function AiCleanup({ image, onAccept, onClose, onNotify }) {
  const photoRef = useRef(null);
  const maskRef = useRef(null);
  const wrapRef = useRef(null);
  const drawing = useRef(false);
  const mode = useRef('add');

  const [status, setStatus] = useState({ loading: true });
  const [brush, setBrush] = useState(28);
  const [erase, setErase] = useState(false);
  const [preset, setPreset] = useState('remove_clutter');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null); // { dataUrl, tookMs, canvas }
  const [showBefore, setShowBefore] = useState(false);
  const [maskPixels, setMaskPixels] = useState(0);

  const w = image.naturalWidth;
  const h = image.naturalHeight;

  const refreshStatus = useCallback(() => {
    setStatus({ loading: true });
    checkAiStatus().then(setStatus);
  }, []);

  // Draw the photo once, and seed the mask from auto-detected foliage.
  useEffect(() => {
    const photo = photoRef.current;
    const mask = maskRef.current;
    photo.width = w;
    photo.height = h;
    mask.width = w;
    mask.height = h;
    photo.getContext('2d').drawImage(image, 0, 0);

    const octx = document.createElement('canvas');
    octx.width = w;
    octx.height = h;
    const c = octx.getContext('2d', { willReadFrequently: true });
    c.drawImage(image, 0, 0);
    const { clutterMask, clutterPixels } = detectZones(c.getImageData(0, 0, w, h));

    paintMaskFromArray(mask, clutterMask);
    setMaskPixels(clutterPixels || 0);
    refreshStatus();
  }, [image, w, h, refreshStatus]);

  // Loading clock — a real GPU run can take a while, so the wait needs a
  // visible heartbeat rather than a frozen button.
  useEffect(() => {
    if (!busy) return undefined;
    setElapsed(0);
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [busy]);

  const countMask = useCallback(() => {
    const ctx = maskRef.current.getContext('2d');
    const d = ctx.getImageData(0, 0, w, h).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    setMaskPixels(n);
  }, [w, h]);

  const canvasPoint = (e) => {
    const rect = photoRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * w,
      y: ((e.clientY - rect.top) / rect.height) * h,
    };
  };

  const strokeAt = (x, y) => {
    const ctx = maskRef.current.getContext('2d');
    ctx.globalCompositeOperation = mode.current === 'erase' ? 'destination-out' : 'source-over';
    ctx.fillStyle = 'rgba(230, 60, 40, 1)';
    ctx.beginPath();
    ctx.arc(x, y, brush, 0, Math.PI * 2);
    ctx.fill();
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    drawing.current = true;
    mode.current = erase ? 'erase' : 'add';
    const p = canvasPoint(e);
    strokeAt(p.x, p.y);
  };
  const onPointerMove = (e) => {
    if (!drawing.current) return;
    const p = canvasPoint(e);
    strokeAt(p.x, p.y);
  };
  const endStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    countMask();
  };

  const resetToDetected = () => {
    const octx = document.createElement('canvas');
    octx.width = w;
    octx.height = h;
    const c = octx.getContext('2d', { willReadFrequently: true });
    c.drawImage(image, 0, 0);
    const { clutterMask, clutterPixels } = detectZones(c.getImageData(0, 0, w, h));
    paintMaskFromArray(maskRef.current, clutterMask);
    setMaskPixels(clutterPixels || 0);
  };

  const clearMask = () => {
    maskRef.current.getContext('2d').clearRect(0, 0, w, h);
    setMaskPixels(0);
  };

  const generate = async () => {
    if (!maskPixels) {
      onNotify?.('Pehle mask lagao — jo hissa hataana hai wahan brush karo.', 'error');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const imageDataUrl = photoRef.current.toDataURL('image/png');
      const maskDataUrl = buildBwMask(maskRef.current, w, h).toDataURL('image/png');
      const { imageDataUrl: outUrl, tookMs } = await runAiEdit({ imageDataUrl, maskDataUrl, preset });

      const outImg = new Image();
      await new Promise((res, rej) => {
        outImg.onload = res;
        outImg.onerror = () => rej(new Error('Natija image decode nahi hui.'));
        outImg.src = outUrl;
      });
      const outCanvas = document.createElement('canvas');
      outCanvas.width = w;
      outCanvas.height = h;
      outCanvas.getContext('2d').drawImage(outImg, 0, 0);

      setResult({ dataUrl: outUrl, tookMs, canvas: outCanvas });
      onNotify?.(`Ho gaya — ${(tookMs / 1000).toFixed(1)}s mein.`, 'success');
    } catch (err) {
      onNotify?.(err.message || 'AI edit nakaam hui.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const acceptResult = async () => {
    if (!result) return;
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = result.dataUrl;
    });
    onAccept(img);
  };

  const downloadResult = async () => {
    if (!result) return;
    const blob = await new Promise((r) => result.canvas.toBlob(r, 'image/png'));
    try {
      const name = await saveBlob(`unimax-ai-clean-${timestamp()}.png`, blob);
      onNotify?.(`${name} save ho gaya.`, 'success');
    } catch (err) {
      if (!err.quiet) onNotify?.(err.message, 'error');
    }
  };

  return (
    <div className="studio-scrim" onClick={onClose}>
      <div className="studio ai-studio" onClick={(e) => e.stopPropagation()}>
        <header className="studio-head">
          <div>
            <h2>AI se Saaf Karo</h2>
            <p className="panel-sub">
              Darakht, taarein ya jangla hataane ke liye jagah brush karo, phir Generate dabao.
            </p>
          </div>
          <div className="studio-actions">
            <button className="btn" onClick={onClose}>Band karo</button>
          </div>
        </header>

        <StatusBar status={status} onRecheck={refreshStatus} />

        <div className="ai-body">
          <div className="ai-canvas-wrap" ref={wrapRef}>
            {!result && (
              <>
                <canvas ref={photoRef} className="ai-photo" />
                <canvas
                  ref={maskRef}
                  className="ai-mask"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={endStroke}
                  onPointerLeave={endStroke}
                  onPointerCancel={endStroke}
                  style={{ touchAction: 'none' }}
                />
              </>
            )}
            {result && (
              <img
                className="ai-photo ai-result-img"
                src={showBefore ? photoRef.current?.toDataURL('image/png') : result.dataUrl}
                alt={showBefore ? 'Pehle' : 'AI ke baad'}
              />
            )}
          </div>

          <aside className="ai-side">
            {!result ? (
              <>
                <div className="ai-tool-row">
                  <button
                    className={`btn ${!erase ? 'is-on' : ''}`}
                    onClick={() => setErase(false)}
                  >
                    ✏ Brush
                  </button>
                  <button
                    className={`btn ${erase ? 'is-on' : ''}`}
                    onClick={() => setErase(true)}
                  >
                    ⌫ Eraser
                  </button>
                </div>

                <label className="ai-slider">
                  Brush size <b>{brush}</b>
                  <input
                    type="range"
                    min={BRUSH_MIN}
                    max={BRUSH_MAX}
                    value={brush}
                    onChange={(e) => setBrush(Number(e.target.value))}
                  />
                </label>

                <div className="ai-tool-row">
                  <button className="btn" onClick={resetToDetected}>↻ Auto-detect</button>
                  <button className="btn" onClick={clearMask}>Clear</button>
                </div>

                <label className="ai-select">
                  Kaam
                  <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                    <option value="remove_clutter">Darakht/taarein hataao</option>
                    <option value="tidy_surroundings">Saamne ka hissa saaf karo</option>
                  </select>
                </label>

                <p className="ai-hint">
                  Laal rang = ye hissa dobara banega. {maskPixels ? `${maskPixels.toLocaleString()} pixels chuni hui.` : 'Abhi kuch nahi chuna gaya.'}
                </p>

                <button
                  className="btn btn-generate full"
                  onClick={generate}
                  disabled={busy || !status.available || !maskPixels}
                >
                  {busy ? `⏳ Ban raha hai… ${elapsed}s` : '✦ Generate'}
                </button>
                {!status.available && !status.loading && (
                  <p className="ai-hint ai-hint-warn">
                    Stable Diffusion server nahi mila — upar dekho.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="ai-hint">{(result.tookMs / 1000).toFixed(1)} second mein tayyar hua.</p>
                <button className="btn" onClick={() => setShowBefore((v) => !v)}>
                  {showBefore ? 'Baad wali dikhao' : 'Pehle wali dikhao'}
                </button>
                <button className="btn btn-generate full" onClick={acceptResult}>
                  ✓ Ye photo use karo
                </button>
                <button className="btn" onClick={downloadResult}>⤓ PNG download</button>
                <button className="btn" onClick={() => setResult(null)}>↻ Dobara try karo</button>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function StatusBar({ status, onRecheck }) {
  if (status.loading) {
    return <div className="ai-status ai-status-loading">Stable Diffusion check ho raha hai…</div>;
  }
  if (status.available) {
    return (
      <div className="ai-status ai-status-ok">
        ● Connected — {status.model || 'model'}
        <button className="link-btn" onClick={onRecheck}>recheck</button>
      </div>
    );
  }
  return (
    <div className="ai-status ai-status-bad">
      <span>
        ● Stable Diffusion nahi mila. {status.hint || 'Backend + WebUI (--api) chalao.'}
      </span>
      <button className="link-btn" onClick={onRecheck}>dobara check karo</button>
    </div>
  );
}

/** Paint a Uint8Array(0/1) mask onto a canvas as solid translucent-on-composite red. */
function paintMaskFromArray(canvas, arr) {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  if (!arr) return;
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < arr.length; i++) {
    if (!arr[i]) continue;
    const p = i * 4;
    img.data[p] = 230;
    img.data[p + 1] = 60;
    img.data[p + 2] = 40;
    img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Pure black/white mask for the API: white wherever the paint layer has any alpha. */
function buildBwMask(maskCanvas, w, h) {
  const src = maskCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const on = src[i * 4 + 3] > 0;
    const v = on ? 255 : 0;
    const p = i * 4;
    img.data[p] = v;
    img.data[p + 1] = v;
    img.data[p + 2] = v;
    img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}
