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

## Sab ko link do (Cloudflare Tunnel)

Ek command — app aur APK download page dono public ho jaate hain. Jis ko link
bhejo ge use **koi login nahi** karna parega:

```bash
# cloudflared ek baar install karo:
#   macOS    brew install cloudflared
#   Windows  winget install --id Cloudflare.cloudflared
#   Linux    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

./scripts/share.sh
```

Ye khud build karta hai, site banata hai, server chalata hai, aur tunnel khol kar
ek `https://xxxxx.trycloudflare.com` link deta hai:

| | |
|---|---|
| `<link>/` | app — seedha chalti hai |
| `<link>/download.html` | APK download + install steps + share link |

APK bhi is page pe aa jaye, is ke liye `out/unimax-visualizer.apk` rakh do (ya
release se download kar lo). Na ho to page wo button khud chupa deta hai.

> **Yaad rahe:** quick tunnel tab tak zinda hai jab tak ye command chal rahi hai
> aur PC on hai. Ctrl+C ya PC band = link khatam. Hamesha ke liye chalne wala
> link chahiye to neeche wala tareeqa dekho.

## Hamesha ke liye public link (GitHub Pages)

PC on rakhne ki zaroorat nahi, link kabhi nahi badalta, bilkul free:

1. Repo ko **public** karo (free plan pe Pages private repo ke liye nahi hai)
2. **Settings → Pages → Source: GitHub Actions**
3. Actions se **Publish public site** workflow chalao

Phir ye links hamesha ke liye mil jaate hain:

```
https://<user>.github.io/unimax-visualizer/
https://<user>.github.io/unimax-visualizer/download.html
```

Jab tak Pages enable nahi hota, workflow deploy skip kar deta hai (build red nahi
hoti). Repo public karne ka matlab hai ke **poora source code bhi public** ho
jayega — ye faisla aap ka hai.

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

---

## Themes

App ki 8 colour schemes hain — 6 dark aur 2 light:

Midnight Navy · Graphite Amber · Deep Forest · Royal Plum · Terracotta Clay ·
Ocean Teal · Daylight · Sandstone

Toolbar ke theme button se koi bhi choose karo. Saath wala 🔄 button **auto
mode** hai — har 45 second baad agli theme aa jaati hai; ⏸ dabao to jo theme
chal rahi hai wahi ruk jayegi. Aapki pasand browser mein yaad rehti hai.

Saari themes ek hi token set define karti hain (`src/data/themes.js`), aur
stylesheet sirf un tokens ko use karti hai — is liye nayi theme add karne ke
liye bas ek entry likhni parti hai. Har theme ke text/background jode WCAG AA
contrast pe check kiye gaye hain.

---

## Android APK

App Capacitor ke saath wrap ki gayi hai, aur APK GitHub Actions par build hoti
hai (wahan Android SDK pehle se hota hai). Har push par nayi APK ban kar
`apk-latest` release pe chali jaati hai:

```
https://github.com/imykhan05/unimax-visualizer/releases/download/apk-latest/unimax-visualizer.apk
```

> Repo private hai, is liye ye link kholne ke liye GitHub login chahiye. Shopkeeper
> ko dena ho to APK file seedha WhatsApp kar do, ya repo public kar do.

**Phone pe install:** APK download karo → Settings mein us browser/file manager ke
liye **"Install unknown apps"** allow karo → APK pe tap karo.

Ye **debug build** hai — sideload ke liye theek hai, Play Store ke liye alag
release signing key chahiye hogi.

**Apne PC par build karna ho** (Android Studio ya SDK zaroori):

```bash
cd frontend
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# android/app/build/outputs/apk/debug/app-debug.apk
```

---

## How to Use

1. **Image upload karo** — ghar ya building ki photo
2. **Left se shade select karo**
3. **Photo pe us jagah click karo** jahan wo shade chahiye → wahan ek numbered
   pin lag jayega (color abhi nahi lagega)
4. **Doosri shade select karo, doosri jagah click karo** — jitni marzi jaga,
   har jagah alag shade
5. **Generate dabao** → saari jagahon pe ek saath colors lag jayenge
6. **PDF ya Image download karo**

Pin galat lag gaya? Us pin pe click kar do, hat jayega — ya right panel se `✕`.
`Clear Pins` sab pins hata deta hai.

### Auto Schemes — ek photo, saari combinations

Ek ek jagah click karne ka mann na ho to **Auto Schemes** dabao:

1. App khud photo mein surfaces dhoondti hai — deewarein, trim bands, gate —
   aur sky, darakht, road ko chhor deti hai
2. Har ready-made scheme us photo pe lag jaati hai (12 schemes, ~3 second)
3. Har scheme ka apna board banta hai: bara painted photo, neeche **BEFORE**
   wali asli photo, aur saath shade ke naam + code
4. Koi bhi board PNG mein download karo, ya **Sab PDF mein** — saare boards ek
   PDF mein

Surfaces kaise pehchani jaati hain: sirf rang se nahi — **texture** se. Deewar
smooth hoti hai aur darakht dandanadar, is liye hara ghar aur hara darakht alag
ho jaate hain. Sky upar ki taraf roshan aur smooth hoti hai, road neeche
be-rang. Jo bach jaye usay rang ke hisaab se cluster kar ke wall / trim / gate
mein baanta jaata hai.

**Sky saaf karo** (default on): aasman ko dobara bana deta hai — badal, bijli ki
taarein, antenna sab ghayab. Ye inpainting nahi hai; aasman hi wo cheez hai
jiski asli shakal bina andaza lagaye maloom hoti hai (upar se neeche ek smooth
ramp), is liye usay dobara banate hi us par se guzarti har cheez mit jaati hai.

> **Jo ye NAHI kar sakta:** imarat ke *saamne* khara darakht, jangla, ya gate ka
> design badalna. Darakht hatane ke liye peeche ki deewar "bananni" parti hai —
> wo sirf generative AI image model karta hai, recolouring nahi. Classical
> inpainting (OpenCV) is par dhabba aur dhundlapan chhorta hai.

> Auto-detect **pehla andaza** hai, mukammal nahi. Photo ajeeb ho to Band karke
> khud pins laga lo — wo tareeqa hamesha kaam karta hai.

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
| Painting | Pin lagao → Generate → flood fill + LAB blend, texture aur shadow preserved |
| Multi-zone | Jitni marzi jaga, har jagah apni shade — sab ek saath apply |
| Auto Schemes | Ek photo se 12 ready-made combinations, har ek ka apna board (PNG/PDF) |
| Themes | 8 colour schemes, auto har 45 second badalti hain (pause bhi ho sakti hai) |
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
