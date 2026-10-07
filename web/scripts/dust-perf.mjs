// Diagnosi di "Carta dimenticata": video di 3 pesche consecutive e misure con il processore rallentato.
// -> ../.cache/screenshots/rispolvera-video-<etichetta>-<desktop|mobile>.webm e rispolvera-misure-<etichetta>.json
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra)
// Uso: node scripts/dust-perf.mjs <etichetta> [rallentamento CPU, default 4]
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../.cache/screenshots');
const URL = process.env.SITE_URL || 'http://localhost:4173/';
const label = process.argv[2] || 'dopo';
const RATE = Number(process.argv[3] || 4);
const DRAWS = 3;
mkdirSync(OUT, { recursive: true });

const DEVICES = [
  ['desktop', { viewport: { width: 1280, height: 900 } }],
  ['mobile', { ...devices['iPhone 13'] }],
];

/** Carta interamente visibile: nessuna copertura e immagine caricata. */
const settled = () => {
  const stage = document.querySelector('#dustResult .dust-stage:not(.dust-empty)');
  const img = stage?.querySelector('img.card-cur') || stage?.querySelector('img');
  return !!stage && !document.querySelector('#dustResult .dust-cover:not(.still)') && !!img && img.complete && img.naturalWidth > 0;
};

async function draw(page) {
  const title = await page.locator('#dustTitle').textContent().catch(() => null);
  await page.evaluate(() => { window.__t0 = performance.now(); window.__mark('press'); });
  await page.click('#dustBtn');
  await page.waitForFunction((t) => {
    const el = document.querySelector('#dustTitle');
    return el && el.textContent !== t;
  }, title, { timeout: 15000 });
  await page.waitForFunction(settled, null, { timeout: 15000, polling: 'raf' });
  return page.evaluate(() => { window.__mark('visible'); return performance.now() - window.__t0; });
}

const results = {};
const browser = await chromium.launch();
for (const [name, opts] of DEVICES) {
  // 1) video a velocità normale
  const vdir = resolve(OUT, `.video-${label}-${name}`);
  rmSync(vdir, { recursive: true, force: true });
  const vctx = await browser.newContext({ ...opts, locale: 'it-IT', recordVideo: { dir: vdir, size: opts.viewport } });
  const vpage = await vctx.newPage();
  await vpage.addInitScript(() => { window.__mark = () => {}; });
  await vpage.goto(URL + '#carta-dimenticata');
  await vpage.waitForSelector('#dustResult .dust-scene');
  await vpage.waitForTimeout(600);
  for (let i = 0; i < DRAWS; i++) {
    await draw(vpage);
    await vpage.waitForTimeout(900);
  }
  await vctx.close();
  const file = readdirSync(vdir).find((f) => f.endsWith('.webm'));
  renameSync(resolve(vdir, file), resolve(OUT, `rispolvera-video-${label}-${name}.webm`));
  rmSync(vdir, { recursive: true, force: true });

  // 2) misure con il processore rallentato
  const ctx = await browser.newContext({ ...opts, locale: 'it-IT' });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const frames = [];
    const marks = [];
    const shifts = [];
    window.__mark = (m) => marks.push([m, performance.now()]);
    const loop = (t) => { frames.push(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) shifts.push([e.startTime, e.value]); }))
      .observe({ type: 'layout-shift', buffered: true });
    window.__perf = { frames, marks, shifts };
  });
  await page.goto(URL + '#carta-dimenticata');
  await page.waitForSelector('#dustResult .dust-scene');
  await page.waitForTimeout(800);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  const durations = [];
  for (let i = 0; i < DRAWS; i++) {
    durations.push(Math.round(await draw(page)));
    // inclinazione 3D: il mouse resta sulla carta tra una pesca e l'altra (solo desktop)
    if (name === 'desktop') {
      const b = await page.locator('#dustResult .dust-stage').boundingBox();
      if (b) await page.mouse.move(b.x + b.width * 0.85, b.y + b.height * 0.15, { steps: 5 });
    }
    await page.waitForTimeout(700);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const perf = await page.evaluate(() => window.__perf);
  // fotogrammi persi tra ogni pressione e la carta visibile
  const per = [];
  const presses = perf.marks.filter((m) => m[0] === 'press').map((m) => m[1]);
  const visibles = perf.marks.filter((m) => m[0] === 'visible').map((m) => m[1]);
  presses.forEach((p, i) => {
    const end = visibles[i];
    const fr = perf.frames.filter((t) => t >= p && t <= end);
    let dropped = 0;
    let long = 0;
    let worst = 0;
    for (let k = 1; k < fr.length; k++) {
      const gap = fr[k] - fr[k - 1];
      dropped += Math.max(0, Math.round(gap / 16.67) - 1);
      if (gap > 50) long++;
      worst = Math.max(worst, gap);
    }
    const cls = perf.shifts.filter(([t]) => t >= p && t <= end + 500).reduce((a, [, v]) => a + v, 0);
    per.push({ ms: durations[i], frames: fr.length, dropped, framesOver50ms: long, worstFrameMs: Math.round(worst), layoutShift: Number(cls.toFixed(4)) });
  });
  results[name] = { cpuSlowdown: RATE, draws: per };
  console.log(name, JSON.stringify(per));
  await ctx.close();
}
await browser.close();
writeFileSync(resolve(OUT, `rispolvera-misure-${label}.json`), JSON.stringify(results, null, 2));
console.log(`video e misure in ${OUT}`);
