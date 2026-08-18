import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { floodFillMask, dilateMask } from '../utils/floodFill.js';
import { applyPaintColor } from '../utils/colorBlend.js';

/**
 * Renders the photo and repaints it from the zone list.
 *
 * Each zone caches the mask it was created with, computed against the *original*
 * pixels. That keeps zones independent of each other — undo, redo and reordering
 * just replay the list — and repainting is then only a per-zone LAB blend.
 */
const Canvas = forwardRef(function Canvas(
  {
    image,
    zones,
    zoom,
    tolerance,
    selectedShade,
    onZoneCreated,
    onNeedShade,
    onBusyChange,
  },
  ref,
) {
  const canvasRef = useRef(null);
  const originalDataRef = useRef(null);
  const wrapRef = useRef(null);
  const pointerStart = useRef(null);
  const [hint, setHint] = useState(null);

  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    getOriginalDataUrl: () => {
      const c = document.createElement('canvas');
      if (!image) return null;
      c.width = image.naturalWidth;
      c.height = image.naturalHeight;
      c.getContext('2d').drawImage(image, 0, 0);
      return c.toDataURL('image/png');
    },
  }), [image]);

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

  const paintAt = useCallback(
    (clientX, clientY) => {
      const canvas = canvasRef.current;
      const original = originalDataRef.current;
      if (!canvas || !original) return;
      if (!selectedShade) {
        onNeedShade?.();
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const x = Math.round(((clientX - rect.left) / rect.width) * canvas.width);
      const y = Math.round(((clientY - rect.top) / rect.height) * canvas.height);
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

      onBusyChange?.(true);
      // Yield one frame so the "Applying…" indicator actually paints before the
      // main thread goes into the fill.
      requestAnimationFrame(() => {
        try {
          const { mask, count } = floodFillMask(original, x, y, tolerance);
          if (!count) {
            setHint('Is point pe koi area nahi mila — tolerance barhao.');
            return;
          }
          const grown = dilateMask(mask, original.width, original.height, 2);
          onZoneCreated({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            shade: selectedShade,
            x,
            y,
            tolerance,
            pixels: count,
            mask: grown,
          });
          setHint(null);
        } finally {
          onBusyChange?.(false);
        }
      });
    },
    [selectedShade, tolerance, onZoneCreated, onNeedShade, onBusyChange],
  );

  // Pointer events cover mouse and touch alike; a drag past ~10px is a pan/scroll,
  // not a tap, so it must not drop paint.
  const handlePointerDown = (e) => {
    pointerStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };

  const handlePointerUp = (e) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved > 10 || Date.now() - start.t > 900) return;
    paintAt(e.clientX, e.clientY);
  };

  if (!image) return null;

  return (
    <div className="canvas-scroll" ref={wrapRef}>
      <div className="canvas-stage" style={{ width: `${image.naturalWidth * zoom}px` }}>
        <canvas
          ref={canvasRef}
          className="paint-canvas"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => (pointerStart.current = null)}
          style={{ width: '100%', height: 'auto', touchAction: 'pan-x pan-y pinch-zoom' }}
        />
      </div>
      {hint && <p className="canvas-hint">{hint}</p>}
    </div>
  );
});

export default Canvas;
