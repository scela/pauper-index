// Preferite: screenshot e misure. Desktop 1280×900 e iPhone SE 375×667 (con Arial, come i telefoni), chiaro e scuro.
// Misure: altezza delle righe dell'elenco (con il segno ♥ sulla prima), delle righe della decklist e delle schede dei
// Debutti, con e senza preferite. Collezione sintetica incollata (nessun dato personale).
// -> ../.cache/screenshots/preferite-<etichetta>-*.png e preferite-<etichetta>.json
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra)
// Uso: node scripts/favorites-shots.mjs <etichetta> [it|en]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../.cache/screenshots');
const URL = process.env.SITE_URL || 'http://localhost:4173/';
const label = process.argv[2] || 'dopo';
const lang = process.argv[3] || 'it';
mkdirSync(OUT, { recursive: true });
const PASTE = ['4 Ponder', '4 Brainstorm', '4 Counterspell', '2 Lightning Bolt', '1 Black Lotus', '2 Snuff Out'].join('\n');
const ARIAL = 'body, body *:not(.brand) { font-family: Arial, "Liberation Sans", sans-serif !important; }';

const heights = (page, sel, n = 3) => page.locator(sel).evaluateAll((els, n) => els.slice(0, n).map((e) => Math.round(e.getBoundingClientRect().height)), n);

const browser = await chromium.launch();
const report = {};
for (const [name, opts] of [
  ['desktop', { viewport: { width: 1280, height: 900 } }],
  ['iphone-se', { ...devices['iPhone SE'], viewport: { width: 375, height: 667 } }],
]) {
  for (const scheme of ['light', 'dark']) {
    const mobile = name !== 'desktop';
    const ctx = await browser.newContext({ ...opts, locale: lang === 'it' ? 'it-IT' : 'en-US', colorScheme: scheme, bypassCSP: mobile });
    await ctx.addInitScript(() => localStorage.setItem('pauper-index:welcomeClosed', '1'));
    const page = await ctx.newPage();
    const font = () => (mobile ? page.addStyleTag({ content: ARIAL }) : null);
    const go = async (hash) => {
      await page.evaluate((h) => { location.hash = h; }, hash);
      await font();
    };
    const base = `${OUT}/preferite-${label}-${name}-${scheme}`;
    const m = {};
    const favSearch = async (n) => {
      await page.fill('#search', n);
      await page.locator('#search').press('Enter');
      await page.waitForSelector('#sheet:not([hidden])');
      if ((await page.locator('#sheet .favbtn').getAttribute('aria-pressed')) === 'false') await page.locator('#sheet .favbtn').click();
      await page.keyboard.press('Escape');
      await page.fill('#search', '');
      await page.locator('#search').press('Escape');
    };
    await page.goto(URL);
    await font();
    await page.waitForSelector('#cardRows tr');
    // prima delle preferite
    m.rowsBefore = await heights(page, '#cardRows tr');
    await go('#debutti');
    await page.waitForSelector('.deb-card');
    m.debutsBefore = await heights(page, '.deb-card');
    await go('#mazzi/c1');
    await page.waitForSelector('#deckList .dk-list');
    await page.locator('#deckList .dk-list summary').first().click();
    m.decklistBefore = await heights(page, '#deckList .dk-list[open] .dk-sec li', 6);
    // la prima carta della decklist e le prime due dell'elenco tra le preferite
    await page.locator('#deckList .dk-list[open] .dk-card').first().click();
    await page.locator('#sheet .favbtn').click();
    await page.keyboard.press('Escape');
    m.decklistAfter = await heights(page, '#deckList .dk-list[open] .dk-sec li', 6);
    await page.locator('#deckList .dk-list[open]').first().screenshot({ path: `${base}-7-decklist.png` });
    await go('');
    await page.waitForSelector('#cardRows tr');
    await page.locator('#cardRows .cardbtn').first().click();
    await page.locator('#sheet .favbtn').click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${base}-1-scheda.png` });
    await page.keyboard.press('Escape');
    m.rowsAfter = await heights(page, '#cardRows tr');
    await page.screenshot({ path: `${base}-2-elenco.png` });
    await favSearch('Black Lotus');
    // Debutti: cuore sulla riga di "Analisi"
    await go('#debutti');
    await page.waitForSelector('.deb-card');
    await page.locator('.deb-card .deb-fav').first().click();
    m.debutsAfter = await heights(page, '.deb-card');
    await page.screenshot({ path: `${base}-5-debutti.png` });
    // Carta dimenticata
    await go('#carta-dimenticata');
    await page.click('#dustBtn');
    await page.waitForTimeout(1300);
    await page.locator('.dust-scene').screenshot({ path: `${base}-6-dimenticata.png` });
    // con la collezione: pagina delle preferite
    await go('');
    await page.click('#pasteToggle');
    await page.fill('#pasteText', PASTE);
    await page.click('#pasteAdd');
    await page.waitForSelector('#loaded:not([hidden])');
    await favSearch('Brainstorm');
    // pannello "Filtri" con "Solo preferite"
    await page.click('#filtersBtn');
    await page.click('#fpFav');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${base}-4-filtri.png` });
    await page.click('#fpDone');
    await page.screenshot({ path: `${base}-3-solo-preferite.png` });
    if (mobile) {
      await page.click('#navMore');
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${base}-8-menu.png` });
      await page.click('#navFav');
      await font();
    } else {
      await page.click('#favBar');
    }
    await page.waitForSelector('.favrow');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${base}-9-pagina.png`, fullPage: true });
    report[`${name}-${scheme}`] = m;
    console.log(`${name} ${scheme}: righe ${m.rowsBefore.join('/')} -> ${m.rowsAfter.join('/')} · decklist ${m.decklistBefore.join('/')} -> ${m.decklistAfter.join('/')} · debutti ${m.debutsBefore.join('/')} -> ${m.debutsAfter.join('/')}`);
    await ctx.close();
  }
}
await browser.close();
writeFileSync(`${OUT}/preferite-${label}.json`, JSON.stringify(report, null, 1));
console.log(`-> ${OUT}/preferite-${label}.json`);
