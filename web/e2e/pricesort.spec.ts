import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { translate, type Key, type Lang } from '../src/i18n';

// Ordinamento per prezzo ("Prezzo crescente" / "Prezzo decrescente") nella pagina principale e nelle Preferite:
// lo stesso prezzo della colonna, le carte senza prezzo in fondo, la scelta salvata, prezzi in ritardo o assenti.

const HERE = dirname(fileURLToPath(import.meta.url));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P9/PQAJpAPq4u1pTwAAAABJRU5ErkJggg==', 'base64');
const langOf = (info: TestInfo): Lang => (String(info.project.use.locale || '').startsWith('it') ? 'it' : 'en');
let L: Lang = 'it';
const tr = (k: Key, v?: Record<string, string | number>) => translate(L, k, v);
const head = (k: Key) => translate(L, k).split('{')[0];

test.beforeEach(({}, info) => {
  L = langOf(info);
});

/** Prezzi (in centesimi, non foil) solo per quattro carte: tutte le altre senza prezzo. */
const PRICED: Record<string, number> = { Brainstorm: 50, Ponder: 80, 'Lightning Bolt': 120, Counterspell: 300 };

function syntheticPrices(): string {
  const data = resolve(HERE, '../../data');
  const cards = JSON.parse(readFileSync(resolve(data, 'cards.json'), 'utf-8')) as { c: { n: string }[] };
  const prints = JSON.parse(readFileSync(resolve(data, 'printings.json'), 'utf-8')) as { p: unknown[][] };
  const p = prints.p.map((list, i) => list.flatMap(() => [PRICED[cards.c[i].n] || 0, 0]));
  return JSON.stringify({ v: 1, date: '2026-10-07', p });
}

async function setup(page: Page, hash = ''): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|reviews\/index\.json|404/.test(m.text())) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(String(e)));
  await page.route('https://cards.scryfall.io/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.addInitScript(() => localStorage.setItem('pauper-index:welcomeClosed', '1'));
  await page.goto('./' + hash);
  await expect(page.locator('#dataline')).toContainText(head('data.line'));
  return problems;
}

const names = (page: Page) => page.locator('#cardRows .nm').allTextContents();
const shares = async (page: Page) => (await page.locator('#cardRows .c-pct').allTextContents()).map((s) => parseFloat(s.replace(',', '.')));

test('pagina principale: prezzo crescente e decrescente, senza prezzo in fondo, scelta ritrovata dopo il ricaricamento', async ({ page }) => {
  await page.route('**/data/prices.json', (r) => r.fulfill({ contentType: 'application/json', body: syntheticPrices() }));
  const problems = await setup(page);
  await expect(page.locator('#cardRows .cardbtn')).toHaveCount(10);
  const byShare = await names(page);
  await page.selectOption('#sort', 'priceAsc');
  await expect.poll(async () => (await names(page)).slice(0, 4)).toEqual(['Brainstorm', 'Ponder', 'Lightning Bolt', 'Counterspell']);
  // colonna Prezzo: senza collezione la stampa più economica ("da X €"); poi le carte senza prezzo, dalle più giocate
  const prices = await page.locator('#cardRows .c-price').allTextContents();
  expect(prices[0]).toContain(head('price.from'));
  expect(prices.slice(4)).toEqual(Array(prices.length - 4).fill('—'));
  expect((await names(page)).slice(4)).toEqual(byShare.filter((n) => !(n in PRICED)).slice(0, prices.length - 4));
  await page.selectOption('#sort', 'priceDesc');
  await expect.poll(async () => (await names(page)).slice(0, 4)).toEqual(['Counterspell', 'Lightning Bolt', 'Ponder', 'Brainstorm']);
  expect((await page.locator('#cardRows .c-price').allTextContents()).slice(4).every((p) => p === '—')).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('pauper-index:sort'))).toBe('priceDesc');
  await page.reload();
  await expect(page.locator('#sort')).toHaveValue('priceDesc');
  await expect.poll(async () => (await names(page)).slice(0, 4)).toEqual(['Counterspell', 'Lightning Bolt', 'Ponder', 'Brainstorm']);
  // il menu ha le due voci attive, senza la voce del motivo
  await expect(page.locator('#sort option.sort-na')).toHaveCount(0);
  await expect(page.locator('#sort option[value="priceAsc"]')).toHaveText(tr('sort.priceAsc'));
  await expect(page.locator('#sort option[value="priceDesc"]')).toBeEnabled();
  expect(problems).toEqual([]);
});

