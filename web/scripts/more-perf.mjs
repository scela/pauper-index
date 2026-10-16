// "Carica altri": tempo per far comparire un blocco di 100 righe (dal clic al fotogramma disegnato), su mobile
// (iPhone 13 emulato, 375×667), periodo Storico, a velocità piena e con il processore rallentato 4×, tre blocchi di fila.
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra)
// Uso: node scripts/more-perf.mjs
import { chromium, devices } from '@playwright/test';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 375, height: 667 }, locale: 'it-IT' });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem('pauper-index:welcomeClosed', '1'));
await page.route('https://cards.scryfall.io/**', (r) => r.abort());
await page.goto('http://localhost:4173/'); await page.waitForFunction(() => document.querySelector('#cardRows tr'));
await page.selectOption('#period', '3'); await page.waitForTimeout(500);
const cdp = await ctx.newCDPSession(page);
const res = [];
for (const rate of [1, 4]) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  for (let k = 0; k < 3; k++) {
    const ms = await page.evaluate(() => new Promise((resolve) => {
      const n = document.querySelectorAll('#cardRows tr').length;
      const t0 = performance.now();
      document.getElementById('more').click();
      const wait = () => (document.querySelectorAll('#cardRows tr').length > n
        ? requestAnimationFrame(() => requestAnimationFrame(() => resolve([Math.round(performance.now() - t0), document.querySelectorAll('#cardRows tr').length])))
        : requestAnimationFrame(wait));
      wait();
    }));
    res.push(`${rate}x blocco ${k + 1}: ${ms[0]} ms (righe ${ms[1]})`);
  }
  await page.reload(); await page.waitForFunction(() => document.querySelector('#cardRows tr')); await page.selectOption('#period', '3'); await page.waitForTimeout(500);
}
console.log(res.join('\n'));
console.log('pulsante:', await page.locator('#more').innerText());
await b.close();
