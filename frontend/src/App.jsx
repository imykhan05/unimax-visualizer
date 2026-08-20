import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ShadePanel from './components/ShadePanel.jsx';
import Canvas from './components/Canvas.jsx';
import Toolbar from './components/Toolbar.jsx';
import AppliedPanel from './components/AppliedPanel.jsx';
import ThemeSwitcher from './components/ThemeSwitcher.jsx';
import SchemeStudio from './components/SchemeStudio.jsx';
import AiCleanup from './components/AiCleanup.jsx';
import { exportReportPdf, downloadCanvasPng } from './utils/pdfExport.js';
import { THEMES, DEFAULT_THEME, ROTATE_MS, applyTheme } from './data/themes.js';

const MAX_W = 900;
const MAX_H = 640;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/** Decode the file and downscale it to fit MAX_W x MAX_H, aspect preserved. */
function loadResizedImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(MAX_W / img.naturalWidth, MAX_H / img.naturalHeight, 1);
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);

      const resized = new Image();
      resized.onload = () => resolve(resized);
      resized.onerror = () => reject(new Error('Image ko process nahi kar sake.'));
      resized.src = canvas.toDataURL('image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Yeh file image ke tor pe khul nahi rahi.'));
    };
    img.src = url;
  });
}

export default function App() {
  const [image, setImage] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [selectedShade, setSelectedShade] = useState(null);
  const [zones, setZones] = useState([]);
  const [pins, setPins] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [tolerance, setTolerance] = useState(40);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [themeKey, setThemeKey] = useState(
    () => localStorage.getItem('unimax.theme') || DEFAULT_THEME,
  );
  const [autoTheme, setAutoTheme] = useState(
    () => localStorage.getItem('unimax.autoTheme') !== 'off',
  );

  const canvasApi = useRef(null);
  const originalUrlRef = useRef(null);

  const notify = useCallback((message, kind = 'info') => {
    setToast({ message, kind });
    window.clearTimeout(notify._t);
    notify._t = window.setTimeout(() => setToast(null), 3200);
  }, []);

  // Apply the active theme and remember it.
  useEffect(() => {
    applyTheme(themeKey);
    localStorage.setItem('unimax.theme', themeKey);
  }, [themeKey]);

  // Auto-rotate through the palettes; pausing sticks on the current one.
  useEffect(() => {
    localStorage.setItem('unimax.autoTheme', autoTheme ? 'on' : 'off');
    if (!autoTheme) return undefined;
    const id = setInterval(() => {
      setThemeKey((current) => {
        const i = THEMES.findIndex((t) => t.key === current);
        return THEMES[(i + 1) % THEMES.length].key;
      });
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [autoTheme]);

  const handleUpload = useCallback(
    async (file) => {
      if (!ACCEPTED.includes(file.type)) {
        notify('Sirf JPG, PNG ya WEBP chalega.', 'error');
        return;
      }
      if (file.size > MAX_BYTES) {
        notify('Image 10MB se bari hai.', 'error');
        return;
      }
      try {
        const img = await loadResizedImage(file);
        setImage(img);
        setFileInfo({ name: file.name, width: img.naturalWidth, height: img.naturalHeight });
        setZones([]);
        setPins([]);
        setRedoStack([]);
        setZoom(1);
        originalUrlRef.current = img.src;
        notify(`${file.name} load ho gayi — ab shade select karo.`, 'success');
      } catch (err) {
        notify(err.message, 'error');
      }
    },
    [notify],
  );

  const addPin = useCallback((pin) => {
    setPins((prev) => [...prev, pin]);
  }, []);

  const removePin = useCallback((id) => {
    setPins((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearPins = useCallback(() => setPins([]), []);

  /** Paint every pending pin in one pass, then clear the pins. */
  const generate = useCallback(() => {
    if (!pins.length) return;
    setBusy(true);
    // Yield a frame so the progress indicator paints before the fills start.
    requestAnimationFrame(() => {
      try {
        const { zones: built, skipped } = canvasApi.current?.buildZones(pins) || {
          zones: [],
          skipped: [],
        };
        if (built.length) {
          setZones((prev) => [...prev, ...built]);
          setRedoStack([]);
        }
        setPins(skipped);
        if (skipped.length) {
          notify(
            `${built.length} jaga color lag gaya. ${skipped.length} point pe area nahi mila — tolerance barhao.`,
            skipped.length === pins.length ? 'error' : 'info',
          );
        } else {
          notify(`${built.length} jaga par color lag gaya.`, 'success');
        }
      } finally {
        setBusy(false);
      }
    });
  }, [pins, notify]);

  const undo = useCallback(() => {
    setZones((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (!prev.length) return prev;
      const zone = prev[prev.length - 1];
      setZones((z) => [...z, zone]);
      return prev.slice(0, -1);
    });
  }, []);

  const removeZone = useCallback((id) => {
    setZones((prev) => prev.filter((z) => z.id !== id));
  }, []);

  const doReset = useCallback(() => {
    setZones([]);
    setPins([]);
    setRedoStack([]);
    setConfirmReset(false);
    notify('Sab zones hat gaye — original photo wapas.', 'success');
  }, [notify]);

  // Keyboard shortcuts, skipped while typing in the report fields.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const usedCodes = useMemo(() => new Set(zones.map((z) => z.shade.code)), [zones]);
  const appliedShades = useMemo(
    () => [...new Map(zones.map((z) => [z.shade.code, z.shade])).values()],
    [zones],
  );
  const imageArea = image ? image.naturalWidth * image.naturalHeight : 0;

  const zoomFit = useCallback(() => setZoom(1), []);
  const zoomIn = useCallback(() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2))), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2))), []);

  const downloadPng = useCallback(async () => {
    const canvas = canvasApi.current?.getCanvas();
    if (!canvas) return;
    setBusy(true);
    try {
      const name = await downloadCanvasPng(canvas);
      notify(`${name} save ho gaya.`, 'success');
    } catch (err) {
      if (!err.quiet) notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }, [notify]);

  const downloadPdf = useCallback(async () => {
    const canvas = canvasApi.current?.getCanvas();
    if (!canvas) return;
    setBusy(true);
    try {
      const name = await exportReportPdf({
        originalImage: originalUrlRef.current,
        paintedImage: canvas.toDataURL('image/png'),
        shades: appliedShades,
        customerName,
        notes,
      });
      notify(`${name} save ho gaya.`, 'success');
    } catch (err) {
      if (!err.quiet) notify(`PDF banane mein masla: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }, [appliedShades, customerName, notes, notify]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  return (
    <div className="app">
      <Toolbar
        hasImage={!!image}
        fileInfo={fileInfo}
        onUpload={handleUpload}
        onUndo={undo}
        onRedo={redo}
        onReset={() => setConfirmReset(true)}
        onDownloadPng={downloadPng}
        onDownloadPdf={downloadPdf}
        canUndo={zones.length > 0}
        canRedo={redoStack.length > 0}
        tolerance={tolerance}
        onToleranceChange={setTolerance}
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomFit={zoomFit}
        onOpenDrawer={() => setDrawerOpen(true)}
        busy={busy}
        pinCount={pins.length}
        onGenerate={generate}
        onClearPins={clearPins}
        onAutoSchemes={() => setStudioOpen(true)}
        onAiClean={() => setAiOpen(true)}
        themeControl={
          <ThemeSwitcher
            themeKey={themeKey}
            onPick={setThemeKey}
            auto={autoTheme}
            onToggleAuto={() => setAutoTheme((v) => !v)}
          />
        }
      />

      <main className="layout">
        <ShadePanel
          selected={selectedShade}
          onSelect={(s) => {
            setSelectedShade(s);
            setDrawerOpen(false);
          }}
          usedCodes={usedCodes}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />

        <section
          className={`stage ${dragOver ? 'is-dragover' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {!image ? (
            <label className="dropzone">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = '';
                }}
              />
              <span className="dropzone-icon" aria-hidden="true">🏠</span>
              <strong>Ghar ya building ki photo yahan drop karo</strong>
              <span className="dropzone-sub">ya click karke browse karo — JPG, PNG, WEBP · max 10MB</span>
            </label>
          ) : (
            <>
              <Canvas
                ref={canvasApi}
                image={image}
                zones={zones}
                pins={pins}
                zoom={zoom}
                tolerance={tolerance}
                selectedShade={selectedShade}
                onPinAdded={addPin}
                onPinRemove={removePin}
                onNeedShade={() => {
                  notify('Pehle left se koi shade select karo.', 'error');
                  setDrawerOpen(true);
                }}
              />
              {busy && <div className="processing">Colors laga rahe hain…</div>}
            </>
          )}
        </section>

        <AppliedPanel
          zones={zones}
          pins={pins}
          onPinRemove={removePin}
          onGenerate={generate}
          onClearPins={clearPins}
          busy={busy}
          onRemove={removeZone}
          customerName={customerName}
          onCustomerName={setCustomerName}
          notes={notes}
          onNotes={setNotes}
          imageArea={imageArea}
        />
      </main>

      {confirmReset && (
        <div className="modal-scrim" onClick={() => setConfirmReset(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Sab kuch reset karein?</h3>
            <p>Saare applied zones hat jayenge aur original photo wapas aa jayegi.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={doReset}>
                Yes, Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {studioOpen && image && (
        <SchemeStudio image={image} onClose={() => setStudioOpen(false)} onNotify={notify} />
      )}

      {aiOpen && image && (
        <AiCleanup
          image={image}
          onNotify={notify}
          onClose={() => setAiOpen(false)}
          onAccept={(cleaned) => {
            // The AI-cleaned photo becomes the new working baseline — same
            // reset as a fresh upload, since old zones/pins were drawn
            // against pixels that photo no longer has.
            setImage(cleaned);
            setFileInfo((prev) => prev && { ...prev, width: cleaned.naturalWidth, height: cleaned.naturalHeight });
            setZones([]);
            setPins([]);
            setRedoStack([]);
            originalUrlRef.current = cleaned.src;
            setAiOpen(false);
            notify('AI se saaf ki hui photo ab active hai.', 'success');
          }}
        />
      )}

      {toast && <div className={`toast toast-${toast.kind}`}>{toast.message}</div>}

      <footer className="app-footer">
        Unimax Paint Industries — Islamic Republic of Pakistan
      </footer>
    </div>
  );
}