test('prices.json mancante: voci disattivate con il motivo, "Più giocate", scelta salvata intatta, nessun errore', async ({ page }) => {
  await page.route('**/data/prices.json', (r) => r.fulfill({ status: 404, body: '' }));
  await page.addInitScript(() => localStorage.setItem('pauper-index:sort', 'priceAsc'));
  const problems = await setup(page);
  // il motivo è una voce disattivata in fondo al menu
  await expect(page.locator('#sort option.sort-na')).toHaveText(tr('sort.priceNA'));
  await expect(page.locator('#sort option.sort-na')).toBeDisabled();
  await expect(page.locator('#sort')).toHaveValue('priceAsc');
  await expect(page.locator('#sort option[value="priceAsc"]')).toBeDisabled();
  await expect(page.locator('#sort option[value="priceDesc"]')).toBeDisabled();
  // l'elenco segue "Più giocate"
  const s = await shares(page);
  expect(s.length).toBeGreaterThan(1);
  expect(s).toEqual([...s].sort((a, b) => b - a));
  expect(await page.evaluate(() => localStorage.getItem('pauper-index:sort'))).toBe('priceAsc');
  // anche nella pagina delle preferite
  await page.evaluate(() => { location.hash = '#preferite'; });
  await expect(page.locator('#favSort option.sort-na')).toHaveText(tr('sort.priceNA'));
  await expect(page.locator('#favSort option[value="priceDesc"]')).toBeDisabled();
  expect(problems).toEqual([]);
});

test('prezzi trattenuti: prima "Più giocate", poi il riordino senza perdere il focus né le righe caricate', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/data/prices.json', async (route) => {
    await gate;
    await route.fulfill({ contentType: 'application/json', body: syntheticPrices() });
  });
  await page.addInitScript(() => localStorage.setItem('pauper-index:sort', 'priceAsc'));
  const problems = await setup(page);
  await expect(page.locator('#sort')).toHaveValue('priceAsc');
  const s = await shares(page);
  expect(s).toEqual([...s].sort((a, b) => b - a));
  await page.click('#more');
  const rows = await page.locator('#cardRows tr').count();
  expect(rows).toBeGreaterThan(10);
  const focused = page.locator('#cardRows .cardbtn').nth(10);
  await expect(focused).toBeFocused();
  const name = (await focused.locator('.nm').textContent())!;
  const prices = page.waitForResponse('**/data/prices.json');
  release();
  await prices;
  await expect.poll(async () => (await names(page)).slice(0, 4)).toEqual(['Brainstorm', 'Ponder', 'Lightning Bolt', 'Counterspell']);
  await expect(page.locator('#cardRows tr')).toHaveCount(rows);
  const now = page.locator('#cardRows .cardbtn:focus');
  await expect(now).toHaveCount(1);
  await expect(now.locator('.nm')).toHaveText(name);
  await expect(page.locator('#sheet')).toBeHidden();
  expect(problems).toEqual([]);
});

