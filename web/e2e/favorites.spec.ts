import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { translate, type Key, type Lang } from '../src/i18n';

// Preferite: cuore nella scheda (anche delle carte mai giocate), nelle righe su desktop, nella Carta dimenticata e nei
// Debutti; segno ♥ sulle righe su mobile e nelle decklist; pagina #preferite; filtro "Solo preferite"; export e import.

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(HERE, '../tests/fixtures');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P9/PQAJpAPq4u1pTwAAAABJRU5ErkJggg==', 'base64');
const langOf = (info: TestInfo): Lang => (String(info.project.use.locale || '').startsWith('it') ? 'it' : 'en');
let L: Lang = 'it';
const tr = (k: Key, v?: Record<string, string | number>) => translate(L, k, v);
const head = (k: Key) => translate(L, k).split('{')[0];

test.beforeEach(({}, info) => {
  L = langOf(info);
});

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

/** Scheda dal campo "Cerca una carta" (nome esatto + Invio), cuore premuto, scheda chiusa. */
async function favFromSearch(page: Page, name: string): Promise<void> {
  await page.fill('#search', name);
  await page.locator('#search').press('Enter');
  await expect(page.locator('#sheetTitle')).toContainText(name);
  const heart = page.locator('#sheet .favbtn');
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await page.fill('#search', '');
  await page.locator('#search').press('Escape');
}

async function openFavs(page: Page): Promise<void> {
  await page.evaluate(() => { location.hash = '#preferite'; });
  await expect(page.locator('#viewFav')).toBeVisible();
}

test('preferite: nome accessibile della riga con il segno ♥, aggiornato senza ridisegnare la riga e già giusto dopo il ricaricamento', async ({ page }) => {
  await setup(page);
  const first = page.locator('#cardRows tr').first();
  const name = (await first.locator('.nm').innerText()).trim();
  const btn = first.locator('.cardbtn');
  await expect(btn).toHaveAccessibleName(tr('card.open', { name }));
  await btn.evaluate((el) => { el.dataset.same = '1'; }); // la stessa riga, non ridisegnata
  await btn.click();
  await page.locator('#sheet .favbtn').click();
  await page.keyboard.press('Escape');
  await expect(btn).toHaveAccessibleName(tr('card.openFav', { name }));
  await expect(btn).toHaveAttribute('data-same', '1');
  // ricaricata: la riga nasce con il nome giusto
  await page.reload();
  await expect(page.locator('#cardRows tr').first().locator('.cardbtn')).toHaveAccessibleName(tr('card.openFav', { name }));
  // tolta: torna il nome di prima, sempre senza ridisegnare
  await btn.evaluate((el) => { el.dataset.same = '2'; });
  await btn.click();
  await page.locator('#sheet .favbtn').click();
  await page.keyboard.press('Escape');
  await expect(btn).toHaveAccessibleName(tr('card.open', { name }));
  await expect(btn).toHaveAttribute('data-same', '2');
});

