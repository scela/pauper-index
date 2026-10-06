// Screenshot della pagina Informazioni, desktop e mobile, IT e EN -> ../.cache/screenshots/ (ignorata da git).
// Richiede il sito in esecuzione (npm run build; npm run preview). Uso: node scripts/about-shots.mjs <etichetta>
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../.cache/screenshots');
const URL = process.env.SITE_URL || 'http://localhost:4173/';
const label = process.argv[2] || 'ora';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const lang of ['it', 'en']) {
  const locale = lang === 'it' ? 'it-IT' : 'en-US';
  for (const [dev, opts] of [['desktop', { viewport: { width: 1280, height: 900 }, locale }], ['mobile', { ...devices['iPhone 13'], locale }]]) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.goto(URL + '#informazioni');
    await page.waitForSelector('#viewAbout article');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/informazioni-${label}-${dev}-${lang}.png`, fullPage: true });
    await ctx.close();
  }
}
await browser.close();
console.log(`screenshot in ${OUT}`);
