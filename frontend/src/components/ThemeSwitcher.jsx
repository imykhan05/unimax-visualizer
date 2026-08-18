import { useEffect, useRef, useState } from 'react';
import { THEMES, getTheme } from '../data/themes.js';

export default function ThemeSwitcher({ themeKey, onPick, auto, onToggleAuto }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const active = getTheme(themeKey);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDocDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('pointerdown', onDocDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="theme-wrap" ref={wrapRef}>
      <button
        className="btn theme-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Theme: ${active.name}`}
      >
        <span className="theme-dots" aria-hidden="true">
          {active.swatch.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </span>
        <span className="theme-label">{active.name}</span>
      </button>

      <button
        className={`btn btn-icon auto-btn ${auto ? 'is-on' : ''}`}
        onClick={onToggleAuto}
        aria-pressed={auto}
        title={auto ? 'Auto theme change: ON — band karne ke liye click' : 'Auto theme change: OFF'}
      >
        {auto ? '🔄' : '⏸'}
      </button>

      {open && (
        <div className="theme-menu" role="listbox" aria-label="Themes">
          {THEMES.map((t) => (
            <button
              key={t.key}
              role="option"
              aria-selected={t.key === themeKey}
              className={`theme-option ${t.key === themeKey ? 'is-active' : ''}`}
              onClick={() => {
                onPick(t.key);
                setOpen(false);
              }}
            >
              <span className="theme-dots" aria-hidden="true">
                {t.swatch.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              {t.name}
            </button>
          ))}
          <p className="theme-note">
            Auto mode har 45 second baad agli theme pe chala jaata hai.
          </p>
        </div>
      )}
    </div>
  );
}
