import { contrastText } from '../utils/colorBlend.js';

export default function AppliedPanel({
  zones,
  pins = [],
  onPinRemove,
  onGenerate,
  onClearPins,
  busy,
  onRemove,
  customerName,
  onCustomerName,
  notes,
  onNotes,
  imageArea,
}) {
  return (
    <aside className="applied-panel" aria-label="Applied shades">
      <header className="panel-head">
        <div>
          <h2>Applied Shades</h2>
          <p className="panel-sub">{zones.length} zone{zones.length === 1 ? '' : 's'}</p>
        </div>
      </header>

      {pins.length > 0 && (
        <div className="pending">
          <div className="pending-head">
            <strong>{pins.length} jagah chuni hui</strong>
            <button className="link-btn" onClick={onClearPins}>
              clear
            </button>
          </div>
          <div className="pending-list">
            {pins.map((pin, i) => (
              <div className="zone-row" key={pin.id}>
                <span className="zone-index pin-index">{i + 1}</span>
                <span className="swatch zone-swatch" style={{ background: pin.shade.hex }} />
                <span className="zone-meta">
                  <span className="shade-name">{pin.shade.name}</span>
                  <span className="shade-code">
                    {pin.shade.code} · tolerance {pin.tolerance}
                  </span>
                </span>
                <button
                  className="zone-remove"
                  onClick={() => onPinRemove(pin.id)}
                  aria-label={`Remove pin ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button className="btn btn-generate full" onClick={onGenerate} disabled={busy}>
            ✦ Generate — colors lagao
          </button>
        </div>
      )}

      <div className="zone-list">
        {!zones.length && !pins.length && (
          <p className="empty-note">
            Image pe jis deewar pe color chahiye wahan click karo, shade chuno, phir
            Generate dabao.
          </p>
        )}
        {!zones.length && pins.length > 0 && (
          <p className="empty-note">Generate dabate hi ye colors lag jayenge.</p>
        )}
        {zones.map((zone, i) => {
          const pct = imageArea ? ((zone.pixels / imageArea) * 100).toFixed(1) : null;
          return (
            <div className="zone-row" key={zone.id}>
              <span className="zone-index">{i + 1}</span>
              <span className="swatch zone-swatch" style={{ background: zone.shade.hex }} />
              <span className="zone-meta">
                <span className="shade-name">{zone.shade.name}</span>
                <span className="shade-code">
                  {zone.shade.code} · {zone.shade.hex.toUpperCase()}
                  {pct ? ` · ${pct}% area` : ''}
                </span>
              </span>
              <button
                className="zone-remove"
                onClick={() => onRemove(zone.id)}
                aria-label={`Remove ${zone.shade.name}`}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {zones.length > 0 && (
        <div className="legend">
          {[...new Map(zones.map((z) => [z.shade.code, z.shade])).values()].map((s) => (
            <span key={s.code} className="legend-pill" style={{ background: s.hex, color: contrastText(s.hex) }}>
              {s.code}
            </span>
          ))}
        </div>
      )}

      <div className="report-fields">
        <h3>Report Details</h3>
        <label htmlFor="customer">Customer / Project</label>
        <input
          id="customer"
          className="text-input"
          value={customerName}
          onChange={(e) => onCustomerName(e.target.value)}
          placeholder="Naam ya project"
        />
        <label htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          className="text-input"
          rows="3"
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          placeholder="Koi note PDF ke liye…"
        />
      </div>
    </aside>
  );
}
