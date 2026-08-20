// Renders the shareable scheme board: the repainted photo, the original for
// comparison, the brand mark, and the shades used with their codes — the sheet
// a shop actually hands to a customer.

import { contrastText } from './colorBlend.js';

const CARD_W = 1400;
const PAD = 34;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCover(ctx, src, x, y, w, h) {
  const sw = src.width || src.naturalWidth;
  const sh = src.height || src.naturalHeight;
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

/**
 * @param {object} p
 * @param {HTMLCanvasElement|HTMLImageElement} p.painted  the repainted photo
 * @param {HTMLCanvasElement|HTMLImageElement} p.original the untouched photo
 * @param {Array} p.shades  [{ name, code, hex, roleLabel }]
 * @param {string} p.schemeName
 * @returns {HTMLCanvasElement}
 */
export function renderSchemeCard({ painted, original, shades, schemeName }) {
  const pw = painted.width || painted.naturalWidth;
  const ph = painted.height || painted.naturalHeight;

  const heroH = Math.round((CARD_W * ph) / pw);
  const footH = 340;
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = heroH + footH;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // --- hero: the repainted photo ---
  ctx.drawImage(painted, 0, 0, CARD_W, heroH);

  // --- footer ---
  const footY = heroH;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, footY, CARD_W, footH);

  // original photo, bottom-left
  const thumbW = Math.round(CARD_W * 0.42);
  const thumbH = footH - PAD * 2;
  drawCover(ctx, original, PAD, footY + PAD, thumbW, thumbH);
  ctx.strokeStyle = '#DFE3E8';
  ctx.lineWidth = 2;
  ctx.strokeRect(PAD, footY + PAD, thumbW, thumbH);

  ctx.fillStyle = 'rgba(15, 28, 46, 0.82)';
  ctx.fillRect(PAD, footY + PAD, 118, 30);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('BEFORE', PAD + 14, footY + PAD + 21);

  // brand block
  const rightX = PAD * 2 + thumbW;
  let y = footY + PAD + 16;

  ctx.fillStyle = '#0F1C2E';
  ctx.font = '700 30px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('UNIMAX', rightX, y + 12);
  const unimaxW = ctx.measureText('UNIMAX').width;
  ctx.fillStyle = '#E85D20';
  ctx.font = '400 30px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(' Paints', rightX + unimaxW, y + 12);

  ctx.fillStyle = '#4A6A90';
  ctx.font = '400 15px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(schemeName ? `Scheme: ${schemeName}` : 'Colour Scheme', rightX, y + 40);

  // swatch rows
  y += 68;
  const rowH = Math.min(58, Math.floor((footH - PAD * 2 - 78) / Math.max(1, shades.length)));
  const chip = Math.min(46, rowH - 8);

  ctx.font = '400 17px "Segoe UI", system-ui, sans-serif';
  for (const s of shades) {
    ctx.fillStyle = s.hex;
    roundRect(ctx, rightX, y, chip * 1.5, chip, 6);
    ctx.fill();
    ctx.strokeStyle = '#D5DBE3';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const tx = rightX + chip * 1.5 + 18;
    ctx.fillStyle = '#16202E';
    ctx.font = '600 18px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(s.name, tx, y + chip / 2 - 2);
    ctx.fillStyle = '#5B7CA3';
    ctx.font = '400 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`${s.code}${s.roleLabel ? ` · ${s.roleLabel}` : ''}`, tx, y + chip / 2 + 18);

    y += rowH;
  }

  // footer rule
  ctx.strokeStyle = '#E4E9EF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, canvas.height - 30);
  ctx.lineTo(CARD_W - PAD, canvas.height - 30);
  ctx.stroke();
  ctx.fillStyle = '#7A8CA3';
  ctx.font = '400 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('Unimax Paint Industries — Islamic Republic of Pakistan', PAD, canvas.height - 11);

  return canvas;
}

export default renderSchemeCard;
