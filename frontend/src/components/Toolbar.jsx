import { useRef } from 'react';

export default function Toolbar({
  hasImage,
  fileInfo,
  onUpload,
  onUndo,
  onRedo,
  onReset,
  onDownloadPng,
  onDownloadPdf,
  canUndo,
  canRedo,
  tolerance,
  onToleranceChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onOpenDrawer,
  busy,
  pinCount,
  onGenerate,
  onClearPins,
  onAutoSchemes,
  themeControl,
}) {
  const inputRef = useRef(null);

  return (
    <header className="toolbar">
      <div className="toolbar-row toolbar-brand">
        <button className="drawer-toggle" onClick={onOpenDrawer} aria-label="Open shades">
          ☰
        </button>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div className="brand-text">
            <strong>Unimax Paint Visualizer</strong>
            <span>{fileInfo ? `${fileInfo.name} · ${fileInfo.width}×${fileInfo.height}` : 'Photo upload karo, shade lagao'}</span>
          </div>
        </div>
        <div className="spacer" />
        {themeControl}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = '';
          }}
        />
        <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>
          {hasImage ? 'Change Photo' : 'Upload Photo'}
        </button>
      </div>

      {hasImage && (
        <div className="toolbar-row toolbar-tools">
          <div className="tool-group generate-group">
            <button
              className="btn btn-generate"
              onClick={onGenerate}
              disabled={!pinCount || busy}
              title={pinCount ? `${pinCount} point pe color lagao` : 'Pehle image pe click kar ke jagah chuno'}
            >
              ✦ Generate{pinCount ? ` (${pinCount})` : ''}
            </button>
            <button className="btn" onClick={onClearPins} disabled={!pinCount}>
              Clear Pins
            </button>
            <button className="btn btn-primary" onClick={onAutoSchemes} title="Ek photo se saari colour schemes">
              ✧ Auto Schemes
            </button>
          </div>

          <div className="tool-group">
            <button className="btn" onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">
              ↩ Undo
            </button>
            <button className="btn" onClick={onRedo} disabled={!canRedo} title="Ctrl+Y">
              ↪ Redo
            </button>
            <button className="btn btn-danger" onClick={onReset}>
              Reset
            </button>
          </div>

          <div className="tool-group tolerance-group">
            <label htmlFor="tolerance">
              Tolerance <b>{tolerance}</b>
            </label>
            <input
              id="tolerance"
              type="range"
              min="20"
              max="80"
              value={tolerance}
              onChange={(e) => onToleranceChange(Number(e.target.value))}
            />
            <span className="tip">Zyada tolerance = zyada area select hoga</span>
          </div>

          <div className="tool-group zoom-group">
            <button className="btn btn-icon" onClick={onZoomOut} aria-label="Zoom out">
              −
            </button>
            <span className="zoom-value">{Math.round(zoom * 100)}%</span>
            <button className="btn btn-icon" onClick={onZoomIn} aria-label="Zoom in">
              +
            </button>
            <button className="btn" onClick={onZoomFit}>
              Fit
            </button>
          </div>

          <div className="tool-group">
            <button className="btn" onClick={onDownloadPng} disabled={busy}>
              ⤓ PNG
            </button>
            <button className="btn btn-accent" onClick={onDownloadPdf} disabled={busy}>
              ⤓ PDF Report
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
