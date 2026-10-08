// Nomi italiani: suggerimenti del controllo rapido, risultato e scheda, desktop e mobile, IT ed EN
// -> ../.cache/screenshots/italiano-<etichetta>-*.png (cartella ignorata da git).
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra)
// Uso: node scripts/italian-shots.mjs <etichetta>
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
for (const [name, opts] of [
  ['desktop', { viewport: { width: 1280, height: 900 } }],
  ['mobile', { ...devices['iPhone 13'] }],
]) {
  for (const lang of ['it', 'en']) {
    const ctx = await browser.newContext({ ...opts, locale: lang === 'it' ? 'it-IT' : 'en-US' });
    const page = await ctx.newPage();
    const base = `${OUT}/italiano-${label}-${name}-${lang}`;
    await page.goto(URL);
    await page.waitForFunction(() => document.querySelector('#cardRows tr'));
    await page.fill('#quickInput', 'fulm');
    await page.waitForFunction(() => document.querySelector('#quickList li')?.textContent?.includes('('));
    await page.screenshot({ path: `${base}-1-suggerimenti.png` });
    await page.press('#quickInput', 'Enter');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${base}-2-risultato.png` });
    await page.fill('#search', 'tempesta');
    await page.waitForTimeout(300);
    await page.locator('#cardRows .cardbtn').first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${base}-3-scheda.png` });
    await ctx.close();
    console.log(`${name} ${lang}: ok`);
  }
}
await browser.close();
