// Genera favicon, logo della testata, icone PNG e immagine Open Graph da logo/logo.svg (npm run icons).
// I file generati sono committati: serve rilanciarlo solo se cambia il logo.
//   public/logo.svg        simbolo per la testata (<use href="logo.svg#logo">), colore da CSS (currentColor)
//   public/icon.svg        favicon, grigio in tema chiaro e chiaro in tema scuro (prefers-color-scheme)
//   public/*.png           icone del manifest e apple-touch-icon su sfondo scuro, og-image.png 1200×630
// Le PNG sono disegnate in un canvas di Chromium (Playwright) e salvate con una palette ridotta
// (PNG indicizzata, zlib al massimo), senza dipendenze in più.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, '../public');
const SOURCE = resolve(here, '../../logo/logo.svg');

// Colori: logo originale in tema chiaro, variante chiara in tema scuro (approvata), sfondo scuro del sito.
const INK_LIGHT = '#555555';
const INK_DARK = '#C9CFD8';
const BG_DARK = '#1B2028';
const TITLE = '#E5E9EF';
const MUTED = '#9CA6B4';

// --- Tracciato: coordinate relative e separatori minimi, viewBox ritagliato sul disegno ---
const src = readFileSync(SOURCE, 'utf-8');
const d = src.match(/\sd="([^"]+)"/)[1];
const tokens = d.match(/[MLZ]|-?\d+(?:\.\d+)?/gi);
const subpaths = [];
for (let i = 0; i < tokens.length;) {
  const tk = tokens[i].toUpperCase();
  if (tk === 'M') subpaths.push([[+tokens[i + 1], +tokens[i + 2]]]), (i += 3);
  else if (tk === 'L') subpaths.at(-1).push([+tokens[i + 1], +tokens[i + 2]]), (i += 3);
  else if (tk === 'Z') i += 1;
  else throw new Error(`comando non gestito nel tracciato: ${tk}`);
}
const pts = subpaths.flat();
const PAD = 4;
const minX = Math.min(...pts.map((p) => p[0])) - PAD;
const minY = Math.min(...pts.map((p) => p[1])) - PAD;
const vw = Math.max(...pts.map((p) => p[0])) + PAD - minX;
const vh = Math.max(...pts.map((p) => p[1])) + PAD - minY;
const num = (n, first) => (n < 0 || first ? String(n) : ` ${n}`);
let path = '';
let cur = [0, 0];
for (const sp of subpaths) {
  path += `M${sp[0][0] - minX}${num(sp[0][1] - minY)}`;
  cur = sp[0];
  path += 'l';
  let first = true;
  for (const p of sp.slice(1)) {
    path += num(p[0] - cur[0], first) + num(p[1] - cur[1]);
    first = false;
    cur = p;
  }
  path += 'z';
}
const viewBox = `0 0 ${vw} ${vh}`;
const svgOf = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path fill="${fill}" fill-rule="evenodd" d="${path}"/></svg>`;

writeFileSync(resolve(pub, 'logo.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg"><symbol id="logo" viewBox="${viewBox}"><path fill="currentColor" fill-rule="evenodd" d="${path}"/></symbol></svg>\n`);
writeFileSync(resolve(pub, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><style>path{fill:${INK_LIGHT}}@media(prefers-color-scheme:dark){path{fill:${INK_DARK}}}</style><path fill-rule="evenodd" d="${path}"/></svg>\n`);
console.log('scritti logo.svg e icon.svg', `(tracciato ${path.length} caratteri, originale ${d.length})`);

// --- PNG indicizzata ---
function encodePng(w, h, rgba) {
  // palette: colori esatti se sono al massimo 256, altrimenti si tolgono bit meno significativi
  let shift = 0;
  let keys;
  let pal;
  for (;;) {
    const mask = (0xff << shift) & 0xff;
    pal = new Map();
    keys = new Uint32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      const k = (((rgba[o] & mask) << 24) | ((rgba[o + 1] & mask) << 16) | ((rgba[o + 2] & mask) << 8) | (rgba[o + 3] & mask)) >>> 0;
      keys[i] = k;
      let e = pal.get(k);
      if (!e) pal.set(k, (e = [0, 0, 0, 0, 0]));
      e[0] += rgba[o]; e[1] += rgba[o + 1]; e[2] += rgba[o + 2]; e[3] += rgba[o + 3]; e[4]++;
    }
    if (pal.size <= 256) break;
    shift++;
  }
  const entries = [...pal.entries()];
  const index = new Map(entries.map(([k], i) => [k, i]));
  const plte = Buffer.alloc(entries.length * 3);
  const trns = Buffer.alloc(entries.length);
  let alpha = false;
  entries.forEach(([, e], i) => {
    plte[i * 3] = Math.round(e[0] / e[4]); plte[i * 3 + 1] = Math.round(e[1] / e[4]); plte[i * 3 + 2] = Math.round(e[2] / e[4]);
    trns[i] = Math.round(e[3] / e[4]);
    if (trns[i] < 255) alpha = true;
  });
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = index.get(keys[y * w + x]);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 3;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('PLTE', plte), ...(alpha ? [chunk('tRNS', trns)] : []),
    chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Disegno nel canvas ---
const logoDark = `data:image/svg+xml;base64,${Buffer.from(svgOf(INK_DARK)).toString('base64')}`;
// [file, larghezza, altezza, opzioni]: logo = lato del logo rispetto all'altezza; radius = angoli arrotondati (trasparenti)
const targets = [
  ['apple-touch-icon.png', 180, 180, { logo: 0.8 }], // iOS arrotonda da sé: quadrato pieno
  ['icon-192.png', 192, 192, { logo: 0.76, radius: 0.22 }],
  ['icon-512.png', 512, 512, { logo: 0.76, radius: 0.22 }],
  ['icon-maskable-512.png', 512, 512, { logo: 0.56 }], // area sicura: cerchio di raggio 40%
  ['og-image.png', 1200, 630, { og: true }],
];

// font del nome (public/fonts, vedi scripts/title-font.py): solo per "Pauper Index" nell'og-image
const TITLE_FONT = `data:font/woff2;base64,${readFileSync(resolve(pub, 'fonts/pauper-index-title.woff2')).toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.evaluate(async (src) => {
  const f = new FontFace('Pauper Index Title', `url(${src})`);
  document.fonts.add(await f.load());
}, TITLE_FONT);
for (const [name, w, h, o] of targets) {
  const px = await page.evaluate(async ({ w, h, o, logo, vw, vh, c }) => {
    const img = new Image();
    img.src = logo;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = c.bg;
    if (o.radius) {
      ctx.beginPath(); ctx.roundRect(0, 0, w, h, w * o.radius); ctx.fill();
    } else ctx.fillRect(0, 0, w, h);
    if (o.og) {
      const lh = 400;
      const lw = lh * vw / vh;
      const title = 'Pauper Index';
      ctx.font = '400 120px "Pauper Index Title"';
      const tw = ctx.measureText(title).width;
      const gap = 56;
      const x0 = Math.round((w - (lw + gap + tw)) / 2);
      ctx.drawImage(img, x0, Math.round((h - lh) / 2), lw, lh);
      ctx.fillStyle = c.title;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(title, x0 + lw + gap, h / 2 + 20);
      ctx.fillStyle = c.muted;
      ctx.font = '400 44px system-ui, "Segoe UI", sans-serif';
      ctx.fillText('pauperindex.com', x0 + lw + gap + 4, h / 2 + 96);
    } else {
      const lh = h * o.logo;
      const lw = lh * vw / vh;
      ctx.drawImage(img, (w - lw) / 2, (h - lh) / 2, lw, lh);
    }
    return Array.from(ctx.getImageData(0, 0, w, h).data);
  }, { w, h, o, logo: logoDark, vw, vh, c: { bg: BG_DARK, title: TITLE, muted: MUTED } });
  const png = encodePng(w, h, Uint8Array.from(px));
  writeFileSync(resolve(pub, name), png);
  console.log('scritto', name, `${(png.length / 1024).toFixed(1)} KB`);
}
await browser.close();
