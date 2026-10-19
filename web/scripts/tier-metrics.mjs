// Tier list (#mazzi): misure del primo schermo e screenshot, iPhone SE 375×667 e desktop 1280×900, chiaro e scuro,
// IT e EN, senza collezione. Misure: posizione del titolo "Tier 1", altezza delle schede, archetipi interi nel primo
// schermo, lunghezza della pagina. Le illustrazioni hanno dimensioni fisse (proporzione 4:3), quindi si bloccano.
// Su mobile si misura con Arial (larga come i caratteri dei telefoni), come home-metrics.mjs.
// -> ../.cache/screenshots/tier-<etichetta>-*.png e tier-<etichetta>.json (cartella ignorata da git).
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra); oppure SITE_URL=https://pauperindex.com/
// Uso: node scripts/tier-metrics.mjs <etichetta>
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../.cache/screenshots');
const URL = process.env.SITE_URL || 'http://localhost:4173/';
const label = process.argv[2] || 'misura';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const out = [];
for (const [name, opts] of [
  ['mobile', { ...devices['iPhone 13'], viewport: { width: 375, height: 667 } }],
  ['desktop', { viewport: { width: 1280, height: 900 } }],
]) {
  for (const scheme of ['light', 'dark']) {
    for (const lang of ['it', 'en']) {
      const ctx = await browser.newContext({ ...opts, locale: lang === 'it' ? 'it-IT' : 'en-US', colorScheme: scheme, bypassCSP: name === 'mobile' });
      const page = await ctx.newPage();
      await page.addInitScript(() => localStorage.setItem('pauper-index:welcomeClosed', '1'));
      await page.route('https://cards.scryfall.io/**', (r) => r.abort());
      await page.goto(URL + '#mazzi');
      await page.waitForFunction(() => document.querySelectorAll('#tierSections .fam-card').length > 0);
      if (name === 'mobile') await page.addStyleTag({ content: 'body, body *:not(.brand) { font-family: Arial, "Liberation Sans", sans-serif !important; }' });
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('#tierSections .fam-card')];
        const t1 = document.querySelector('.tier-sec.t1 .tier-head')?.getBoundingClientRect();
        return {
          screen: innerHeight, page: document.documentElement.scrollHeight,
          tier1Top: t1 ? Math.round(t1.top) : null, tier1Bottom: t1 ? Math.round(t1.bottom) : null,
          firstCardTop: cards[0] ? Math.round(cards[0].getBoundingClientRect().top) : null,
          cardHeights: cards.slice(0, 3).map((c) => Math.round(c.getBoundingClientRect().height)),
          wholeInFirstScreen: cards.filter((c) => c.getBoundingClientRect().bottom <= innerHeight).length,
          hscroll: document.documentElement.scrollWidth > innerWidth,
        };
      });
      const base = `${OUT}/tier-${label}-${name}-${scheme === 'light' ? 'chiaro' : 'scuro'}-${lang}`;
      await page.screenshot({ path: `${base}.png` });
      out.push({ device: name, scheme, lang, ...m });
      console.log(`${name} ${scheme} ${lang}: Tier 1 a ${m.tier1Top} · prima scheda a ${m.firstCardTop} · schede ${m.cardHeights.join('/')}`
        + ` · intere nel primo schermo ${m.wholeInFirstScreen} (schermo ${m.screen}) · pagina ${m.page}${m.hscroll ? ' · SCORRIMENTO ORIZZONTALE' : ''}`);
      await ctx.close();
    }
  }
}
await browser.close();
writeFileSync(`${OUT}/tier-${label}.json`, JSON.stringify(out, null, 1));
console.log(`-> ${OUT}/tier-${label}.json`);
