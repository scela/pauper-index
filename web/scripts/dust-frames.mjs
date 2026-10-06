// Fotogrammi dell'animazione "Rispolvera una carta" (pagina "Carta dimenticata"), desktop e mobile -> ../.cache/screenshots/ (ignorata da git).
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra)
// Uso: npm run dust-frames
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../.cache/screenshots');
const URL = process.env.SITE_URL || 'http://localhost:4173/';
const FRAMES = [0, 400, 700, 1000, 1300]; // ms dall'inizio della spazzata; più il fotogramma finale a copertura rimossa
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
for (const [name, opts] of [
  ['desktop', { viewport: { width: 1280, height: 900 }, locale: 'it-IT' }],
  ['mobile', { ...devices['iPhone 13'], locale: 'it-IT' }],
]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(URL + '#carta-dimenticata');
  await page.waitForSelector('#dustResult .dust-scene.is-empty');
  await page.click('#dustBtn');
  // immagine caricata e spazzata partita: si fermano le animazioni e si scorre il tempo a mano
  await page.waitForSelector('.dust-cover.go', { timeout: 10000 });
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
  const panel = page.locator('#dustResult .dust-scene');
  await panel.scrollIntoViewIfNeeded();
  for (const [i, ms] of FRAMES.entries()) {
    await page.evaluate((t) => document.getAnimations().forEach((a) => { a.currentTime = t; }), ms);
    await page.waitForTimeout(50);
    await panel.screenshot({ path: `${OUT}/rispolvera-${name}-${i + 1}-${ms}ms.png` });
  }
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
  await page.waitForSelector('.dust-cover', { state: 'detached', timeout: 5000 });
  await panel.screenshot({ path: `${OUT}/rispolvera-${name}-${FRAMES.length + 1}-fine.png` });
  console.log(`${name}: ok`);
  await ctx.close();
}
await browser.close();
console.log(`fotogrammi in ${OUT}`);
