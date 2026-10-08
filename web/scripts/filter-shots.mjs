// Filtri per colore, costo, tipo e testo: barra, pannello aperto ed etichette dei filtri attivi,
// desktop e mobile, tema chiaro e scuro -> ../.cache/screenshots/filtri-<etichetta>-*.png (cartella ignorata da git).
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra)
// Uso: node scripts/filter-shots.mjs <etichetta>
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../.cache/screenshots');
const URL = process.env.SITE_URL || 'http://localhost:4173/';
const label = process.argv[2] || 'dopo';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const scheme of ['light', 'dark']) {
  for (const [name, opts] of [
    ['desktop', { viewport: { width: 1280, height: 1000 } }],
    ['mobile', { ...devices['iPhone 13'] }],
  ]) {
    const ctx = await browser.newContext({ ...opts, locale: 'it-IT', colorScheme: scheme });
    const page = await ctx.newPage();
    await page.route('https://cards.scryfall.io/**', (r) => r.abort());
    const base = `${OUT}/filtri-${label}-${name}-${scheme === 'light' ? 'chiaro' : 'scuro'}`;
    await page.goto(URL);
    await page.waitForFunction(() => document.querySelector('#cardRows tr'));
    await page.screenshot({ path: `${base}-1-barra.png` });
    await page.click('#filtersBtn');
    await page.click('#fpColors [data-v="U"]');
    await page.click('#fpMv [data-v="1"]');
    await page.click('#fpMv [data-v="2"]');
    await page.click('#fpTypes [data-v="Instant"]');
    await page.fill('#fpText', 'draw');
    await page.waitForFunction(() => !document.querySelector('#fpTextStatus')?.textContent);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${base}-2-pannello.png` });
    await page.click('#fpDone');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${base}-3-etichette.png` });
    await ctx.close();
    console.log(`${name} ${scheme}: ok`);
  }
}
await browser.close();
