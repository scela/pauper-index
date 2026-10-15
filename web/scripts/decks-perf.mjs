// Pagina "Mazzi": tempi del calcolo (completamento, ordine, rendering) con il processore rallentato, con la
// collezione sintetica di decks-shots.mjs (nessun dato personale), su mobile (iPhone 13 emulato).
// Per ogni rallentamento: apertura della pagina (61 giorni, download compreso), passaggio a "Ultimo anno" (download,
// lettura del JSON e calcolo), "Solo main" / "Main e side" e scelta di un archetipo (solo calcolo e rendering), con il
// task più lungo del thread principale in ogni passo.
// -> ../.cache/screenshots/mazzi-misure-<etichetta>.json (cartella ignorata da git).
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra)
// Uso: node scripts/decks-perf.mjs <etichetta> [rallentamenti, per esempio 1,4,6]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../.cache/screenshots');
const URL = process.env.SITE_URL || 'http://localhost:4173/';
const label = process.argv[2] || 'misura';
const rates = (process.argv[3] || '1,4,6').split(',').map(Number);
mkdirSync(OUT, { recursive: true });

// stessa collezione sintetica di decks-shots.mjs
const cards = JSON.parse(readFileSync(resolve(here, '../../data/cards.json'), 'utf-8')).c;
const decks = JSON.parse(readFileSync(resolve(here, '../../data/decks-61.json'), 'utf-8'));
const owned = new Map();
const add = (flat, keep) => {
  for (let i = 0; i < flat.length; i += 2) owned.set(flat[i], Math.max(owned.get(flat[i]) || 0, keep(flat[i + 1], i)));
};
const top = [...decks.l].sort((a, b) => b[4].length - a[4].length);
top.slice(0, 3).forEach((l, k) => { add(l[2], (n, i) => (k === 2 && i % 6 === 0 ? n - 1 : n)); add(l[3], (n) => n); });
top.slice(3, 23).forEach((l) => add(l[2], (n, i) => (i % 4 === 0 ? n : 0)));
const text = [...owned].filter(([, n]) => n > 0).map(([i, n]) => `${n} ${cards[i].n}`).join('\n');

// task lunghi (oltre 50 ms) del thread principale, raccolti dall'inizio
const observe = () => {
  window.__lt = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); })
    .observe({ type: 'longtask', buffered: true });
};

const browser = await chromium.launch();
const results = [];
for (const rate of rates) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'it-IT' });
  const page = await ctx.newPage();
  await page.addInitScript(observe);
  await page.goto(URL);
  await page.waitForFunction(() => document.querySelector('#cardRows tr'));
  await page.fill('#pasteText', text);
  await page.click('#pasteAdd');
  await page.waitForSelector('#loaded:not([hidden])');
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });

  const now = () => page.evaluate(() => performance.now());
  // dal momento t0 alla fine del passo: durata e task più lungo nel frattempo
  const step = async (name, t0, until, arg = null) => {
    await page.waitForFunction(until, arg, { timeout: 120_000 });
    // il fotogramma successivo: il risultato è disegnato
    const t1 = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now())))));
    const lt = await page.evaluate((a) => window.__lt.filter(([s]) => s >= a), t0);
    const r = { rate, step: name, ms: Math.round(t1 - t0), longest: Math.round(Math.max(0, ...lt.map((x) => x[1]))), longtasks: lt.length };
    results.push(r);
    console.log(`${rate}x  ${name.padEnd(28)} ${String(r.ms).padStart(6)} ms   task più lungo ${String(r.longest).padStart(5)} ms (${r.longtasks})`);
  };

  let t0 = await now();
  await page.click('#navDecks');
  await step('apertura (61 giorni)', t0, () => document.querySelector('#deckList .dk-comp'));

  const sub61 = await page.locator('#dSub').textContent();
  t0 = await now();
  await page.selectOption('#dPeriod', '365');
  await step('ultimo anno', t0, (s) => document.querySelector('#dSub').textContent !== s && document.querySelector('#deckList .dk-comp'), sub61);

  for (const v of ['main', 'side']) {
    const before = await page.locator('#deckList').innerHTML();
    t0 = await now();
    await page.locator(`#dSideWrap input[value="${v}"]`).check();
    await step(v === 'main' ? 'solo main (un anno)' : 'main e side (un anno)', t0,
      (b) => document.querySelector('#deckList').innerHTML !== b, before);
  }

  const arch = await page.locator('#dArch option').nth(1).getAttribute('value');
  const before = await page.locator('#deckList').innerHTML();
  t0 = await now();
  await page.selectOption('#dArch', arch);
  await step('archetipo (un anno)', t0, (b) => document.querySelector('#deckList').innerHTML !== b, before);
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/mazzi-misure-${label}.json`, JSON.stringify(results, null, 1));
console.log(`-> ${OUT}/mazzi-misure-${label}.json`);
