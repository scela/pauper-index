// Tempi della scheda della carta al passaggio del mouse (desktop): apertura, comparsa, cambio di carta, chiusura.
// -> stampa le misure e le salva in ../.cache/screenshots/scheda-tempi-<etichetta>.json
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra)
// Uso: node scripts/sheet-timing.mjs <etichetta> [ripetizioni, default 3]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../.cache/screenshots');
const URL = process.env.SITE_URL || 'http://localhost:4173/';
const label = process.argv[2] || 'dopo';
const RUNS = Number(process.argv[3] || 3);
mkdirSync(OUT, { recursive: true });

/** Campiona a ogni fotogramma lo stato della scheda e registra gli ingressi del mouse sulle carte. */
function install() {
  const log = [];
  const ev = [];
  window.__log = log;
  window.__ev = ev;
  document.addEventListener('mouseover', (e) => {
    const b = e.target.closest?.('.cardbtn');
    if (b) ev.push({ t: performance.now(), type: 'enter', idx: b.dataset.idx });
  }, true);
  document.addEventListener('mouseout', (e) => {
    const b = e.target.closest?.('.cardbtn');
    if (b && !b.contains(e.relatedTarget)) ev.push({ t: performance.now(), type: 'leave', idx: b.dataset.idx });
  }, true);
  const tick = () => {
    const s = document.getElementById('sheet');
    const img = s.querySelector('.active-card img:not(.ph)');
    log.push({
      t: performance.now(), hidden: s.hidden, op: s.hidden ? 0 : Number(getComputedStyle(s).opacity),
      title: s.querySelector('#sheetTitle')?.firstChild?.textContent || '',
      img: !!img && img.complete && img.naturalWidth > 0,
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function analyse({ log, ev }) {
  const at = (type, n = 0) => ev.filter((e) => e.type === type)[n]?.t;
  const after = (t0, pred) => log.find((s) => s.t >= t0 && pred(s))?.t;
  const r = (x) => (x == null ? null : Math.round(x));
  const enter1 = at('enter', 0);
  const shown = after(enter1, (s) => !s.hidden);
  const full = after(enter1, (s) => !s.hidden && s.op >= 0.99);
  const img = after(enter1, (s) => !s.hidden && s.img);
  // la seconda carta (l'uscita verso la scheda, che si apre sopra la carta quando non sta altrove, non conta)
  const enter2 = ev.find((e) => e.type === 'enter' && e.idx !== ev[0].idx)?.t;
  const title1 = log.find((s) => s.t >= (full ?? enter1) && !s.hidden)?.title;
  const switched = after(enter2, (s) => !s.hidden && s.title && s.title !== title1);
  const gap = log.some((s) => s.t >= (full ?? enter1) && s.t <= (switched ?? 0) && s.hidden);
  const leave2 = ev.filter((e) => e.type === 'leave').at(-1)?.t;
  const fadeStart = after(leave2, (s) => s.hidden || s.op < 0.99);
  const hidden = after(leave2, (s) => s.hidden);
  return {
    apertura_ms: r(shown - enter1),
    comparsa_ms: r(full - shown),
    immagine_ms: r(img - enter1),
    cambio_carta_ms: r(switched - enter2),
    chiusa_tra_le_carte: gap,
    inizio_chiusura_ms: r(fadeStart - leave2),
    chiusura_ms: r(hidden - leave2),
  };
}

const browser = await chromium.launch();
const results = [];
for (let run = 0; run < RUNS; run++) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => { try { localStorage.setItem('pauper-index:lang', 'it'); } catch { /* */ } });
  await page.goto(URL);
  await page.waitForSelector('#cardRows .cardbtn');
  await page.evaluate(install);
  const cards = page.locator('#cardRows .cardbtn');
  const box = async (i) => {
    const b = await cards.nth(i).boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  // la carta sopra in alto nella finestra, così la scheda della carta sotto si apre sotto di lei
  await cards.nth(2 + run).evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 120));
  await page.waitForTimeout(100);
  const [x1, y1] = await box(3 + run); // la scheda si apre sotto la carta: si passa alla carta sopra
  const [x2, y2] = await box(2 + run);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(200);
  await page.mouse.move(x1, y1);
  await page.waitForTimeout(1500);
  await page.mouse.move(x2, y2, { steps: 4 }); // da una carta alla successiva (riga sopra)
  await page.waitForTimeout(1200);
  await page.mouse.move(1270, y2); // fuori dalla carta e dalla scheda (bordo destro)
  await page.waitForTimeout(800);
  results.push(analyse(await page.evaluate(() => ({ log: window.__log, ev: window.__ev }))));
  await page.close();
}
await browser.close();
console.table(results);
writeFileSync(resolve(OUT, `scheda-tempi-${label}.json`), JSON.stringify(results, null, 1));
