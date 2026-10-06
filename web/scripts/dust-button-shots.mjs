// Pagina "Carta dimenticata" e pulsante "Rispolvera una carta": desktop e mobile, tema chiaro e scuro
// -> ../.cache/screenshots/pulsante-<etichetta>-*.png (cartella ignorata da git).
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra)
// Uso: node scripts/dust-button-shots.mjs <etichetta>   (per esempio prima, dopo)
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
    ['desktop', { viewport: { width: 1280, height: 900 } }],
    ['mobile', { ...devices['iPhone 13'] }],
  ]) {
    const ctx = await browser.newContext({ ...opts, locale: 'it-IT', colorScheme: scheme });
    const page = await ctx.newPage();
    const base = `${OUT}/pulsante-${label}-${name}-${scheme === 'light' ? 'chiaro' : 'scuro'}`;
    await page.goto(URL + '#carta-dimenticata');
    await page.waitForSelector('#dustResult .dust-scene');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${base}-1-pagina.png` });
    // pulsante da vicino, a riposo e con il focus da tastiera
    const btn = page.locator('#dustBtn');
    const box = await btn.boundingBox();
    const clip = { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 30), width: box.width + 80, height: box.height + 60 };
    await page.screenshot({ path: `${base}-2-pulsante.png`, clip });
    await btn.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${base}-3-focus.png`, clip });
    console.log(`${name} ${scheme}: ok`);
    await ctx.close();
  }
}
await browser.close();
console.log(`screenshot in ${OUT}`);
