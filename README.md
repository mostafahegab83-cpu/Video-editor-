# Video Editor (HTML / CSS / JS)

Browser-only video editor — upload, trim, merge, add text overlays, and export to MP4.
All processing runs locally via FFmpeg WebAssembly. No backend required.

## Files
- `index.html` — markup
- `styles.css` — styling
- `app.js` — logic (loads FFmpeg.wasm from CDN)
- `logo.png` — app logo

## Run locally
Because the page uses ES modules and fetches WASM, open it via a local server (not by double-clicking):

```bash
# Python 3
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy
Upload the 4 files to any static host (GitHub Pages, Netlify, Vercel, etc.).
