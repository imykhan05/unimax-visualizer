# Unimax Paint Visualizer

Ghar aur building ki photo pe Unimax shades virtually try karo — phir download karo.

Customer photo laata hai, aap shade select karke wall pe click karte ho, color turant
apply ho jaata hai — texture aur shadows waise ke waise rehte hain. Multiple walls pe
alag alag shades lag sakti hain, aur end mein PNG ya PDF report download ho jaati hai.

---

## Setup (First Time)

### Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
# Runs on http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

Dono terminals alag rakho — backend aur frontend saath saath chalte hain.

> Painting poori tarah browser mein hoti hai, is liye shade lagane ke liye backend
> zaroori nahi. Backend tab chahiye jab aap `/api/*` endpoints (server-side paint ya
> ReportLab PDF) use karna chahte ho.

---

## Mobile Access via Cloudflare Tunnel

```bash
# Install cloudflared (one time): https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
cloudflared tunnel --url http://localhost:5173
# Copy the https://xxxxx.trycloudflare.com URL → open on any mobile
```

Tunnel command ek `https://xxxxx.trycloudflare.com` URL print karega. Wahi URL kisi bhi
mobile browser mein kholo — app touch ke saath chalti hai (tap karke color lagao).

Agar backend endpoints bhi mobile se chahiye, to Vite already `/api` ko
`localhost:8000` pe proxy karta hai, is liye sirf frontend ka tunnel kaafi hai.

---

## Mobile pe "App" ki tarah (single file build)

Ye app poori tarah browser mein chalti hai, is liye ek hi HTML file mein pack ho
jaati hai — na server, na internet:

```bash
cd frontend
npm run build:single
# frontend/dist-single/index.html  (~900 KB, bas ek file)
```

Us file ko WhatsApp/USB se phone pe bhejo aur browser se kholo — bina internet ke
bhi chalegi. Phone mein browser ka **"Add to Home Screen"** dabao to icon home
screen pe aa jaata hai aur app jaisi lagti hai.

> **APK ke baare mein:** ye web app hai, Android app nahi — is liye `.apk` file
> nahi banti. APK banane ke liye app ko Capacitor jaise wrapper mein daal kar
> Android SDK se build karna parta hai. "Add to Home Screen" wala tareeqa isi
> kaam ke liye kaafi hai aur turant chalta hai.

---

## How to Use

1. Image upload karo (ghar ya building ki photo)
2. Left se Unimax shade select karo
3. Wall pe click karo → color apply ho jayega
4. Multiple walls pe alag alag colors lagao
5. PDF ya Image download karo

### Tips

- **Tolerance slider (20–80):** Zyada tolerance = zyada area select hoga. Agar wall ka
  sirf thora hissa bhara, tolerance barhao; agar color saath wali cheez pe bhi chala
  gaya, tolerance kam karo.
- **Undo / Redo:** `Ctrl+Z` aur `Ctrl+Y`. Right panel se kisi bhi zone ko `✕` se hata
  bhi sakte ho.
- **Reset:** sab zones hata kar original photo wapas laata hai (confirm poochta hai).
- **Mobile:** shade panel `☰` button se drawer ki tarah khulta hai.

---

## Features

| | |
|---|---|
| Upload | Drag & drop ya click — JPG, PNG, WEBP, max 10MB, auto-resize 900×640 |
| Shades | Poori Unimax Wall Emulsion shade card — 28 shades, search by name ya code |
| Painting | Click pe flood fill + LAB blend — texture, shadow aur grain preserved |
| Multi-zone | Har click ek alag zone; alag walls pe alag shades |
| Undo/Redo | Full history, keyboard shortcuts ke saath |
| Export | PNG canvas download + A4 PDF report (before/after + shade table) |
| Zoom | Zoom in/out + fit to screen |
| Mobile | 360px se upar responsive, touch tap se color apply |

---

## How the Colour Engine Works

Paint realistic isliye lagta hai kyunki color pura replace nahi hota:

1. **Region select** — clicked point se flood fill chalta hai. Har pixel apne
   *parosi* pixel se compare hota hai, seed se nahi — is liye wall pe jo lighting
   gradient hota hai (ek taraf roshni, doosri taraf shadow) usko fill follow karti
   hai, jabke skirting board ya window frame jaisa sharp edge use rok deta hai.
   Saath hi chroma seed ke qareeb rakha jaata hai aur luminance ko chhoot di jaati
   hai — kyunki surface ka rang uske chroma mein hota hai aur lighting luminance mein.

2. **LAB blend** — image LAB space mein convert hoti hai. `a` aur `b` channels (yaani
   rang) shade se replace hote hain, jabke `L` (lightness) ka har pixel apna
   deviation rakhta hai. Isi wajah se plaster ki texture, shadows aur highlights
   waise ke waise rehte hain — sirf color badalta hai.

Yehi algorithm dono taraf hai — `frontend/src/utils/` (instant, browser mein) aur
`backend/utils/` (OpenCV ke saath) — taake dono ek jaisa result den.

---

## API Endpoints

Backend `http://localhost:8000` pe chalta hai. Interactive docs: `/docs`.

```
GET  /api/health          → { status: "ok", version: "1.0.0" }

POST /api/upload          multipart/form-data { image: File }
                          → { image_id, width, height, filename, url }

POST /api/apply-color     { image_id, x, y, shade_hex, tolerance, opacity?, from_original? }
                          → { result_image_base64, pixels_filled }

POST /api/reset/{image_id}
                          → { result_image_base64 }

POST /api/export-pdf      { original_image_base64, painted_image_base64,
                            applied_shades: [{ code, name, hex }],
                            customer_name, notes }
                          → { pdf_base64 }
```

---

## Tests

```bash
cd frontend
npm test          # flood fill + LAB blend checks
npm run build     # production build -> dist/
npm run build:single  # single self-contained HTML -> dist-single/
```

Checks cover LAB round-trips, gradient walls, edge leaking, dilation rim aur texture
retention.

---

## Project Structure

```
unimax-visualizer/
├── README.md
├── backend/
│   ├── main.py                  FastAPI app + CORS + health
│   ├── requirements.txt
│   ├── routers/
│   │   ├── image.py             upload / apply-color / reset
│   │   └── pdf.py               ReportLab A4 report
│   └── utils/
│       ├── color_engine.py      LAB paint blend
│       └── segmenter.py         flood fill + bilateral pre-filter
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    ├── test/utils.test.mjs
    └── src/
        ├── App.jsx              state, undo/redo, upload, exports
        ├── main.jsx
        ├── index.css            design system + responsive
        ├── components/
        │   ├── ShadePanel.jsx   shade list + search + drawer
        │   ├── Canvas.jsx       image + click/tap painting
        │   ├── AppliedPanel.jsx applied zones + report fields
        │   └── Toolbar.jsx      upload, undo, reset, zoom, downloads
        ├── utils/
        │   ├── floodFill.js     region selection
        │   ├── colorBlend.js    LAB blend
        │   └── pdfExport.js     jsPDF report + PNG download
        └── data/
            └── shades.js        28 Unimax shades
```

---

## Shade Catalog

Unimax Wall Emulsion Shade Card — Flat Sheen series (interior walls & ceilings).
Codes 1101 (Brilliant White) se 1127 (Apple Green) tak, plus Black — total 28 shades,
`frontend/src/data/shades.js` mein.

---

*Unimax Paint Industries — Islamic Republic of Pakistan*
