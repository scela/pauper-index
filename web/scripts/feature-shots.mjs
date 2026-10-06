// Screenshot di confronto (prima/dopo) per selettore delle espansioni, vista per espansione e "Carta dimenticata",
// desktop e mobile -> ../.cache/screenshots/confronto-<etichetta>-*.png (cartella ignorata da git).
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra)
// Uso: node scripts/feature-shots.mjs <etichetta>   (per esempio prima, dopo)
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../.cache/screenshots');
const CSV = resolve(here, '../tests/fixtures/collezione-sintetica.csv');
const URL = process.env.SITE_URL || 'http://localhost:4173/';
const label = process.argv[2] || 'dopo';
mkdirSync(OUT, { recursive: true });

const settle = async (page) => {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    const imgs = [...document.images].filter((i) => !i.complete && i.getBoundingClientRect().top < innerHeight);
    await Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
  });
  await page.waitForTimeout(500);
};

const browser = await chromium.launch();
for (const [name, opts] of [
  ['desktop', { viewport: { width: 1280, height: 900 }, locale: 'it-IT' }],
  ['mobile', { ...devices['iPhone 13'], locale: 'it-IT' }],
  ['desktop-scuro', { viewport: { width: 1280, height: 900 }, locale: 'it-IT', colorScheme: 'dark' }],
]) {
  const ctx = await browser.newContext({ ...opts, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const shot = (what) => page.screenshot({ path: `${OUT}/confronto-${label}-${name}-${what}.png` });
  await page.goto(URL);
  await page.waitForFunction(() => document.querySelector('#cardRows tr'));
  // Rispolvera (senza collezione, così pesca tra tutte): prima un pulsante accanto al controllo rapido, ora una pagina
  if (await page.locator('#dustBtn').count()) {
    if (await page.locator('#navDust').count()) await page.click('#navDust');
    await settle(page);
    await shot('4-rispolvera-pagina');
    await page.click('#dustBtn');
    await page.waitForSelector('.dres, .dust-scene:not(.is-empty)');
    await settle(page);
    await shot('5-rispolvera-carta');
  }
  await page.goto(URL);
  await page.waitForFunction(() => document.querySelector('#cardRows tr'));
  await page.setInputFiles('#files', CSV);
  await page.waitForSelector('#loaded:not([hidden])');
  // selettore delle espansioni: elenco dei suggerimenti
  await page.click('#setInput');
  await page.fill('#setInput', 'dominaria');
  await page.waitForSelector('#setList:not([hidden])');
  await settle(page);
  await shot('1-suggerimenti');
  // vista per espansione: Masters 25
  await page.fill('#setInput', 'masters 25');
  await page.locator('#setList [role="option"]').first().click();
  await page.locator('#setWrap').scrollIntoViewIfNeeded();
  await settle(page);
  await shot('2-espansione');
  await page.locator('#cardRows .cardbtn').first().click();
  await settle(page);
  await shot('3-scheda');
  await page.keyboard.press('Escape');
  console.log(`${name}: ok`);
  await ctx.close();
}
await browser.close();
console.log(`screenshot in ${OUT}`);
