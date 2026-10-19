// Testata del sito: desktop, telefoni da 360, 375, 390 e 430 px, tema chiaro e scuro, a riposo, con il focus sulla voce
// "Carta dimenticata" e sulla pagina Debutti (sipario aperto)
// -> ../.cache/screenshots/testata-<etichetta>-*.png (cartella ignorata da git).
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra)
// Uso: node scripts/header-shots.mjs <etichetta>   (per esempio prima, dopo)
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
    ['mobile-piccolo', { ...devices['iPhone SE'] }],
    ...[360, 375, 390, 430].map((w) => [`telefono-${w}`, { ...devices['iPhone 13'], viewport: { width: w, height: 740 } }]),
  ]) {
    for (const lang of ['it', 'en']) {
      const ctx = await browser.newContext({ ...opts, locale: lang === 'it' ? 'it-IT' : 'en-US', colorScheme: scheme });
      const page = await ctx.newPage();
      const base = `${OUT}/testata-${label}-${name}-${scheme === 'light' ? 'chiaro' : 'scuro'}-${lang}`;
      await page.goto(URL);
      await page.waitForFunction(() => document.querySelector('#cardRows tr'));
      const top = await page.locator('.top').boundingBox();
      const vw = page.viewportSize().width;
      const clip = { x: 0, y: 0, width: vw, height: Math.ceil(top.y + top.height + 40) };
      await page.screenshot({ path: `${base}-1.png`, clip });
      await page.locator('#navDust').focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${base}-2-focus.png`, clip });
      await page.locator('#navDebuts').click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${base}-3-debutti.png`, clip });
      await ctx.close();
    }
    console.log(`${name} ${scheme}: ok`);
  }
}
await browser.close();
console.log(`screenshot in ${OUT}`);
