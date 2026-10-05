// Genera le icone PNG da public/icon.svg con Chromium di Playwright (npm run icons).
// Le PNG sono committate: serve rilanciarlo solo se cambia l'icona.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const pub = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const svg = readFileSync(resolve(pub, 'icon.svg'), 'utf-8');
const targets = [
  ['apple-touch-icon.png', 180, false],
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, maskable] of targets) {
  await page.setViewportSize({ width: size, height: size });
  // maskable: sfondo pieno e contenuto nell'area sicura (80%)
  const inner = maskable ? Math.round(size * 0.8) : size;
  const bg = maskable ? '#2F5FA8' : 'transparent';
  await page.setContent(`<html><body style="margin:0;background:${bg};display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: resolve(pub, name), omitBackground: !maskable });
  console.log('scritto', name);
}
await browser.close();
