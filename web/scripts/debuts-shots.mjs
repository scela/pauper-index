// Pagina "Debutti": primo schermo, pagina intera, analisi aperta, In osservazione, con la collezione;
// desktop 1280×900, iPhone SE 375×667 e iPhone 13, chiaro e scuro -> ../.cache/screenshots/debutti-<etichetta>-*.png
// La collezione è sintetica: metà delle carte dei debutti (nessun dato personale).
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra)
// Uso: node scripts/debuts-shots.mjs <etichetta> [it|en]
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../.cache/screenshots');
const URL = process.env.SITE_URL || 'http://localhost:4173/';
const label = process.argv[2] || 'dopo';
const lang = process.argv[3] || 'it';
mkdirSync(OUT, { recursive: true });

const cards = JSON.parse(readFileSync(resolve(here, '../../data/cards.json'), 'utf-8')).c;
const debuts = JSON.parse(readFileSync(resolve(here, '../../data/debuts.json'), 'utf-8'));
const text = debuts.c.filter((_, i) => i % 2 === 0).map((r) => `2 ${cards[r.c].n}`).join('\n');

const browser = await chromium.launch();
for (const [name, opts] of [
  ['desktop', { viewport: { width: 1280, height: 900 } }],
  ['iphone-se', { ...devices['iPhone SE'], viewport: { width: 375, height: 667 } }],
  ['mobile', { ...devices['iPhone 13'] }],
]) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ ...opts, locale: lang === 'it' ? 'it-IT' : 'en-US', colorScheme: scheme });
    await ctx.addInitScript(() => localStorage.setItem('pauper-index:welcomeClosed', '1'));
    const page = await ctx.newPage();
    const base = `${OUT}/debutti-${label}-${name}-${scheme}`;
    const imgs = () => page.waitForFunction(() => [...document.querySelectorAll('.deb-img img')].slice(0, 4).every((i) => i.complete));
    await page.goto(URL + '#debutti');
    await page.waitForSelector('.deb-card');
    await imgs();
    await page.screenshot({ path: `${base}-1-primo-schermo.png` });
    await page.screenshot({ path: `${base}-2-pagina.png`, fullPage: true });
    const first = page.locator('.deb-card').first();
    await first.locator('.deb-an summary').click();
    await page.waitForTimeout(200);
    await first.screenshot({ path: `${base}-3-analisi.png` });
    // Baleful Strix: "al posto di" in un'altra variante
    const strix = page.locator('.deb-card', { has: page.locator('.deb-title', { hasText: 'Baleful Strix' }) });
    if (await strix.count()) {
      await strix.locator('.deb-an summary').click();
      await page.waitForTimeout(200);
      await strix.screenshot({ path: `${base}-4-analisi-strix.png` });
    }
    const watch = page.locator('#debWatch');
    if (await watch.count()) {
      await watch.locator('summary').click();
      await watch.scrollIntoViewIfNeeded();
      await watch.screenshot({ path: `${base}-5-osservazione.png` });
    }
    await page.goto(URL);
    await page.waitForFunction(() => document.querySelector('#cardRows tr'));
    await page.click('#pasteToggle');
    await page.fill('#pasteText', text);
    await page.click('#pasteAdd');
    await page.waitForSelector('#loaded:not([hidden])');
    await page.evaluate(() => { location.hash = '#debutti'; });
    await page.waitForSelector('.deb-own');
    await imgs();
    await page.screenshot({ path: `${base}-6-collezione.png` });
    await ctx.close();
    console.log(`${name} ${scheme}: ok`);
  }
}
await browser.close();
