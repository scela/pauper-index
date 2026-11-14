// Intestazione dei risultati e menu "Ordina": altezza di .res-head e larghezza del menu nella pagina principale e nelle
// Preferite, con i prezzi presenti e assenti, a varie larghezze, con Arial e con un carattere largo (Verdana, o DejaVu Sans
// se Verdana manca). Serve a verificare che le voci "Prezzo crescente/decrescente" non cambino l'intestazione.
// -> ../.cache/screenshots/sort-<etichetta>.json
// Richiede il sito in esecuzione (npm run build; npm run preview) oppure SITE_URL.
// Uso: node scripts/sort-metrics.mjs <etichetta>
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../.cache/screenshots');
const URL = process.env.SITE_URL || 'http://localhost:4173/';
const label = process.argv[2] || 'misura';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const out = [];
for (const font of ['Arial', 'Verdana, "DejaVu Sans"']) {
  for (const width of [375, 761, 961, 1280]) {
    for (const lang of ['it', 'en']) {
      for (const prices of ['ok', 'none']) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: lang === 'it' ? 'it-IT' : 'en-US', bypassCSP: true });
        const page = await ctx.newPage();
        await page.addInitScript(() => localStorage.setItem('pauper-index:welcomeClosed', '1'));
        await page.route('https://cards.scryfall.io/**', (r) => r.abort());
        if (prices === 'none') await page.route('**/data/prices.json', (r) => r.fulfill({ status: 404, body: '' }));
        await page.goto(URL);
        await page.waitForFunction(() => document.querySelector('#cardRows tr'));
        await page.addStyleTag({ content: `body, body *:not(.brand) { font-family: ${font} !important; }` });
        if (prices === 'ok') await page.waitForFunction(() => !document.getElementById('priceSummary').hidden, null, { timeout: 4000 }).catch(() => {});
        else await page.waitForTimeout(500);
        const m = async (head, sel) => page.evaluate(([head, sel]) => {
          const h = document.querySelector(head)?.getBoundingClientRect();
          const s = document.querySelector(sel)?.getBoundingClientRect();
          return { head: h ? Math.round(h.height) : null, sortW: s ? Math.round(s.width) : null };
        }, [head, sel]);
        const main = await m('#results .res-head', '#sort');
        // una preferita, perché il menu delle preferite compare solo se ce n'è almeno una
        await page.fill('#search', 'Brainstorm');
        await page.locator('#search').press('Enter');
        await page.locator('#sheet .favbtn').click();
        await page.keyboard.press('Escape');
        await page.evaluate(() => { location.hash = '#preferite'; });
        await page.waitForSelector('#viewFav:not([hidden])');
        const fav = await m('#viewFav .res-head', '#favSort');
        out.push({ font: font.split(',')[0], width, lang, prices, main, fav });
        await ctx.close();
      }
    }
  }
}
await browser.close();
writeFileSync(`${OUT}/sort-${label}.json`, JSON.stringify(out, null, 1));
for (const r of out) console.log(r.font.padEnd(8), String(r.width).padStart(4), r.lang, r.prices.padEnd(4), 'main', r.main.head, r.main.sortW, 'fav', r.fav.head, r.fav.sortW);
