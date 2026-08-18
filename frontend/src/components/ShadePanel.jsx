import { useMemo, useState } from 'react';
import SHADES from '../data/shades.js';
import { contrastText } from '../utils/colorBlend.js';

export default function ShadePanel({ selected, onSelect, usedCodes, open, onClose }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHADES;
    return SHADES.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <>
      <div
        className={`drawer-scrim ${open ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`shade-panel ${open ? 'is-open' : ''}`} aria-label="Unimax shades">
        <header className="panel-head">
          <div>
            <h2>Unimax Shades</h2>
            <p className="panel-sub">Wall Emulsion · Flat Sheen</p>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close shade panel">
            ✕
          </button>
        </header>

        <div className="search-wrap">
          <input
            className="search-input"
            type="search"
            placeholder="Search name ya code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search shades"
          />
        </div>

        <div className="shade-list" role="listbox" aria-label="Shade list">
          {filtered.map((shade) => {
            const isSelected = selected?.code === shade.code;
            const isUsed = usedCodes.has(shade.code);
            return (
              <button
                key={shade.code}
                role="option"
                aria-selected={isSelected}
                className={`shade-row ${isSelected ? 'is-selected' : ''}`}
                onClick={() => onSelect(shade)}
                title={`${shade.name} (${shade.code})`}
              >
                <span className="swatch-wrap">
                  <span className="swatch" style={{ background: shade.hex }} />
                  {/* paint-drip: a 2px bar runs down from the swatch on hover */}
                  <span className="drip" style={{ background: shade.hex }} />
                </span>
                <span className="shade-meta">
                  <span className="shade-name">{shade.name}</span>
                  <span className="shade-code">{shade.code}</span>
                </span>
                {isUsed && <span className="used-dot" title="Already applied" />}
              </button>
            );
          })}
          {!filtered.length && <p className="empty-note">Koi shade nahi mila.</p>}
        </div>

        {selected && (
          <div className="selected-card" style={{ background: selected.hex }}>
            <div className="selected-inner" style={{ color: contrastText(selected.hex) }}>
              <strong>{selected.name}</strong>
              <span>
                {selected.code} · {selected.hex.toUpperCase()}
              </span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
