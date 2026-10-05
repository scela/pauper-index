import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fmtDate, translate, type Key, type Lang } from '../src/i18n';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(HERE, '../tests/fixtures');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P9/PQAJpAPq4u1pTwAAAABJRU5ErkJggg==', 'base64');
const FCP = 'Pauper Index is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.';

// Lingua del progetto (locale del browser): i testi attesi vengono dagli stessi dizionari dell'app.
const langOf = (info: TestInfo): Lang => (String(info.project.use.locale || '').startsWith('it') ? 'it' : 'en');
let L: Lang = 'it';
const tr = (k: Key, v?: Record<string, string | number>) => translate(L, k, v);
/** Parte fissa iniziale di un testo con segnaposto (prima del primo {…}). */
const head = (k: Key, lang: Lang = L) => translate(lang, k).split('{')[0];

test.beforeEach(({}, info) => {
  L = langOf(info);
});

async function setup(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|reviews\/index\.json|404/.test(m.text())) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(String(e)));
  // niente richieste vere al CDN di Scryfall durante i test
  await page.route('https://cards.scryfall.io/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.goto('./');
  await expect(page.locator('#dataline')).toContainText(head('data.line'));
  return problems;
}

async function uploadCollection(page: Page): Promise<void> {
  await page.setInputFiles('#files', resolve(FIX, 'collezione-sintetica.csv'));
  await expect(page.locator('#loaded')).toContainText(tr('load.collection').trim());
}