test('preferite: cuore nella scheda (anche di una carta mai giocata), salvate nel browser, pagina con possesso e prezzi', async ({ page, isMobile }) => {
  const problems = await setup(page);
  const first = page.locator('#cardRows tr').first();
  const name = (await first.locator('.nm').innerText()).trim();
  await first.locator('.cardbtn').click();
  const heart = page.locator('#sheet .favbtn');
  await expect(heart).toHaveAccessibleName(tr('fav.btn', { name }));
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
  const hb = (await heart.boundingBox())!;
  expect(Math.min(hb.width, hb.height)).toBeGreaterThanOrEqual(44);
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  // la prima volta: dove si ritrovano
  await expect(page.locator('#sheet .favnote')).toContainText(tr('fav.addedNote'));
  await expect(page.locator('#sheet .favnote a')).toHaveAttribute('href', '#preferite');
  await page.keyboard.press('Escape');
  // nella riga: su mobile solo il segno accanto al nome (nel nome accessibile), su desktop il cuore premuto
  if (isMobile) {
    await expect(first.locator('.favmark')).toBeVisible();
    await expect(first.locator('.row-fav')).toBeHidden();
    await expect(first.locator('.cardbtn')).toHaveAccessibleName(tr('card.openFav', { name }));
  } else {
    await expect(first.locator('.row-fav')).toHaveAttribute('aria-pressed', 'true');
    await expect(first.locator('.favmark')).toBeHidden();
  }
  // carta mai giocata in Pauper: scheda ridotta, stesso cuore
  await favFromSearch(page, 'Black Lotus');
  // salvate nel browser: dopo il ricaricamento
  await page.reload();
  await expect(page.locator('#dataline')).toContainText(head('data.line'));
  await page.locator('#cardRows tr').first().locator('.cardbtn').click();
  await expect(page.locator('#sheet .favbtn')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  // pagina: dalla più recente, la mai giocata senza prezzo
  await openFavs(page);
  await expect(page.locator('#favVerdict')).toHaveText(tr('fav.count', { n: 2 }));
  const rows = page.locator('#favList .favrow');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Black Lotus');
  await expect(rows.nth(0)).toContainText(tr('quick.never'));
  await expect(rows.nth(0).locator('.fline2')).toHaveText('—');
  await expect(rows.nth(1)).toContainText(name);
  await expect(rows.nth(1).locator('.fline')).toContainText('%');
  await expect(rows.nth(1).locator('.fline2')).toHaveText(/€|—/);
  // la riga apre la scheda; anche quella della carta mai giocata
  await rows.nth(0).locator('.fav-card').click();
  await expect(page.locator('#sheetTitle')).toContainText('Black Lotus');
  await expect(page.locator('#sheet')).toContainText(tr('quick.never'));
  await page.keyboard.press('Escape');
  // con la collezione: possesso e "ne possiedi"
  await page.evaluate(() => { location.hash = ''; });
  await page.setInputFiles('#files', resolve(FIX, 'collezione-sintetica.csv'));
  await expect(page.locator('#loaded')).toBeVisible();
  await favFromSearch(page, 'Brainstorm');
  await openFavs(page);
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText(tr('row.owned', { n: 5 }));
  // Black Lotus è nella collezione sintetica: possesso per nome anche per le carte mai giocate
  await expect(rows.nth(1)).toContainText(tr('row.owned', { n: 1 }));
  const ownedFirst = await rows.nth(2).innerText();
  await expect(page.locator('#favSub')).toContainText(tr('fav.ownedN', { n: ownedFirst.includes(head('row.owned')) ? 3 : 2 }));
  expect(problems).toEqual([]);
});

test('preferite: "Rimuovi collezione" non le tocca, "Cancella i miei dati" le cancella', async ({ page }) => {
  await setup(page);
  await favFromSearch(page, 'Counterspell');
  await page.setInputFiles('#files', resolve(FIX, 'collezione-sintetica.csv'));
  await expect(page.locator('#loaded')).toBeVisible();
  await page.locator('#removeColl').click();
  await expect(page.locator('#undoRemove')).toBeVisible();
  // la rimozione diventa definitiva quando non si può più annullare (8 secondi)
  await expect(page.locator('#undoBar')).toBeHidden({ timeout: 12_000 });
  // e il salvataggio (con un breve ritardo) ha scritto la collezione vuota
  await expect.poll(() => page.evaluate(() => new Promise<number>((ok) => {
    const req = indexedDB.open('pauper-index');
    req.onsuccess = () => {
      const get = req.result.transaction('kv').objectStore('kv').get('state');
      get.onsuccess = () => ok((get.result?.groups || []).length);
    };
  }))).toBe(0);
  await page.reload();
  await expect(page.locator('#dataline')).toContainText(head('data.line'));
  await expect(page.locator('#loaded')).toBeHidden();
  await openFavs(page);
  await expect(page.locator('#favList .favrow')).toHaveCount(1);
  await page.evaluate(() => { location.hash = ''; });
  await page.click('#clearData');
  await page.click('#clearData');
  await expect(page.locator('#toast')).toHaveText(tr('clear.done'));
  await openFavs(page);
  await expect(page.locator('#favList .favrow')).toHaveCount(0);
  await expect(page.locator('#favEmpty')).toBeVisible();
  await page.reload();
  await expect(page.locator('#dataline')).toContainText(head('data.line'));
  await expect(page.locator('#favEmpty')).toBeVisible();
});

test('preferite: export "1 Nome" e import su un browser vuoto (nomi italiani, con e senza numero, doppioni, non riconosciute): unisce', async ({ page, context, browser }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setup(page);
  await favFromSearch(page, 'Lightning Bolt');
  await favFromSearch(page, 'Black Lotus');
  await openFavs(page);
  await page.locator('#favExport summary').click();
  await page.click('#favCopy');
  await expect(page.locator('#toast')).toHaveText(tr('export.copied', { what: tr('fav.what') }));
  const text = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
  expect(text).toBe('1 Black Lotus\n1 Lightning Bolt\n');
  const dl = page.waitForEvent('download');
  await page.click('#favSave');
  const file = await dl;
  expect(file.suggestedFilename()).toBe(tr('fav.file'));
  expect(readFileSync((await file.path())!, 'utf-8')).toBe(text);

  // un altro dispositivo: browser vuoto
  const ctx2 = await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL });
  const p2 = await ctx2.newPage();
  await setup(p2, '#preferite');
  await expect(p2.locator('#favEmpty')).toBeVisible();
  await p2.locator('#favImport summary').click();
  await p2.fill('#favText', `${text}Contromagia\n4 Counterspell\nCarta Inventata\n\nSideboard\n2 Fulmine\n`);
  await p2.click('#favImportBtn');
  const res = p2.locator('#favImportResult');
  await expect(res).toContainText(translate(L, 'fav.imported', { n: 3 }));
  await expect(res).toContainText(translate(L, 'fav.dups', { n: 2 }));
  await expect(res).toContainText(translate(L, 'fav.unknown', { n: 1 }));
  await res.locator('summary').click();
  await expect(res.locator('li')).toHaveText(['Carta Inventata']);
  await expect(p2.locator('#favList .nm')).toHaveText(['Black Lotus', 'Lightning Bolt', 'Counterspell']);
  // un secondo import unisce: le già presenti restano, nessuna sostituzione
  await p2.setInputFiles('#favFile', { name: 'lista.txt', mimeType: 'text/plain', buffer: Buffer.from('1 Lightning Bolt\nPonder\n') });
  await expect(res).toContainText(translate(L, 'fav.imported', { n: 1 }));
  await expect(res).toContainText(translate(L, 'fav.already', { n: 1 }));
  await expect(p2.locator('#favList .favrow')).toHaveCount(4);
  await ctx2.close();
});

