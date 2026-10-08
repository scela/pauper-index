// Pagina "Mazzi": senza e con collezione, decklist aperta, desktop e mobile, chiaro e scuro
// -> ../.cache/screenshots/mazzi-<etichetta>-*.png (cartella ignorata da git).
// La collezione è sintetica: le carte delle liste più frequenti, con alcune copie tolte (nessun dato personale).
// Richiede il sito in esecuzione: npm run build; npm run preview  (in un'altra finestra)
// Uso: node scripts/decks-shots.mjs <etichetta> [it|en]
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../.cache/screenshots');
const URL = process.env.SITE_URL || 'http://localhost:4173/';
const label = process.argv[2] || 'dopo';
const lang = process.argv[3] || 'it';
mkdirSync(OUT, { recursive: true });

// collezione sintetica: tutte le carte delle 3 liste più giocate, meno qualche copia, più metà di altre 20 liste
const cards = JSON.parse(readFileSync(resolve(here, '../../data/cards.json'), 'utf-8')).c;
const decks = JSON.parse(readFileSync(resolve(here, '../../data/decks-61.json'), 'utf-8'));
const owned = new Map();
const add = (flat, keep) => {
  for (let i = 0; i < flat.length; i += 2) owned.set(flat[i], Math.max(owned.get(flat[i]) || 0, keep(flat[i + 1], i)));
};
const top = [...decks.l].sort((a, b) => b[4].length - a[4].length);
top.slice(0, 3).forEach((l, k) => { add(l[2], (n, i) => (k === 2 && i % 6 === 0 ? n - 1 : n)); add(l[3], (n) => n); });
top.slice(3, 23).forEach((l) => add(l[2], (n, i) => (i % 4 === 0 ? n : 0)));
const text = [...owned].filter(([, n]) => n > 0).map(([i, n]) => `${n} ${cards[i].n}`).join('\n');

const browser = await chromium.launch();
for (const [name, opts] of [
  ['desktop', { viewport: { width: 1280, height: 900 } }],
  ['mobile', { ...devices['iPhone 13'] }],
]) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ ...opts, locale: lang === 'it' ? 'it-IT' : 'en-US', colorScheme: scheme });
    const page = await ctx.newPage();
    const base = `${OUT}/mazzi-${label}-${name}-${scheme}`;
    await page.goto(URL + '#mazzi');
    await page.waitForFunction(() => document.querySelectorAll('#deckList .dk').length > 0);
    await page.screenshot({ path: `${base}-1-senza.png` });
    await page.goto(URL);
    await page.waitForFunction(() => document.querySelector('#cardRows tr'));
    await page.fill('#pasteText', text);
    await page.click('#pasteAdd');
    await page.waitForSelector('#loaded:not([hidden])');
    await page.click('#navDecks');
    await page.waitForFunction(() => document.querySelector('#deckList .dk-comp'));
    await page.screenshot({ path: `${base}-2-collezione.png` });
    await page.screenshot({ path: `${base}-3-pagina.png`, fullPage: true });
    // la prima lista non completa: decklist aperta
    const deck = page.locator('#deckList .dk:has(.dk-missing)').first();
    await deck.locator('.dk-list summary').click();
    await deck.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await deck.screenshot({ path: `${base}-4-decklist.png` });
    await ctx.close();
    console.log(`${name} ${scheme}: ok`);
  }
}
await browser.close();