test('lingua del browser, testi statici, area di caricamento, filtri e lista, con CSP', async ({ page }) => {
  const problems = await setup(page);
  await expect(page.locator('html')).toHaveAttribute('lang', L);
  await expect(page.locator(`[data-lang="${L}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('Pauper Index');
  await expect(page).toHaveTitle('Pauper Index');
  await expect(page.locator('#navAbout')).toHaveText(tr('nav.about'));
  await expect(page.locator('#drop strong')).toHaveText(tr('load.dropTitle'));
  await expect(page.locator('#search')).toHaveAttribute('placeholder', tr('filters.search'));
  await expect(page.locator('#loadArea')).toBeVisible();
  await expect(page.locator('#loaded')).toBeHidden();
  await expect(page.locator('#period option')).toHaveCount(4);
  await expect(page.locator('#period')).toHaveValue('1');
  await expect(page.locator('#period option').first()).toContainText(tr('period.0'));
  const n = Number((await page.locator('#verdict').innerText()).replace(/[.,]/g, '').match(/\d+/)?.[0]);
  await expect(page.locator('#verdict')).toHaveText(tr('res.list', { n }));
  await expect(page.locator('#cardRows tr')).toHaveCount(100);
  await expect(page.locator('#more')).toContainText(head('res.more'));
  await expect(page.locator('#extraColl')).toBeHidden();
  await expect(page.locator('.box, .tick, #assign, #optBasics')).toHaveCount(0);
  // date nella lingua scelta (data di data/meta.json)
  const meta = JSON.parse(readFileSync(resolve(HERE, '../../data/meta.json'), 'utf-8'));
  await expect(page.locator('#dataline')).toContainText(fmtDate(meta.last_tournament, L));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
});

test('selettore IT/EN: cambia tutti i testi e la scelta resta dopo il ricaricamento', async ({ page }) => {
  await setup(page);
  const other: Lang = L === 'it' ? 'en' : 'it';
  await page.click(`[data-lang="${other}"]`);
  await expect(page.locator('html')).toHaveAttribute('lang', other);
  await expect(page.locator('#navAbout')).toHaveText(translate(other, 'nav.about'));
  await expect(page.locator('#drop strong')).toHaveText(translate(other, 'load.dropTitle'));
  await expect(page.locator('#period option').first()).toContainText(translate(other, 'period.0'));
  await expect(page.locator('#dataline')).toContainText(head('data.line', other));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', other);
  await expect(page.locator(`[data-lang="${other}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('footer')).toContainText(translate(other, 'foot.line'));
});

test('i filtri aggiornano subito i risultati; terre base sempre escluse', async ({ page }) => {
  await setup(page);
  await page.selectOption('#period', '0');
  await expect(page.locator('#sub')).toContainText(tr('periodDesc.0'));
  const before = await page.locator('#verdict').innerText();
  await page.fill('#optMin', '500');
  await expect(page.locator('#verdict')).not.toHaveText(before);
  await page.fill('#optMin', '1');
  await page.selectOption('#period', '3');
  for (const q of ['island', 'snow-covered', 'wastes']) {
    await page.fill('#search', q);
    const names = await page.locator('#cardRows .nm').allInnerTexts();
    expect(names.filter((x) => /^(Plains|Island|Swamp|Mountain|Forest|Wastes|Snow-Covered .+)$/.test(x))).toEqual([]);
  }
  await page.fill('#search', 'zzzz-nessuna');
  await expect(page.locator('#cardRows')).toContainText(tr('res.noMatch'));
});

test('CSV ManaBox: riga compatta, solo possedute, mancanti, Binder inclusi, export', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const problems = await setup(page);
  await uploadCollection(page);
  await expect(page.locator('#loadArea')).toBeHidden();
  await expect(page.locator('#loaded')).toContainText(tr('load.replace'));
  await expect(page.locator('#loaded')).toContainText(tr('load.cards', { n: 15 }));
  const owned = Number((await page.locator('#verdict').innerText()).match(/\d+/)?.[0]);
  await expect(page.locator('#verdict')).toHaveText(tr('res.owned', { n: owned }));

  // di default solo le possedute, ordinate dalle più giocate
  const rows = (await page.locator('#cardRows tr').allInnerTexts()).join('\n');
  expect(rows).not.toContain(tr('badge.missing'));
  expect(rows).not.toContain('Kor Skyfisher'); // nel mazzo: escluso
  await page.fill('#search', 'brainstorm');
  await expect(page.locator('#cardRows tr').first().locator('.c-qty')).toContainText('5');
  await expect(page.locator('#cardRows tr').first().locator('img.thumb.owned')).toHaveCount(2);
  await page.fill('#search', '');

  // gruppi inclusi, in fondo
  await expect(page.locator('#grpSummary')).toHaveText(tr('grp.summary', { inc: 2, total: 4 }));
  await page.locator('#grpSummary').click();
  await expect(page.locator('#groupRows input[value="skip"]:checked')).toHaveCount(2);
  await expect(page.locator('#groupRows')).toContainText(tr('grp.exclude'));
  await expect(page.locator('#optProxyWrap')).toBeVisible();
  await page.fill('#search', 'tolarian terror');
  await expect(page.locator('#cardRows')).toContainText(tr('res.noMatch')); // con la ricerca attiva
  await page.locator('#optProxyWrap').click();
  await expect(page.locator('#cardRows tr').first()).toContainText('Tolarian Terror');

  // mostra anche le mancanti
  await page.fill('#search', 'kor skyfisher');
  await expect(page.locator('#cardRows')).toContainText(tr('res.noMatch')); // con la ricerca attiva
  await page.locator('label:has(#optMissing)').click();
  await expect(page.locator('#cardRows tr').first()).toContainText(tr('badge.missing'));

  // riepilogo dell'importazione
  await expect(page.locator('#impSummary')).toHaveText(tr('imp.summary', { rows: tr('imp.rows', { n: 10 }), unrec: 0 }));
  await page.locator('#impSummary').click();
  await expect(page.locator('#importSummary')).toContainText(tr('imp.notInList', { n: 1 }));

  // export, con nomi di file nella lingua
  await page.locator('#expDetails summary').click();
  await page.click('[data-copy="owned"]');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('1 Brainstorm');
  const dl = page.waitForEvent('download');
  await page.click('[data-save="csv"]');
  const file = await dl;
  expect(file.suggestedFilename()).toBe(tr('export.fileCsv'));
  const csv = readFileSync(await file.path(), 'utf-8');
  expect(csv.split('\r\n')[0]).toBe('Name,Set code,Collector number,Foil,Language,Scryfall ID,Quantity');
  expect(csv).toContain('Brainstorm,ICE,61,normal,en,8d42d7aa-7f53-4cfc-842a-086aab2448d1,1');
  expect(problems).toEqual([]);
});

test('Sostituisci e testo incollato: riepilogo nella lingua scelta', async ({ page }) => {
  await setup(page);
  await uploadCollection(page);
  await page.click('#replace');
  await expect(page.locator('#loadArea')).toBeVisible();
  await page.fill('#pasteText', readFileSync(resolve(FIX, 'testo-sintetico.txt'), 'utf-8'));
  await page.click('#pasteAdd');
  await expect(page.locator('#loadArea')).toBeHidden();
  await expect(page.locator('#grpSummary')).toHaveText(tr('grp.summary', { inc: 1, total: 1 }));
  await page.locator('#impSummary').click();
  const sum = page.locator('#importSummary');
  await expect(sum).toContainText(tr('group.pasted'));
  await expect(sum).toContainText(tr('imp.textNote'));
  await expect(sum).toContainText(tr('imp.unrec', { n: 1 }));
  await sum.locator('summary').click();
  await expect(sum).toContainText('Carta Che Non Esiste');
  await page.fill('#search', 'fire // ice');
  await expect(page.locator('#cardRows tr').first()).toContainText(`MH2 #290 ${tr('print.foil')}`);
});

test('errori nella lingua scelta', async ({ page }) => {
  await setup(page);
  await page.click('#pasteAdd');
  await expect(page.locator('#errors')).toHaveText(tr('err.pasteEmpty'));
  await page.setInputFiles('#files', { name: 'strano.csv', mimeType: 'text/csv', buffer: Buffer.from('foo,bar\n1,2\n') });
  await expect(page.locator('#errors')).toHaveText(tr('err.noName', { file: 'strano.csv', headers: 'foo, bar' }));
});

test('scheda con ventaglio: tastiera, carta attiva visibile, Esc', async ({ page }) => {
  await setup(page);
  await uploadCollection(page);
  await page.fill('#search', 'brainstorm');
  const btn = page.locator('#cardRows .cardbtn').first();
  await btn.focus();
  await page.keyboard.press('Enter');
  const sheet = page.locator('#sheet');
  await expect(sheet).toBeVisible();
  expect(await sheet.locator('.fan-item').count()).toBeLessThanOrEqual(7);
  await expect(sheet.locator('.fan-item.owned').first()).toBeVisible();
  await expect(sheet.locator('.tag')).toHaveText(tr('sheet.yours'));
  await expect(sheet).toContainText(tr('sheet.lastMtgo').trim());
  await expect(sheet).toContainText(tr('sheet.artist'));
  const img = sheet.locator('.active-card img');
  await img.scrollIntoViewIfNeeded();
  const box = await img.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
  if (await sheet.locator('.fan-note button').count()) {
    await sheet.locator('.fan-note button').click();
    await expect(page.locator('#gridDialog')).toBeVisible();
    expect(await page.locator('#gridDialog figure').count()).toBeGreaterThan(7);
    await page.keyboard.press('Escape');
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  // il focus torna sulla riga ma la scheda resta chiusa
  await expect(btn).toBeFocused();
  await page.waitForTimeout(500);
  await expect(sheet).toBeHidden();
});

test('scheda chiusa con Esc dopo un clic: non si riapre sotto il cursore', async ({ page, isMobile }) => {
  test.skip(isMobile, 'solo con il mouse');
  await setup(page);
  await uploadCollection(page);
  await page.locator('#cardRows .cardbtn').first().click();
  const sheet = page.locator('#sheet');
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await page.waitForTimeout(700);
  await expect(sheet).toBeHidden();
  // uscendo e rientrando con il mouse la scheda si riapre
  await page.mouse.move(5, 5);
  await page.locator('#cardRows .cardbtn').first().hover();
  await expect(sheet).toBeVisible();
});

test('CSV malevolo: nessuno script eseguito, testo mostrato alla lettera', async ({ page }) => {
  await setup(page);
  await page.setInputFiles('#files', resolve(FIX, 'malevolo.csv'));
  await expect(page.locator('#loaded')).toBeVisible();
  await page.locator('#grpSummary').click();
  await expect(page.locator('#groupRows')).toContainText('<script>window.__xss=1</script>');
  await page.locator('#impSummary').click();
  await page.locator('#importSummary summary').click();
  await expect(page.locator('#importSummary')).toContainText('<img src=x onerror="window.__xss=1">');
  await page.mouse.move(10, 10);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(await page.locator('#groupRows img, #groupRows script, #importSummary img').count()).toBe(0);
});

test('Informazioni: avviso Fan Content Policy ufficiale in inglese, traduzione solo in italiano', async ({ page }) => {
  await setup(page);
  await expect(page.locator('footer p')).toHaveCount(1);
  await expect(page.locator('footer')).toContainText(tr('foot.line'));
  await page.locator('footer a[href="#informazioni"]').focus();
  await page.keyboard.press('Enter');
  const about = page.locator('#viewAbout');
  await expect(page.locator('#fcp')).toHaveText(FCP);
  await expect(page.locator('#fcp')).toHaveAttribute('lang', 'en');
  if (L === 'it') await expect(about).toContainText(tr('about.notice.translation'));
  else await expect(about).not.toContainText('In italiano');
  await expect(about).toContainText(tr('about.privacy.1'));
  await expect(about).toContainText(tr('about.limits.2'));
  await expect(about).toContainText(tr('about.how.6'));
  await expect(about.locator('a[href^="mailto:massadalbe@hotmail.com"]')).toHaveCount(1);
  await page.click('#viewAbout a[href="#"]');
  await expect(page.locator('#viewMain')).toBeVisible();
});

test('persistenza e "Cancella i miei dati"', async ({ page }) => {
  await setup(page);
  await uploadCollection(page);
  await page.waitForTimeout(400); // salvataggio differito
  await page.reload();
  await expect(page.locator('#loaded')).toBeVisible();
  await page.click('#clearData');
  await expect(page.locator('#clearData')).toHaveText(tr('clear.confirm'));
  await page.click('#clearData');
  await expect(page.locator('#loadArea')).toBeVisible();
  await page.reload();
  await expect(page.locator('#dataline')).toContainText(head('data.line'));
  await expect(page.locator('#loaded')).toBeHidden();
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('pauper-index:')));
  expect(keys).toEqual([]);
});

test('Novità: mostra le revisioni dall\'indice pubblico', async ({ page }) => {
  await page.route('**/data/reviews/index.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify([{
    set: 'hob', nome: 'The Hobbit', uscita: '2026-08-14', data: '2026-10-13', sommario: '21 carte del set nella lista; 0 entrate; 0 uscite.',
    nuove: [["Giant's Boulder", 638, 1.94]], entrate: [], uscite: [], legalita: [['Some Card', 'l', 'b']],
  }]) }));
  await setup(page);
  await page.locator('#newsDetails > summary').click();
  const rev = page.locator('#news details.review');
  await expect(rev).toHaveCount(1);
  await rev.locator('summary').click();
  await expect(rev).toContainText(tr('news.item', { name: 'The Hobbit', set: 'HOB', date: fmtDate('2026-10-13', L) }));
  await expect(rev).toContainText(tr('news.decks', { name: "Giant's Boulder", n: 638, pct: 1.94 }));
  await expect(rev).toContainText(`Some Card: ${tr('legal.l')} → ${tr('legal.b')}`);
});

