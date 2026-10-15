import { chromium, expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GC_EVENTS } from '../src/lib/analytics';
import { translate, type Lang } from '../src/i18n';

// Conteggio delle visite (GoatCounter): in locale, in anteprima e nei test automatici non parte nessuna richiesta;
// sul dominio pubblicato si contano la pagina e i soli nomi degli eventi, con la CSP della build.

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(HERE, '../tests/fixtures');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P9/PQAJpAPq4u1pTwAAAABJRU5ErkJggg==', 'base64');
const SITE = 'http://pauperindex.com/';
const langOf = (info: TestInfo): Lang => (String(info.project.use.locale || '').startsWith('it') ? 'it' : 'en');
const isCounter = (url: string) => /goatcounter|\/count\.js(\?|$)/.test(url);

/** Il sito pubblicato simulato: le richieste a pauperindex.com sono servite dall'anteprima locale. */
async function servePublished(ctx: BrowserContext, base: string): Promise<void> {
  await ctx.route(/^http:\/\/pauperindex\.com\//, async (r) => {
    const resp = await r.fetch({ url: r.request().url().replace(SITE, base) });
    await r.fulfill({ response: resp });
  });
}

/** Usa le funzioni principali: collezione, controllo rapido, espansione, export, Carta dimenticata, Mazzi, Ko-fi. */
async function useEverything(page: Page, lang: Lang): Promise<void> {
  await page.route('https://cards.scryfall.io/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.route('https://ko-fi.com/**', (r) => r.abort());
  await expect(page.locator('#dataline')).toContainText(translate(lang, 'data.line').split('{')[0]);
  await page.setInputFiles('#files', resolve(FIX, 'collezione-sintetica.csv'));
  await expect(page.locator('#loaded')).toBeVisible();
  await page.locator('#quickInput').fill('brainst');
  await page.locator('#quickInput').press('Enter');
  await expect(page.locator('#quickResult .qtitle')).toContainText('Brainstorm');
  await page.locator('#setInput').click();
  await page.locator('#setInput').fill('ice age');
  await page.locator('#setList [role="option"]', { hasText: 'Ice Age' }).first().click();
  await expect(page.locator('#setWrap')).toHaveClass(/has-set/);
  await page.locator('#expDetails summary').click();
  const dl = page.waitForEvent('download');
  await page.click('[data-save="owned"]');
  await dl;
  await page.click('#navDust');
  await page.locator('#dustBtn').click();
  await expect(page.locator('#dustResult')).toBeVisible();
  await page.click('#navDecks');
  await expect(page.locator('#viewDecks')).toBeVisible();
  const popup = page.context().waitForEvent('page');
  await page.locator('.donate a').click();
  await (await popup).close();
}

test('in locale e in anteprima nessun conteggio: né count.js né richieste a GoatCounter', async ({ page }, info) => {
  const reqs: string[] = [];
  page.on('request', (r) => reqs.push(r.url()));
  await page.goto('./');
  await useEverything(page, langOf(info));
  expect(reqs.filter(isCounter)).toEqual([]);
  expect(await page.evaluate(() => 'goatcounter' in window)).toBe(false);
  await expect(page.locator('script[data-goatcounter]')).toHaveCount(0);
});

test('test automatici: nessun conteggio nemmeno sul dominio pubblicato', async ({ page, context, baseURL }) => {
  await servePublished(context, baseURL!);
  const reqs: string[] = [];
  page.on('request', (r) => reqs.push(r.url()));
  await page.goto(SITE);
  await expect(page.locator('#dataline')).not.toHaveText(translate('it', 'data.loading'));
  expect(await page.evaluate(() => navigator.webdriver)).toBe(true);
  expect(reqs.filter(isCounter)).toEqual([]);
});

test('sul dominio pubblicato: la pagina e i soli nomi degli eventi, con la CSP della build', async ({ baseURL }, info) => {
  test.skip(info.project.name !== 'desktop-it', 'basta un progetto: lingua e schermo non contano');
  // un browser come quello di un visitatore (navigator.webdriver falso)
  const browser = await chromium.launch({ ...info.project.use.launchOptions, args: ['--disable-blink-features=AutomationControlled'] });
  try {
    const context = await browser.newContext({ locale: 'it-IT', acceptDownloads: true });
    await servePublished(context, baseURL!);
    const hits: URL[] = [];
    await context.route('https://albafvcens.goatcounter.com/**', (r) => {
      hits.push(new URL(r.request().url()));
      return r.fulfill({ status: 204 });
    });
    const page = await context.newPage();
    const csp: string[] = [];
    page.on('console', (m) => /Content Security Policy/i.test(m.text()) && csp.push(m.text()));
    await page.goto(SITE);
    expect(await page.evaluate(() => navigator.webdriver)).toBe(false);
    await expect.poll(() => hits.length).toBe(1);
    await useEverything(page, 'it');
    // ancora una volta le stesse funzioni: ogni evento si conta una volta per pagina caricata
    await page.click('#navDust');
    await page.locator('#dustBtn').click();
    await expect.poll(() => hits.length).toBe(1 + GC_EVENTS.length);

    for (const u of hits) expect(u.pathname).toBe('/count');
    const [view, ...events] = hits.map((u) => Object.fromEntries(u.searchParams));
    // visita: percorso canonico, nessun evento
    expect(view.p).toBe('/');
    expect(view.e).toBeUndefined();
    expect(Object.keys(view).sort()).toEqual(['b', 'p', 'rnd', 's', 't']);
    expect(view.t).toBe('Pauper Index');
    // eventi: solo il nome (più larghezza dello schermo, controllo "bot" e numero anti-cache di count.js), mai carte o testo
    expect(events.map((e) => e.p).sort()).toEqual([...GC_EVENTS].sort());
    for (const e of events) {
      expect(Object.keys(e).sort()).toEqual(['b', 'e', 'p', 'rnd', 's', 't']);
      expect(e.b).toBe('0'); // controllo "bot" di count.js: questo browser sembra un visitatore
      expect(e.t).toBe(e.p);
      expect(e.e).toBe('true');
    }
    const all = hits.map((u) => decodeURIComponent(u.search)).join('\n');
    expect(all).not.toMatch(/Brainstorm|Ice Age|ICE|collezione-sintetica/);
    expect(csp).toEqual([]);
    // nessun cookie e nessuna chiave del contatore nel localStorage
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => !k.startsWith('pauper-index:')))).toEqual([]);

    // esclusione delle proprie visite: /#toggle-goatcounter (una volta per browser) ferma visite ed eventi
    const dialogs: string[] = [];
    page.on('dialog', (dlg) => { dialogs.push(dlg.message()); void dlg.accept(); });
    const before = hits.length;
    // cambia solo l'hash: serve ricaricare perché count.js lo legga all'avvio
    await page.goto(`${SITE}#toggle-goatcounter`);
    await page.reload();
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs[0]).toContain('DISABLED');
    await page.goto(SITE);
    await page.locator('#quickInput').fill('brainst');
    await page.locator('#quickInput').press('Enter');
    await expect(page.locator('#quickResult .qtitle')).toContainText('Brainstorm');
    await page.waitForTimeout(500);
    expect(hits.length).toBe(before);
  } finally {
    await browser.close();
  }
});
