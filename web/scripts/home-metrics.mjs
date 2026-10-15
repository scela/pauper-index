// Pagina iniziale: misure del primo schermo e screenshot, senza e con collezione (lista sintetica incollata: 8 carte,
// 24 copie, nessun dato personale), desktop 1280×900 e iPhone SE 375×667, chiaro e scuro, IT e EN.
// Misure: altezza di testata, riga dei dati, blocco di caricamento (o riga della collezione), controlli; posizione del
// titolo e della prima carta; altezza delle prime righe; quante carte stanno nel primo schermo.
// -> ../.cache/screenshots/home-<etichetta>-*.png e home-<etichetta>.json (cartella ignorata da git).
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra); oppure SITE_URL=https://pauperindex.com/
// Uso: node scripts/home-metrics.mjs <etichetta>
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../.cache/screenshots');
const URL = process.env.SITE_URL || 'http://localhost:4173/';
const label = process.argv[2] || 'misura';
mkdirSync(OUT, { recursive: true });
const PASTE = ['4 Ponder', '4 Brainstorm', '4 Counterspell', '2 Lightning Bolt', '4 Preordain', '2 Snuff Out', '2 Cast Down', '2 Mulldrifter'].join('\n');

const measure = (page, state) => page.evaluate((state) => {
  const box = (s) => {
    const e = [...document.querySelectorAll(s)].find((x) => !x.hidden && x.getClientRects().length);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { top: Math.round(b.top + scrollY), h: Math.round(b.height) };
  };
  const rows = [...document.querySelectorAll('#cardRows tr')];
  const visible = rows.filter((r) => r.getBoundingClientRect().bottom <= innerHeight).length;
  return {
    state, screen: innerHeight, header: box('.top')?.h, dataline: box('#dataline')?.h,
    quick: box('#quick')?.h ?? null, load: box('#loadArea')?.h ?? box('#loaded')?.h, filters: box('#filters')?.h,
    verdictTop: box('#verdict')?.top, firstCardTop: box('#cardRows tr')?.top,
    rowHeights: rows.slice(0, 3).map((r) => Math.round(r.getBoundingClientRect().height)), cardsInFirstScreen: visible,
  };
}, state);

const browser = await chromium.launch();
const out = [];
for (const [name, opts] of [
  ['desktop', { viewport: { width: 1280, height: 900 } }],
  ['mobile', { ...devices['iPhone 13'], viewport: { width: 375, height: 667 } }],
]) {
  for (const scheme of ['light', 'dark']) {
    for (const lang of ['it', 'en']) {
      const ctx = await browser.newContext({ ...opts, locale: lang === 'it' ? 'it-IT' : 'en-US', colorScheme: scheme });
      const page = await ctx.newPage();
      await page.route('https://cards.scryfall.io/**', (r) => r.abort());
      await page.goto(URL);
      await page.waitForFunction(() => document.querySelector('#cardRows tr'));
      const base = `${OUT}/home-${label}-${name}-${scheme === 'light' ? 'chiaro' : 'scuro'}-${lang}`;
      const a = await measure(page, 'senza collezione');
      await page.screenshot({ path: `${base}-1-senza.png` });
      if (await page.locator('#pasteToggle').isVisible().catch(() => false)) await page.click('#pasteToggle');
      await page.fill('#pasteText', PASTE);
      await page.click('#pasteAdd');
      await page.waitForSelector('#loaded:not([hidden])');
      await page.waitForTimeout(300);
      const c = await measure(page, 'con collezione');
      await page.screenshot({ path: `${base}-2-con.png` });
      for (const m of [a, c]) out.push({ device: name, scheme, lang, ...m });
      console.log(`${name} ${scheme} ${lang}`);
      for (const m of [a, c]) {
        console.log(`  ${m.state}: testata ${m.header} · dati ${m.dataline} · controllo rapido ${m.quick ?? '—'} · caricamento ${m.load} · filtri ${m.filters}`
          + ` · titolo a ${m.verdictTop} · prima carta a ${m.firstCardTop} (schermo ${m.screen}) · righe ${m.rowHeights.join('/')} · carte nel primo schermo ${m.cardsInFirstScreen}`);
      }
      await ctx.close();
    }
  }
}
await browser.close();
writeFileSync(`${OUT}/home-${label}.json`, JSON.stringify(out, null, 1));
console.log(`-> ${OUT}/home-${label}.json`);
