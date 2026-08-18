// Client-side A4 report — jsPDF only, no server round trip so it works on a
// phone over a Cloudflare tunnel just as well as on the shop PC.
import { jsPDF } from 'jspdf';

const NAVY = '#0F1C2E';
const MUTED = '#4A6A90';
const BORDER = '#1E3050';
const ORANGE = '#E85D20';
const SUBTLE = '#7A9FCC';

function drawFitted(doc, dataUrl, x, y, boxW, boxH, imgW, imgH) {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  doc.addImage(dataUrl, 'PNG', x + (boxW - w) / 2, y + (boxH - h) / 2, w, h, undefined, 'FAST');
}

function loadSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not read image for the PDF'));
    img.src = dataUrl;
  });
}

/**
 * @param {object} p
 * @param {string} p.originalImage  data URL of the untouched photo
 * @param {string} p.paintedImage   data URL of the painted canvas
 * @param {Array}  p.shades         [{ code, name, hex }]
 * @param {string} p.customerName
 * @param {string} p.notes
 * @returns {Promise<string>} the generated filename
 */
export async function exportReportPdf({
  originalImage,
  paintedImage,
  shades = [],
  customerName = '',
  notes = '',
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentW = pageW - margin * 2;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // ---- Header ------------------------------------------------------------
  doc.setFillColor(NAVY);
  doc.rect(0, 0, pageW, 34, 'F');
  doc.setFillColor(ORANGE);
  doc.rect(0, 34, pageW, 2, 'F');

  doc.setTextColor('#FFFFFF');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('UNIMAX PAINTS', margin, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(SUBTLE);
  doc.text('Color Preview Report', margin, 24);
  doc.setFontSize(9);
  doc.text(dateStr, pageW - margin, 16, { align: 'right' });
  if (customerName) doc.text(`Customer: ${customerName}`, pageW - margin, 22, { align: 'right' });

  let y = 48;

  // ---- Section 1: before / after ----------------------------------------
  doc.setTextColor(NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('1. Before  /  After', margin, y);
  y += 5;

  const boxW = (contentW - 6) / 2;
  const boxH = 62;
  const pairs = [
    [originalImage, 'Original Photo'],
    [paintedImage, 'Painted Preview'],
  ];
  for (let i = 0; i < pairs.length; i++) {
    const [src, caption] = pairs[i];
    const bx = margin + i * (boxW + 6);
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.3);
    doc.rect(bx, y, boxW, boxH);
    if (src) {
      const { w, h } = await loadSize(src);
      drawFitted(doc, src, bx + 2, y + 2, boxW - 4, boxH - 4, w, h);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text(caption, bx + boxW / 2, y + boxH + 5, { align: 'center' });
  }
  y += boxH + 14;

  // ---- Section 2: applied shades ----------------------------------------
  doc.setTextColor(NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('2. Applied Shades', margin, y);
  y += 6;

  const headerH = 7;
  const rowH = 8;
  const cols = [margin, margin + 22, margin + 95, margin + 130];

  doc.setFillColor('#EDF2FA');
  doc.rect(margin, y, contentW, headerH, 'F');
  doc.setFontSize(9);
  doc.setTextColor(NAVY);
  ['SWATCH', 'SHADE NAME', 'CODE', 'HEX'].forEach((t, i) => doc.text(t, cols[i] + 2, y + 4.8));
  y += headerH;

  if (!shades.length) {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(MUTED);
    doc.text('No shades applied.', margin + 2, y + 5.5);
    y += rowH;
  } else {
    doc.setFont('helvetica', 'normal');
    shades.forEach((s, i) => {
      if (y > pageH - 55) {
        doc.addPage();
        y = margin;
      }
      if (i % 2 === 1) {
        doc.setFillColor('#F7F9FC');
        doc.rect(margin, y, contentW, rowH, 'F');
      }
      doc.setFillColor(s.hex);
      doc.setDrawColor(BORDER);
      doc.rect(cols[0] + 2, y + 1.6, 14, rowH - 3.2, 'FD');
      doc.setTextColor(NAVY);
      doc.text(String(s.name), cols[1] + 2, y + 5.4);
      doc.text(String(s.code), cols[2] + 2, y + 5.4);
      doc.text(String(s.hex).toUpperCase(), cols[3] + 2, y + 5.4);
      y += rowH;
    });
  }
  y += 10;

  // ---- Section 3: project info ------------------------------------------
  if (y > pageH - 50) {
    doc.addPage();
    y = margin;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(NAVY);
  doc.text('3. Project Information', margin, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Customer: ${customerName || '—'}`, margin, y);
  y += 5.5;
  doc.text(`Date: ${dateStr}`, margin, y);
  y += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.text('Notes:', margin, y);
  doc.setFont('helvetica', 'normal');
  const noteLines = doc.splitTextToSize(notes || '—', contentW - 14);
  doc.text(noteLines, margin + 14, y);

  // ---- Footer on every page ---------------------------------------------
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 16, pageW - margin, pageH - 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text('Unimax Paint Industries — Islamic Republic of Pakistan', margin, pageH - 11);
    doc.text(dateStr, pageW - margin, pageH - 11, { align: 'right' });
  }

  const filename = `unimax-report-${timestamp()}.pdf`;
  doc.save(filename);
  return filename;
}

export function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function downloadCanvasPng(canvas) {
  const filename = `unimax-preview-${timestamp()}.png`;
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return filename;
}
