import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { floodFillMask, dilateMask } from '../utils/floodFill.js';
import { applyPaintColor } from '../utils/colorBlend.js';
import { contrastText } from '../utils/colorBlend.js';

/**
 * Renders the photo, the pending pins, and the painted zones.
 *
 * Clicking only drops a pin — the actual paint happens when Generate runs, so a
 * customer can mark every wall with the shade they want and see the whole scheme
 * appear at once.
 *
 * Each zone caches the mask it was built with, computed against the *original*
 * pixels. That keeps zones independent of each other — undo, redo and removal
 * just replay the list — and repainting is then only a per-zone LAB blend.
 */
const Canvas = forwardRef(function Canvas(
  { image, zones, pins, zoom, tolerance, selectedShade, onPinAdded, onNeedShade, onPinRemove },
  ref,
) {
  const canvasRef = useRef(null);
  const originalDataRef = useRef(null);
  const pointerStart = useRef(null);
  const [hint, setHint] = useState(null);

  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,

    /**
     * Turn pending pins into painted zones. Returns { zones, skipped } so the
     * caller can report pins that found no region instead of silently dropping
     * them.
     */
    buildZones(pinList) {
      const original = originalDataRef.current;
      if (!original) return { zones: [], skipped: [] };
      const built = [];
      const skipped = [];
      for (const pin of pinList) {
        const { mask, count } = floodFillMask(original, pin.x, pin.y, pin.tolerance);
        if (!count) {
          skipped.push(pin);
          continue;
        }
        built.push({
          id: pin.id,
          shade: pin.shade,
          x: pin.x,
          y: pin.y,
          tolerance: pin.tolerance,
          pixels: count,
          mask: dilateMask(mask, original.width, original.height, 2),
        });
      }
      return { zones: built, skipped };
    },
  }), []);

  // Load the source image into the canvas and cache its pixels once.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    originalDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, [image]);

  // Repaint: original pixels + every zone, in order.
  useEffect(() => {
    const canvas = canvasRef.current;
    const original = originalDataRef.current;
    if (!canvas || !original) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const frame = new ImageData(
      new Uint8ClampedArray(original.data),
      original.width,
      original.height,
    );
    for (const zone of zones) {
      applyPaintColor(frame, zone.mask, zone.shade.hex);
    }
    ctx.putImageData(frame, 0, 0);
  }, [zones, image]);

  const pinAt = useCallback(
    (clientX, clientY) => {
      const canvas = canvasRef.current;
      if (!canvas || !originalDataRef.current) return;
      if (!selectedShade) {
        onNeedShade?.();
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const x = Math.round(((clientX - rect.left) / rect.width) * canvas.width);
      const y = Math.round(((clientY - rect.top) / rect.height) * canvas.height);
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

      onPinAdded({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        shade: selectedShade,
        x,
        y,
        tolerance,
      });
      setHint(null);
    },
    [selectedShade, tolerance, onPinAdded, onNeedShade],
  );

  // Pointer events cover mouse and touch alike; a drag past ~10px is a pan or
  // scroll, not a tap, so it must not drop a pin.
  const handlePointerDown = (e) => {
    pointerStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };

  const handlePointerUp = (e) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved > 10 || Date.now() - start.t > 900) return;
    pinAt(e.clientX, e.clientY);
  };

  if (!image) return null;

  const w = image.naturalWidth;
  const h = image.naturalHeight;

  return (
    <div className="canvas-scroll">
      <div className="canvas-stage" style={{ width: `${w * zoom}px` }}>
        <canvas
          ref={canvasRef}
          className="paint-canvas"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => (pointerStart.current = null)}
          style={{ width: '100%', height: 'auto', touchAction: 'pan-x pan-y pinch-zoom' }}
        />

        {/* Pending pins sit on top of the canvas, positioned in percentages so
            they track the image at any zoom level. */}
        {pins.map((pin, i) => (
          <button
            key={pin.id}
            className="pin"
            style={{
              left: `${(pin.x / w) * 100}%`,
              top: `${(pin.y / h) * 100}%`,
              background: pin.shade.hex,
              color: contrastText(pin.shade.hex),
            }}
            title={`${i + 1}. ${pin.shade.name} (${pin.shade.code}) — hatane ke liye click karo`}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onPinRemove(pin.id);
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {hint && <p className="canvas-hint">{hint}</p>}
    </div>
  );
});

export default Canvas;
