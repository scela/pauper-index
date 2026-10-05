// Screenshot di controllo, prima e dopo il caricamento, desktop e mobile -> ../.cache/screenshots/ (ignorata da git).
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra)
// Uso: npm run screenshots [-- percorso\collezione.csv]   (default: collezione sintetica dei test)
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../.cache/screenshots');
const CSV = resolve(process.argv[2] || resolve(here, '../tests/fixtures/collezione-sintetica.csv'));
const URL = process.env.SITE_URL || 'http://localhost:4173/';
mkdirSync(OUT, { recursive: true });

const settle = async (page) => {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    const imgs = [...document.images].filter((i) => !i.complete && i.loading !== 'lazy');
    await Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
  });
  await page.waitForTimeout(600);
};

const browser = await chromium.launch();
for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 900 } }], ['mobile', { ...devices['iPhone 13'] }]]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForSelector('#dataline');
  await page.waitForFunction(() => document.querySelector('#cardRows tr'));
  await settle(page);
  await page.screenshot({ path: `${OUT}/${name}-1-prima.png` });
  await page.screenshot({ path: `${OUT}/${name}-1-prima-intera.png`, fullPage: true });
  await page.setInputFiles('#files', CSV);
  await page.waitForSelector('#loaded:not([hidden])');
  await settle(page);
  await page.screenshot({ path: `${OUT}/${name}-2-dopo.png` });
  await page.screenshot({ path: `${OUT}/${name}-2-dopo-intera.png`, fullPage: true });
  await page.locator('#cardRows .cardbtn').first().click();
  await settle(page);
  await page.screenshot({ path: `${OUT}/${name}-3-scheda.png` });
  console.log(`${name}: ok`);
  await ctx.close();
}
await browser.close();
console.log(`screenshot in ${OUT}`);
