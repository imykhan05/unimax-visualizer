import { useCallback, useEffect, useRef, useState } from 'react';
import { detectZones } from '../utils/autoZones.js';
import { cleanSky } from '../utils/skyCleanup.js';
import { applyPaintColor } from '../utils/colorBlend.js';
import { renderSchemeCard } from '../utils/schemeCard.js';
import { COMBINATIONS, schemeShades } from '../data/combinations.js';
import { saveBlob, timestamp } from '../utils/pdfExport.js';
import { jsPDF } from 'jspdf';

const ROLE_LABEL = { wall: 'Deewarein', trim: 'Trim / bands', gate: 'Gate' };

/**
 * One photo in, a board per colour scheme out.
 *
 * Surfaces are detected once, then every scheme is just a repaint of those same
 * masks — which is why a dozen schemes take about a second rather than a dozen
 * rounds of clicking.
 */
export default function SchemeStudio({ image, onClose, onNotify }) {
  const [stage, setStage] = useState('detecting');
  const [roles, setRoles] = useState([]);
  const [cards, setCards] = useState([]);
  const [progress, setProgress] = useState(0);
  const [tidySky, setTidySky] = useState(true);
  // A run token rather than a boolean: a remount (React runs effects twice in
  // development) or a re-run must invalidate only the *older* pass, not leave
  // the component permanently cancelled.
  const runToken = useRef(0);
  useEffect(() => () => { runToken.current += 1; }, []);

  const run = useCallback(async () => {
    const token = (runToken.current += 1);
    const alive = () => runToken.current === token;

    setStage('detecting');
    setCards([]);
    setProgress(0);

    const oc = document.createElement('canvas');
    oc.width = image.naturalWidth;
    oc.height = image.naturalHeight;
    const octx = oc.getContext('2d', { willReadFrequently: true });
    octx.drawImage(image, 0, 0);
    const base = octx.getImageData(0, 0, oc.width, oc.height);

    await new Promise((r) => requestAnimationFrame(r));
    const { roles: found, skyMask } = detectZones(base);
    if (!alive()) return;

    // Tidy the sky once, on the base image, so every scheme inherits it.
    if (tidySky && skyMask) {
      cleanSky(base, skyMask);
      octx.putImageData(base, 0, 0);
    }

    if (!found.length) {
      setStage('empty');
      return;
    }
    setRoles(found);
    setStage('painting');

    const available = found.map((r) => r.role);
    const made = [];
    for (let i = 0; i < COMBINATIONS.length; i++) {
      if (!alive()) return;
      const scheme = COMBINATIONS[i];
      const frame = new ImageData(
        new Uint8ClampedArray(base.data), base.width, base.height,
      );
      for (const r of found) {
        const shade = scheme.roles[r.role];
        if (shade) applyPaintColor(frame, r.mask, shade.hex);
      }
      const pc = document.createElement('canvas');
      pc.width = base.width;
      pc.height = base.height;
      pc.getContext('2d').putImageData(frame, 0, 0);

      const shades = schemeShades(scheme, available);
      const card = renderSchemeCard({ painted: pc, original: oc, shades, schemeName: scheme.name });
      made.push({
        id: scheme.id,
        name: scheme.name,
        shades,
        url: card.toDataURL('image/png'),
        card,
        w: card.width,
        h: card.height,
      });

      setProgress(i + 1);
      setCards([...made]);
      // Let the browser paint between schemes so the grid fills in visibly.
      await new Promise((r) => setTimeout(r, 0));
    }
    setStage('done');
  }, [image, tidySky]);

  useEffect(() => { run(); }, [run]);

  const downloadOne = async (c) => {
    const blob = await new Promise((r) => c.card.toBlob(r, 'image/png'));
    try {
      const name = await saveBlob(`unimax-${c.name.toLowerCase().replace(/\s+/g, '-')}-${timestamp()}.png`, blob);
      onNotify?.(`${name} save ho gaya.`, 'success');
    } catch (err) {
      if (!err.quiet) onNotify?.(err.message, 'error');
    }
  };

  const downloadAllPdf = async () => {
    if (!cards.length) return;
    const first = cards[0].card;
    const landscape = first.width >= first.height;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: landscape ? 'l' : 'p' });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();

    cards.forEach((c, i) => {
      if (i) doc.addPage();
      const scale = Math.min((pw - 40) / c.card.width, (ph - 40) / c.card.height);
      const w = c.card.width * scale;
      const h = c.card.height * scale;
      doc.addImage(c.url, 'PNG', (pw - w) / 2, (ph - h) / 2, w, h, undefined, 'FAST');
    });

    try {
      const name = await saveBlob(`unimax-schemes-${timestamp()}.pdf`, doc.output('blob'));
      onNotify?.(`${name} save ho gaya (${cards.length} schemes).`, 'success');
    } catch (err) {
      if (!err.quiet) onNotify?.(err.message, 'error');
    }
  };

  return (
    <div className="studio-scrim" onClick={onClose}>
      <div className="studio" onClick={(e) => e.stopPropagation()}>
        <header className="studio-head">
          <div>
            <h2>Auto Colour Schemes</h2>
            <p className="panel-sub">
              {stage === 'detecting' && 'Surfaces dhoond rahe hain…'}
              {stage === 'painting' && `${progress} / ${COMBINATIONS.length} schemes ban rahe hain…`}
              {stage === 'done' && `${cards.length} schemes tayyar`}
              {stage === 'empty' && 'Is photo mein koi surface nahi mila'}
            </p>
          </div>
          <div className="studio-actions">
            <label className="tidy-toggle" title="Aasman se badal, taarein aur antenna hata do">
              <input
                type="checkbox"
                checked={tidySky}
                onChange={(e) => setTidySky(e.target.checked)}
                disabled={stage === 'detecting' || stage === 'painting'}
              />
              Sky saaf karo
            </label>
            <button className="btn" onClick={run} disabled={stage === 'detecting' || stage === 'painting'}>
              ↻ Dobara
            </button>
            <button className="btn btn-accent" onClick={downloadAllPdf} disabled={!cards.length}>
              ⤓ Sab PDF mein
            </button>
            <button className="btn" onClick={onClose}>Band karo</button>
          </div>
        </header>

        {roles.length > 0 && (
          <div className="studio-roles">
            {roles.map((r) => (
              <span key={r.role} className="role-pill">
                <i style={{ background: r.meanHex }} />
                {ROLE_LABEL[r.role] || r.role}
              </span>
            ))}
            <span className="role-note">
              Auto-detect pehla andaza hai — galat lage to Band karke khud pins laga lo.
            </span>
          </div>
        )}

        <div className="studio-grid">
          {cards.map((c) => (
            <figure className="scheme-card" key={c.id}>
              {/* Intrinsic size up front: without it the grid sizes its rows
                  before the image decodes and then clips the card. */}
              <img src={c.url} alt={c.name} width={c.w} height={c.h} loading="lazy" />
              <figcaption>
                <div>
                  <strong>{c.name}</strong>
                  <span>{c.shades.map((s) => s.code).join(' · ')}</span>
                </div>
                <button className="btn btn-icon" onClick={() => downloadOne(c)} title="PNG download">
                  ⤓
                </button>
              </figcaption>
            </figure>
          ))}
          {(stage === 'detecting' || stage === 'painting') && (
            <div className="studio-loading">Kaam ho raha hai…</div>
          )}
          {stage === 'empty' && (
            <p className="empty-note">
              Koi paintable surface nahi mila. Aisi photo lo jismein deewar saaf dikhe.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