test('preferite: prezzo crescente e decrescente, mai giocate in fondo, scelta ritrovata dopo il ricaricamento', async ({ page }) => {
  await page.route('**/data/prices.json', (r) => r.fulfill({ contentType: 'application/json', body: syntheticPrices() }));
  await setup(page);
  // le preferite si aggiungono dalla scheda, come farebbe chi usa il sito
  for (const n of ['Black Lotus', 'Counterspell', 'Brainstorm', 'Gush']) {
    await page.fill('#search', n);
    await page.locator('#search').press('Enter');
    await expect(page.locator('#sheetTitle')).toContainText(n);
    await page.locator('#sheet .favbtn').click();
    await expect(page.locator('#sheet .favbtn')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
  }
  await page.evaluate(() => { location.hash = '#preferite'; });
  const favNames = () => page.locator('#favList .nm').allTextContents();
  await expect.poll(favNames).toHaveLength(4);
  await page.selectOption('#favSort', 'priceAsc');
  // Gush (giocata, senza prezzo) e Black Lotus (mai giocata) in fondo, la più giocata prima
  await expect.poll(favNames).toEqual(['Brainstorm', 'Counterspell', 'Gush', 'Black Lotus']);
  await page.selectOption('#favSort', 'priceDesc');
  await expect.poll(favNames).toEqual(['Counterspell', 'Brainstorm', 'Gush', 'Black Lotus']);
  expect(await page.evaluate(() => localStorage.getItem('pauper-index:favSort'))).toBe('priceDesc');
  await page.reload();
  await expect(page.locator('#viewFav')).toBeVisible();
  await expect(page.locator('#favSort')).toHaveValue('priceDesc');
  await expect.poll(favNames).toEqual(['Counterspell', 'Brainstorm', 'Gush', 'Black Lotus']);
});

test('intestazioni dei risultati: le voci del prezzo non cambiano l\'altezza, anche con un carattere largo e senza prezzi', async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop-it' && info.project.name !== 'desktop-en', 'larghezze impostate dal test');
  test.setTimeout(120_000); // 64 misure: con tutta la suite in parallelo i 30 secondi non bastano
  for (const prices of ['ok', 'none']) {
    const ctx = await browser.newContext({ ...info.project.use, baseURL, viewport: { width: 1280, height: 860 }, bypassCSP: true });
    const page = await ctx.newPage();
    await page.route('**/data/prices.json', (r) => (prices === 'ok'
      ? r.fulfill({ contentType: 'application/json', body: syntheticPrices() }) : r.fulfill({ status: 404, body: '' })));
    await setup(page);
    await expect(page.locator('#sort option.sort-na')).toHaveCount(prices === 'ok' ? 0 : 1);
    // una preferita, perché il menu delle preferite compare solo se ce n'è almeno una
    await page.fill('#search', 'Counterspell');
    await page.locator('#search').press('Enter');
    await page.locator('#sheet .favbtn').click();
    await page.keyboard.press('Escape');
    await page.fill('#search', '');
    // caratteri dei telefoni e di Windows (Arial, Liberation Sans in CI) e un carattere largo (DejaVu Sans, Verdana)
    const font = await page.addStyleTag({ content: '/* carattere */' });
    for (const [face, [hash, head, sel]] of ['Arial, "Liberation Sans"', '"DejaVu Sans", Verdana'].flatMap((f) =>
      [['', '#results .res-head', '#sort'], ['#preferite', '#viewFav .res-head', '#favSort']].map((v) => [f, v] as const))) {
      await font.evaluate((el, f) => { el.textContent = `body, body *:not(.brand) { font-family: ${f}, sans-serif !important; }`; }, face);
      await page.evaluate((h) => { location.hash = h; }, hash);
      await expect(page.locator(sel)).toBeVisible();
      for (const w of [375, 761, 860, 961, 1000, 1100, 1280, 1440]) {
        await page.setViewportSize({ width: w, height: 860 });
        // altezza con le voci del prezzo e com'era prima della funzione: senza quelle voci e, nelle preferite, con la base
        // di 420 px del blocco di sinistra (ridotta a 400 px per compensare il menu più largo)
        const [withPrice, without] = await page.evaluate(([head, sel]) => {
          const left = document.querySelector<HTMLElement>(`${head} > div:first-child`)!;
          const extra = [...document.querySelectorAll<HTMLOptionElement>(`${sel} option[value^="price"], ${sel} option.sort-na`)];
          const parent = document.querySelector(sel)!;
          const value = (parent as HTMLSelectElement).value;
          const hgt = () => Math.round(document.querySelector(head)!.getBoundingClientRect().height);
          const a = hgt();
          extra.forEach((o) => o.remove());
          if (sel === '#favSort') left.style.flexBasis = '420px';
          const b = hgt();
          left.style.flexBasis = '';
          parent.append(...extra);
          (parent as HTMLSelectElement).value = value;
          return [a, b];
        }, [head, sel]);
        expect(withPrice, `${sel} ${w}px ${face} ${prices}`).toBeLessThanOrEqual(without);
        if (sel === '#sort') expect(withPrice, `${sel} ${w}px ${face} ${prices}`).toBe(without);
      }
    }
    await ctx.close();
  }
});