test('preferite: togliere nella pagina e "Svuota le preferite", con Annulla', async ({ page }) => {
  await setup(page);
  await favFromSearch(page, 'Counterspell');
  await favFromSearch(page, 'Ponder');
  await openFavs(page);
  const rows = page.locator('#favList .favrow');
  await expect(rows).toHaveCount(2);
  await rows.nth(0).locator('.favbtn').click();
  await expect(rows).toHaveCount(1);
  await expect(page.locator('#favUndo')).toContainText(tr('fav.removed', { name: 'Ponder' }));
  await expect(page.locator('#favUndoBtn')).toBeFocused();
  await page.click('#favUndoBtn');
  await expect(page.locator('#favList .nm')).toHaveText(['Ponder', 'Counterspell']);
  await page.click('#favClear');
  await expect(rows).toHaveCount(0);
  await expect(page.locator('#favUndo')).toContainText(tr('fav.cleared'));
  await page.click('#favUndoBtn');
  await expect(page.locator('#favList .nm')).toHaveText(['Ponder', 'Counterspell']);
  await page.reload();
  await expect(page.locator('#dataline')).toContainText(head('data.line'));
  await expect(rows).toHaveCount(2);
});

test('preferite: filtro "Solo preferite" con etichetta e nota, mai salvato; accesso dalla barra (desktop) e dal menu "⋯" (mobile)', async ({ page, isMobile }) => {
  const problems = await setup(page);
  await page.click('#filtersBtn');
  await expect(page.locator('#fpFav')).toBeDisabled();
  await expect(page.locator('#fpFavNone')).toBeVisible();
  await page.click('#fpDone');
  const name = (await page.locator('#cardRows .nm').nth(1).innerText()).trim();
  await favFromSearch(page, name);
  await page.click('#filtersBtn');
  await expect(page.locator('#fpFavNone')).toBeHidden();
  await page.click('#fpFav');
  await expect(page.locator('#fpFav')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#fpDone');
  await expect(page.locator('#cardRows tr')).toHaveCount(1);
  await expect(page.locator('#cardRows .nm')).toHaveText(name);
  await expect(page.locator('#activeFilters')).toContainText(tr('chip.fav'));
  await expect(page.locator('#filterNote')).toContainText(tr('why.fav'));
  await expect(page.locator('#filtersBtnText')).toHaveText(tr('filters.moreN', { n: 1 }));
  // mai salvato
  await page.reload();
  await expect(page.locator('#dataline')).toContainText(head('data.line'));
  await expect(page.locator('#cardRows tr')).toHaveCount(10);
  await expect(page.locator('#activeFilters')).toBeHidden();
  // il link nel pannello porta alla pagina e chiude il pannello
  await page.click('#filtersBtn');
  await page.click('#fpFavLink');
  await expect(page.locator('#viewFav')).toBeVisible();
  await expect(page.locator('#fpanel')).not.toHaveAttribute('open', '');
  await page.evaluate(() => { location.hash = ''; });
  if (isMobile) {
    await expect(page.locator('#favBar')).toBeHidden();
    await page.click('#navMore');
    await expect(page.locator('#navFav')).toHaveText(`${tr('nav.fav')} (1)`);
    await page.click('#navFav');
  } else {
    await expect(page.locator('#navFav')).toBeHidden();
    await expect(page.locator('#favBar')).toHaveText(`${tr('nav.fav')} (1)`);
    await page.click('#favBar');
  }
  await expect(page.locator('#viewFav')).toBeVisible();
  await expect(page.locator('#navFav')).toHaveAttribute('aria-current', 'page');
  expect(problems).toEqual([]);
});

test('preferite: Carta dimenticata, Debutti e decklist, senza altezza in più (anche nelle righe dell\'elenco)', async ({ page, isMobile }) => {
  await setup(page);
  // righe dell'elenco: con il segno la riga ha la stessa altezza
  const row = page.locator('#cardRows tr').first();
  const h0 = (await row.boundingBox())!.height;
  await row.locator('.cardbtn').click();
  await page.locator('#sheet .favbtn').click();
  await page.keyboard.press('Escape');
  await expect(isMobile ? row.locator('.favmark') : row.locator('.row-fav[aria-pressed="true"]')).toBeVisible();
  expect((await row.boundingBox())!.height).toBe(h0);
  // Carta dimenticata: cuore accanto al titolo della carta pescata
  await page.click('#navDust');
  await page.click('#dustBtn');
  const dh = page.locator('.dust-titlerow .favbtn');
  await expect(dh).toBeVisible();
  await expect(dh).toHaveAccessibleName(tr('fav.btn', { name: (await page.locator('#dustTitle').innerText()).trim() }));
  await dh.click();
  await expect(dh).toHaveAttribute('aria-pressed', 'true');
  // Debutti: il cuore sulla riga di "Analisi", dentro la scheda, senza renderla più alta
  await page.click('#navDebuts');
  const card = page.locator('.deb-card').first();
  await expect(card).toBeVisible();
  const dfav = card.locator('.deb-fav');
  const cb = (await card.boundingBox())!;
  const fb = (await dfav.boundingBox())!;
  expect(fb.y + fb.height).toBeLessThanOrEqual(cb.y + cb.height);
  expect(Math.min(fb.width, fb.height)).toBeGreaterThanOrEqual(44);
  await dfav.evaluate((e) => { (e as HTMLElement).style.display = 'none'; });
  expect((await card.boundingBox())!.height).toBe(cb.height);
  await dfav.evaluate((e) => { (e as HTMLElement).style.display = ''; });
  await dfav.click();
  await expect(dfav).toHaveAttribute('aria-pressed', 'true');
  // decklist: il segno accanto al nome delle preferite, righe della stessa altezza
  const debName = (await card.locator('.deb-title').innerText()).trim();
  await page.click('#navDecks');
  await page.locator('.fam-card, .fam-row a').first().click();
  const dk = page.locator('#deckList .dk-list').first();
  await dk.locator('summary').click();
  const li = dk.locator('.dk-sec li').first();
  const liName = (await li.locator('.dk-card').innerText()).trim();
  const lh = (await li.boundingBox())!.height;
  await li.locator('.dk-card').click();
  await page.locator('#sheet .favbtn').click();
  await page.keyboard.press('Escape');
  await expect(li.locator('.favmark')).toBeVisible();
  expect((await li.boundingBox())!.height).toBe(lh);
  expect(liName.length).toBeGreaterThan(0);
  // tutte e quattro nella pagina
  await openFavs(page);
  await expect(page.locator('#favList .favrow')).toHaveCount(new Set([debName, liName]).size + 2);
});

test('barra dei filtri su una riga da 961 a 1440 px, anche con un carattere largo; "Preferite" sotto 961 px solo nel pannello', async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop-it' && info.project.name !== 'desktop-en', 'larghezze impostate dal test');
  // stessa misura della testata (CI rossa del 19/10 su 4e1b57c): in CI il carattere di sistema è DejaVu Sans, molto largo
  const ctx = await browser.newContext({ ...info.project.use, baseURL, viewport: { width: 1280, height: 860 }, bypassCSP: true });
  const page = await ctx.newPage();
  await setup(page);
  await favFromSearch(page, 'Counterspell'); // con il numero accanto, il caso più largo
  await page.addStyleTag({ content: 'body, body *:not(.brand) { font-family: "DejaVu Sans", Verdana, sans-serif !important; }' });
  for (const w of [961, 1000, 1024, 1100, 1199, 1200, 1280, 1440]) {
    await page.setViewportSize({ width: w, height: 860 });
    await expect(page.locator('#favBar'), `${w}px`).toBeVisible();
    const bar = (await page.locator('#filters').boundingBox())!;
    const fav = (await page.locator('#favBar').boundingBox())!;
    const per = (await page.locator('#period').boundingBox())!;
    expect(bar.height, `${w}px`).toBeLessThanOrEqual(60);
    expect(Math.abs(fav.y + fav.height / 2 - (per.y + per.height / 2)), `${w}px`).toBeLessThanOrEqual(4);
    expect(fav.x + fav.width, `${w}px`).toBeLessThanOrEqual(bar.x + bar.width + 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${w}px`).toBe(0);
  }
  await page.setViewportSize({ width: 960, height: 860 });
  await expect(page.locator('#favBar')).toBeHidden();
  await ctx.close();
});