test('controllo rapido: carta giocata senza collezione, tastiera', async ({ page }) => {
  await setup(page);
  const input = page.locator('#quickInput');
  await expect(page.locator('#quickLabel')).toHaveText(tr('quick.label'));
  await expect(input).toHaveAttribute('placeholder', tr('quick.placeholder'));
  await input.fill('brainst');
  const list = page.locator('#quickList');
  await expect(list).toBeVisible();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await expect(list.locator('[role="option"]').first()).toContainText('Brainstorm');
  await expect(list.locator('[role="option"]').first()).toHaveAttribute('aria-selected', 'true');
  await input.press('Enter');
  await expect(list).toBeHidden();
  await expect(input).toHaveValue('Brainstorm');
  const res = page.locator('#quickResult');
  await expect(res.locator('.qtitle')).toContainText('Brainstorm');
  await expect(res).toContainText(tr('quick.legal.l'));
  await expect(res).toContainText(tr('periodDesc.1'));
  await expect(res).toContainText(tr('sheet.lastMtgo').trim());
  await expect(res).toContainText(tr('quick.noCollection'));
  await expect(res.locator('.qimg img')).toHaveCount(1);
  // tutti gli artwork: apre la scheda
  await res.locator('.qres .btn').click();
  await expect(page.locator('#sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeHidden();
  // frecce ed Esc
  await input.fill('light');
  await expect(page.locator('#quickList [role="option"]').first()).toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowDown');
  await expect(page.locator('#quickList [role="option"]').nth(1)).toHaveAttribute('aria-selected', 'true');
  await input.press('Escape');
  await expect(page.locator('#quickList')).toBeHidden();
});

test('controllo rapido: carta mai giocata e nome esatto senza scegliere', async ({ page }) => {
  await setup(page);
  const input = page.locator('#quickInput');
  await input.click();
  await input.fill('black lot');
  const opt = page.locator('#quickList [role="option"]', { hasText: 'Black Lotus' });
  await expect(opt).toContainText(tr('quick.tagNever'));
  await opt.click();
  const res = page.locator('#quickResult');
  await expect(res.locator('.qtitle')).toContainText('Black Lotus');
  await expect(res).toContainText(tr('quick.never'));
  await expect(res).toContainText(tr('quick.legal.n'));
  await expect(res.locator('.qimg')).toHaveCount(0);
  // nome esatto: risultato già mentre si scrive
  await input.fill('Gush');
  await expect(res.locator('.qtitle')).toContainText('Gush');
  await expect(res).toContainText(tr('quick.legal.b'));
  await input.fill('zzqq');
  await expect(page.locator('#quickList')).toContainText(tr('quick.noResults'));
});

test('controllo rapido con la collezione: possesso anche per printing straniere e carte mai giocate', async ({ page }) => {
  await setup(page);
  await uploadCollection(page);
  const input = page.locator('#quickInput');
  const res = page.locator('#quickResult');
  await input.fill('Lightning Bolt');
  await expect(res).toContainText(tr('quick.owned', { n: 1 }));
  await expect(res).toContainText('LEA #161 it ×1');
  await expect(res.locator('.qres')).toHaveClass(/is-owned/);
  await input.fill('Kor Skyfisher'); // solo nel mazzo, che è escluso
  await expect(res).toContainText(tr('quick.notOwned'));
  await input.click();
  await input.fill('black lotu');
  await page.locator('#quickList [role="option"]', { hasText: 'Black Lotus' }).click();
  await expect(res).toContainText(tr('quick.never'));
  await expect(res).toContainText(tr('quick.owned', { n: 1 }));
  // cambio di periodo: il risultato si aggiorna
  await input.fill('Brainstorm');
  await page.selectOption('#period', '0');
  await expect(res).toContainText(tr('periodDesc.0'));
});
