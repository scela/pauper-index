// Fotogrammi della carta in 3D ("Carta dimenticata"), inclinata in direzioni diverse: desktop (mouse) e mobile (dito)
// -> ../.cache/screenshots/carta3d-*.png (cartella ignorata da git).
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra)
// Uso: node scripts/tilt-frames.mjs
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../.cache/screenshots');
const URL = process.env.SITE_URL || 'http://localhost:4173/';
mkdirSync(OUT, { recursive: true });

// posizioni del puntatore sulla carta, in frazioni di larghezza e altezza
const SPOTS = [['alto-sinistra', 0.1, 0.1], ['alto-destra', 0.9, 0.1], ['basso-sinistra', 0.1, 0.9], ['basso-destra', 0.9, 0.9], ['centro-destra', 0.95, 0.5]];

const browser = await chromium.launch();
for (const [name, opts, touch] of [
  ['desktop', { viewport: { width: 1280, height: 900 } }, false],
  ['mobile', { ...devices['iPhone 13'] }, true],
]) {
  const ctx = await browser.newContext({ ...opts, locale: 'it-IT' });
  const page = await ctx.newPage();
  await page.goto(URL + '#carta-dimenticata');
  await page.click('#dustBtn');
  const stage = page.locator('#dustResult .dust-stage.tilt');
  await stage.waitFor({ timeout: 10000 });
  await page.locator('#dustResult .dust-cover').waitFor({ state: 'detached' });
  await stage.scrollIntoViewIfNeeded();
  const scene = page.locator('#dustResult .dust-scene');
  for (const [label, fx, fy] of SPOTS) {
    const b = await stage.boundingBox();
    const x = b.x + b.width * fx;
    const y = b.y + b.height * fy;
    if (touch) {
      const ev = { pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: x, clientY: y, bubbles: true };
      await stage.dispatchEvent('pointerdown', ev);
      await stage.dispatchEvent('pointermove', ev);
    } else {
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.move(x, y, { steps: 6 });
    }
    await page.waitForTimeout(700);
    await scene.screenshot({ path: `${OUT}/carta3d-${name}-${label}.png` });
    if (touch) await stage.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 7, isPrimary: true, bubbles: true });
  }
  // fuori dalla carta (o dito sollevato): torna piatta
  if (!touch) await page.mouse.move(5, 5);
  await page.waitForTimeout(900);
  await scene.screenshot({ path: `${OUT}/carta3d-${name}-piatta.png` });
  console.log(`${name}: ok`);
  await ctx.close();
}
await browser.close();
console.log(`fotogrammi in ${OUT}`);
