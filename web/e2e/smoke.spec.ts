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
  // nome del sito in New Rocker ridotto, servito dal sito (con la licenza); il resto della pagina nel font di sistema
  expect(await page.locator('h1 .brand').evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Pauper Index Title');
  expect(await page.locator('#verdict').evaluate((el) => getComputedStyle(el).fontFamily)).not.toContain('Pauper Index Title');
  expect(await page.evaluate(async () => (await document.fonts.load('400 40px "Pauper Index Title"', 'Pauper Index')).length)).toBe(1);
  expect((await page.request.get('fonts/OFL-NewRocker.txt')).ok()).toBe(true);
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
  await expect(page.locator('#cardRows tr')).toHaveCount(10);
  await expect(page.locator('#shownCount')).toHaveText(tr('res.shown', { n: 10, total: n.toLocaleString(L === 'it' ? 'it-IT' : 'en-US') }));
  await expect(page.locator('#more')).toHaveText(tr('res.loadMore'));
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

test('Informazioni: breve, FAQ chiuse, avviso Fan Content Policy ufficiale una sola volta, sintesi solo in italiano', async ({ page }) => {
  await setup(page);
  // due righe: avviso breve e donazioni (solo un link semplice, nessun widget)
  await expect(page.locator('footer p')).toHaveCount(2);
  await expect(page.locator('footer')).toContainText(tr('foot.line'));
  await expect(page.locator('footer .donate')).toHaveText(`${tr('donate.lead')} ${tr('donate.link')}`);
  await expect(page.locator('footer a[href="https://ko-fi.com/pauperindex"]')).toHaveText(tr('donate.link'));
  await page.locator('footer a[href="#informazioni"]').focus();
  await page.keyboard.press('Enter');
  const about = page.locator('#viewAbout');
  // testo ufficiale della Fan Content Policy: presente, identico, in inglese, una sola volta
  await expect(page.locator('#fcp')).toHaveText(FCP);
  await expect(page.locator('#fcp')).toHaveAttribute('lang', 'en');
  expect((await about.innerText()).split('Fan Content Policy').length - 1).toBe(1);
  if (L === 'it') await expect(about.locator('.legal')).toContainText(tr('about.legal.summary'));
  else await expect(about.locator('.legal p')).toHaveCount(3);
  await expect(about.locator('.legal')).toContainText(tr('about.legal.affiliation'));
  await expect(about.locator('.legal a[href="https://scryfall.com"]')).toHaveCount(1);
  await expect(about.locator('.legal a[href="https://github.com/Jiliac/MTGODecklistCache"]')).toHaveCount(1);
  // tre passi e i dati
  await expect(about.locator('.steps li')).toHaveCount(3);
  await expect(about.locator('.steps')).toContainText(tr('about.step1.title'));
  await expect(about).toContainText(head('about.data.text'));
  // domande frequenti chiuse di default; le risposte si aprono
  const faqs = about.locator('details.faq');
  await expect(faqs).toHaveCount(5);
  for (let i = 0; i < 5; i++) await expect(faqs.nth(i)).not.toHaveAttribute('open', '');
  await expect(about.getByText(tr('about.faq.precision.a'))).toBeHidden();
  await about.getByText(tr('about.faq.precision.q')).click();
  await expect(about.getByText(tr('about.faq.precision.a'))).toBeVisible();
  await about.getByText(tr('about.faq.support.q')).click();
  await expect(about.locator('a[href="https://ko-fi.com/pauperindex"]')).toHaveText(tr('donate.link'));
  await about.getByText(tr('about.faq.report.q')).click();
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

test('controllo rapido: se tutti i nomi arrivano dopo la scelta, l’elenco non si riapre da solo', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/data/cardnames.json', async (route) => {
    await gate;
    await route.continue();
  });
  await setup(page);
  const input = page.locator('#quickInput');
  await input.fill('brainst');
  await expect(page.locator('#quickList [role="option"]').first()).toContainText('Brainstorm');
  await input.press('Enter');
  await expect(page.locator('#quickList')).toBeHidden();
  const loaded = page.waitForResponse('**/data/cardnames.json');
  release();
  await loaded;
  await page.waitForTimeout(300);
  await expect(page.locator('#quickList')).toBeHidden();
  await expect(input).toHaveValue('Brainstorm');
});

test('logo e nome: link alla pagina principale da ogni sezione, collezione conservata, filtri azzerati', async ({ page }) => {
  await setup(page);
  const home = page.locator('#home');
  await expect(home).toHaveAccessibleName(tr('nav.home'));
  await expect(home).toHaveAttribute('href', '/');
  expect(await home.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
  // focus da tastiera visibile
  await home.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  expect(await home.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');

  await uploadCollection(page);
  for (const section of ['#navAbout', '#navDust']) {
    // filtri dell'elenco attivi, poi una sezione, poi il logo
    await page.selectOption('#seenFilter', 'old');
    await page.fill('#search', 'bolt');
    await page.click(section);
    await expect(page.locator('#viewMain')).toBeHidden();
    await page.click('#home');
    await expect(page).toHaveURL(/:\d+\/$/); // radice del sito, senza #sezione
    await expect(page.locator('#viewMain')).toBeVisible();
    await expect(page.locator('#loaded')).toContainText(tr('load.collection').trim()); // collezione ancora caricata
    await expect(page.locator('#seenFilter')).toHaveValue('all');
    await expect(page.locator('#search')).toHaveValue('');
    await expect(page.locator('#filterNote')).toBeHidden();
  }
  // già sulla pagina principale: la ricarica
  await page.evaluate(() => { (window as unknown as { marker: number }).marker = 1; });
  await page.click('#home');
  await expect(page.locator('#loaded')).toContainText(tr('load.collection').trim());
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBeUndefined();
});

async function pickSet(page: Page, query: string, name: string): Promise<void> {
  const input = page.locator('#setInput');
  await input.click();
  await input.fill(query);
  await page.locator('#setList [role="option"]', { hasText: name }).first().click();
  await expect(page.locator('#setWrap')).toHaveClass(/has-set/);
}

test('espansione: riepilogo, rarità "qui" e set d’ingresso, senza collezione', async ({ page }) => {
  await setup(page);
  await expect(page.locator('label[for="setInput"]')).toHaveText(tr('set.label'));
  await page.locator('#setInput').click();
  await expect(page.locator('#setList [role="option"]').first()).toBeVisible(); // elenco intero, dal più recente
  // simboli delle espansioni dallo sprite del sito, già nei suggerimenti (decorativi: il nome è scritto accanto)
  await page.locator('#setInput').fill('masters 25');
  const opt = page.locator('#setList [role="option"]', { hasText: 'Masters 25' }).first();
  await expect(opt.locator('svg.seticon use')).toHaveAttribute('href', 'data/seticons.svg#a25');
  await expect(opt.locator('svg.seticon')).toHaveAttribute('aria-hidden', 'true');
  const sprite = await page.request.get('data/seticons.svg');
  expect(sprite.status()).toBe(200);
  expect(sprite.headers()['content-type']).toContain('image/svg+xml');
  expect(await sprite.text()).toContain('<symbol id="a25"');
  await pickSet(page, 'masters 25', 'Masters 25');
  // dopo la scelta il simbolo resta nel campo, con il nome del set come testo alternativo
  await expect(page.locator('#setWrap .field-ico svg.seticon')).toHaveAttribute('aria-label', 'Masters 25');
  // miniature grandi (più che nella vista collezione), caricate in modo lazy
  const big = page.locator('#cardRows img.thumb.big').first();
  await expect(big).toHaveAttribute('loading', 'lazy');
  expect((await big.boundingBox())!.width).toBeGreaterThanOrEqual(80);
  const n = Number((await page.locator('#verdict').innerText()).replace(/[.,]/g, '').match(/\d+/)?.[0]);
  expect(n).toBeGreaterThan(0);
  await expect(page.locator('#verdict')).toHaveText(tr('set.summary', { n }));
  await expect(page.locator('#sub')).toContainText('Masters 25 (2018)');
  await page.fill('#search', 'lightning bolt');
  const row = page.locator('#cardRows tr').first();
  await expect(row).toContainText('Lightning Bolt');
  await expect(row.locator('.rarity')).toHaveText(tr('set.notCommon', { rarity: tr('rarity.u'), set: 'Limited Edition Alpha', year: '1993' }));
  // simbolo del set colorato secondo la rarità della stampa (non comune in Masters 25), con testo alternativo
  await expect(row.locator('.rarity svg.seticon')).toHaveClass(/rar-u/);
  await expect(row.locator('.rarity svg.seticon')).toHaveAttribute('aria-label', `Masters 25 · ${tr('rarity.u')}`);
  // la carta attiva della scheda è la stampa di Masters 25 (prima era la più recente con quell'illustrazione)
  await row.locator('.cardbtn').click();
  await expect(page.locator('#sheet dl')).toContainText('Masters 25 (2018)');
  await page.keyboard.press('Escape');
  await page.fill('#search', '');
  await expect(page.locator('#cardRows .rarity.is-common').first()).toHaveText(tr('set.common'));
  // togliere il filtro con Esc
  await page.locator('#setInput').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#setWrap')).not.toHaveClass(/has-set/);
  await expect(page.locator('#verdict')).toContainText(translate(L, 'res.list', { n: 2 }).replace(/^2 /, ''));
});

test('espansione: set nascosti attivabili; con la collezione "ne possiedi" e "solo quelle che possiedi"', async ({ page }) => {
  await setup(page);
  const input = page.locator('#setInput');
  await input.click();
  await input.fill('secret lair drop');
  await expect(page.locator('#setList')).toContainText(tr('set.noResults'));
  // l'elenco propone di cercare anche tra i set nascosti (l'opzione sotto il campo è coperta dall'elenco)
  await page.locator('#setList [role="option"]', { hasText: tr('set.searchHidden') }).click();
  await expect(page.locator('#setList [role="option"]', { hasText: 'Secret Lair Drop' })).toBeVisible();
  await expect(page.locator('#setHidden')).toBeChecked();
  await input.press('Escape');
  await page.mouse.click(5, 5);

  await uploadCollection(page);
  await pickSet(page, 'ice age', 'Ice Age');
  // Brainstorm (stampa di Ice Age) e Counterspell (posseduta in Alpha, stampata anche in Ice Age): conta la carta;
  // tra parentesi solo quelle possedute nella stampa di questa espansione (Brainstorm)
  await expect(page.locator('#verdict')).toContainText(tr('set.summaryOwned', { n: 2, here: 1 }).trim());
  await expect(page.locator('label:has(#optMissing)')).toBeHidden();
  // di default si vedono anche le mancanti (esplorazione)
  await expect(page.locator('#cardRows')).toContainText(tr('badge.missing'));
  await page.locator('label:has(#setOwned)').click();
  await expect(page.locator('#cardRows tr')).toHaveCount(2);
  const brainstorm = page.locator('#cardRows tr', { hasText: 'Brainstorm' });
  const counterspell = page.locator('#cardRows tr', { hasText: 'Counterspell' });
  await expect(brainstorm.locator('img.thumb.owned')).toHaveCount(1); // la stampa di Ice Age è tua
  await expect(counterspell.locator('img.thumb.owned')).toHaveCount(0); // possiedi Counterspell, ma non di Ice Age
  await expect(brainstorm.locator('.tag.mine')).toHaveText(tr('sheet.yours'));
  await expect(counterspell.locator('.tag.mine')).toHaveCount(0);
  // l'immagine è sempre la stampa di Ice Age, mai la tua printing di Alpha: lo si vede nella scheda
  await expect(counterspell.locator('.own')).toContainText('LEA');
  await counterspell.locator('.cardbtn').click();
  await expect(page.locator('#sheet dl')).toContainText('Ice Age');
  await expect(page.locator('#sheet .tag')).toBeHidden();
});

/** Numero nel titolo, totale dell'elenco ("Mostrate n di totale") e numero nella nota dei filtri (se c'è). */
async function counts(page: Page): Promise<{ head: number; list: number; note: number | null }> {
  const num = (s: string, i = 0) => Number((s.replace(/[.,](?=\d{3})/g, '').match(/\d+/g) || [])[i]);
  const head = num(await page.locator('#verdict').innerText());
  const shown = page.locator('#shownCount');
  const list = (await shown.isVisible()) ? num(await shown.innerText(), 1) : 0;
  const note = page.locator('#filterNote');
  return { head, list, note: (await note.isVisible()) ? num(await note.innerText()) : null };
}

test('riepilogo ed elenco: stesso insieme, e i filtri che nascondono carte sono dichiarati', async ({ page }) => {
  await setup(page);
  // il caso segnalato: Edge of Eternities, storico, "non viste da oltre 6 mesi" (ricordato nel browser)
  await pickSet(page, 'edge of eternities', 'Edge of Eternities');
  await page.selectOption('#period', '3');
  let c = await counts(page);
  expect(c.note).toBeNull();
  expect(c.list).toBe(c.head);
  // il menu Periodo conta le carte dell'espansione, come il riepilogo
  await expect(page.locator('#period option:checked')).toContainText(c.head.toLocaleString(L === 'it' ? 'it-IT' : 'en-US'));
  await page.selectOption('#seenFilter', 'old');
  c = await counts(page);
  expect(c.list).toBeLessThan(c.head);
  expect(c.note).toBe(c.list);
  await expect(page.locator('#filterNote')).toContainText(tr('why.old'));
  while (await page.locator('#more').isVisible()) await page.click('#more');
  await expect(page.locator('#cardRows tr')).toHaveCount(c.list);
  // "Togli questi filtri" riporta l'elenco all'insieme contato (anche il filtro ricordato nel browser)
  await page.locator('#clearListFilters').click();
  c = await counts(page);
  expect(c.note).toBeNull();
  expect(c.list).toBe(c.head);
  await expect(page.locator('#seenFilter')).toHaveValue('all');

  // set collegati e set nascosti: Dominaria United (DMU + DMC, promo nascoste)
  await pickSet(page, 'dominaria united', 'Dominaria United');
  const visibleOnly = await counts(page);
  expect(visibleOnly.list).toBe(visibleOnly.head);
  await page.locator('label:has(#setHidden)').click();
  const withHidden = await counts(page);
  expect(withHidden.list).toBe(withHidden.head);
  expect(withHidden.head).toBeGreaterThanOrEqual(visibleOnly.head);
  await page.fill('#search', 'a');
  c = await counts(page);
  expect(c.note).toBe(c.list);
  await expect(page.locator('#filterNote')).toContainText(tr('why.search', { q: 'a' }));
  await page.fill('#search', '');

  // vista collezione: il titolo conta le possedute; con le mancanti la nota conta l'elenco intero
  await page.locator('#setInput').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await uploadCollection(page);
  c = await counts(page);
  expect(c.note).toBeNull();
  expect(c.list).toBe(c.head);
  await page.mouse.move(0, 0); // niente scheda aperta dal passaggio del mouse sulle righe
  await page.locator('#optMissing').check();
  await expect(page.locator('#filterNote')).toBeVisible();
  c = await counts(page);
  expect(c.note).toBe(c.list);
  expect(c.list).toBeGreaterThan(c.head);
  await expect(page.locator('#filterNote')).toContainText(tr('why.missing'));
});

test('"Carica altri": 10 carte alla volta, conteggio, focus sulla prima aggiunta, ripartenza da 10', async ({ page }) => {
  await setup(page);
  const rows = page.locator('#cardRows tr');
  const total = (await page.locator('#verdict').innerText()).replace(/[.,]/g, '').match(/\d+/)![0];
  const fmt = (x: number) => x.toLocaleString(L === 'it' ? 'it-IT' : 'en-US');
  await expect(rows).toHaveCount(10);
  const firstByShare = await page.locator('#cardRows .nm').nth(0).innerText();
  await page.locator('#more').focus();
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(20);
  await expect(page.locator('#shownCount')).toHaveText(tr('res.shown', { n: 10 + 10, total: fmt(Number(total)) }));
  // il focus è sulla prima carta aggiunta, e la scheda non si apre da sola
  await expect(page.locator('#cardRows .cardbtn').nth(10)).toBeFocused();
  await expect(page.locator('#sheet')).toBeHidden();
  // l'ordinamento lavora sulla lista completa e riparte da 10
  await page.selectOption('#sort', 'name');
  await expect(rows).toHaveCount(10);
  await expect(page.locator('#shownCount')).toHaveText(tr('res.shown', { n: 10, total: fmt(Number(total)) }));
  expect(await page.locator('#cardRows .nm').nth(0).innerText()).not.toBe(firstByShare);
  // la ricerca filtra la lista completa, non solo le carte visibili
  await page.fill('#search', 'pyroblast');
  await expect(rows).toHaveCount(1);
  await expect(page.locator('#more')).toBeHidden();
  await expect(page.locator('#shownCount')).toHaveText(tr('res.shown', { n: 1, total: 1 }));
});

test('"Carta dimenticata": pagina dalla testata, scena, animazione che poi sparisce, niente ripetizioni', async ({ page }) => {
  const problems = await setup(page);
  // non è più nella zona del controllo rapido
  await expect(page.locator('#quick #dustBtn')).toHaveCount(0);
  await expect(page.locator('#navDust')).toHaveAccessibleName(tr('nav.dust'));
  // nella testata è un pulsante compatto (pieno di colore, con icona e ragnatela), "Informazioni" un link discreto
  await expect(page.locator('#navDust .nd-ico')).toHaveCount(1);
  await expect(page.locator('#navDust .nd-web')).toHaveCount(1);
  expect(await page.locator('#navDust').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('gradient');
  expect(await page.locator('#navAbout').evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none');
  // etichetta breve solo sugli schermi stretti
  const short = await page.locator('#navDust .nd-short').isVisible();
  expect(short).toBe((page.viewportSize()?.width ?? 1280) <= 400);
  await expect(page.locator('#navDust ' + (short ? '.nd-short' : '.nd-full'))).toHaveText(tr(short ? 'nav.dustShort' : 'nav.dust'));
  await page.click('#navDust');
  await expect(page).toHaveURL(/#carta-dimenticata$/);
  await expect(page.locator('#viewMain')).toBeHidden();
  await expect(page.locator('#navDust')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#dustHeading')).toHaveText(tr('dust.title'));
  await expect(page.locator('.dust-lead')).toHaveText(tr('dust.lead'));
  await expect(page.locator('#dustBtn')).toHaveText(tr('dust.button'));
  // un vero pulsante, con tre ragnatele decorative agli angoli
  await expect(page.locator('#dustBtn .bweb')).toHaveCount(3);
  await expect(page.locator('#dustBtn .bweb').first()).toHaveAttribute('aria-hidden', 'true');
  const box = (await page.locator('#dustBtn').boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(64); // area di tocco ampia
  // prima della pesca: cornice vuota con le ragnatele, al centro della scena; si può toccare per pescare
  const frame = page.locator('#dustResult button.dust-empty');
  await expect(frame).toHaveAttribute('aria-label', tr('dust.tapFrame'));
  await expect(frame).toContainText(tr('dust.tap'));
  await expect(page.locator('#dustAllWrap')).toBeHidden(); // senza collezione niente interruttore
  await frame.click();
  const res = page.locator('#dustResult .dust-scene');
  await expect(res).toBeVisible();
  await expect(res).toContainText(head('dust.peak'));
  await expect(res).toContainText(head('dust.last'));
  await expect(page.locator('#dustBtn')).toHaveText(tr('dust.again'));
  // l'immagine non è mai filtrata; la copertura c'è durante l'animazione e poi viene rimossa
  expect(await res.locator('img').evaluate((el) => getComputedStyle(el).filter)).toBe('none');
  await expect(res.locator('.dust-cover')).toHaveCount(0, { timeout: 5000 });
  const names = new Set([await page.locator('#dustTitle').innerText()]);
  for (let i = 0; i < 4; i++) {
    const before = await page.locator('#dustTitle').innerText();
    await page.click('#dustBtn');
    // alla pressione le ragnatele del pulsante vengono spazzate via, poi compare la carta nuova
    await expect(page.locator('#dustTitle')).not.toHaveText(before);
    names.add(await page.locator('#dustTitle').innerText());
  }
  expect(names.size).toBe(5);
  // con la collezione compare l'interruttore; se nessuna tua carta è dimenticata lo si dice (prima non compariva nulla)
  await page.goto('./');
  await uploadCollection(page);
  await page.click('#navDust');
  await expect(page.locator('#dustAllWrap')).toBeVisible();
  await page.click('#dustBtn');
  const scene = page.locator('#dustResult .dust-scene');
  await expect(scene).toBeVisible();
  if (await scene.locator('img').count() === 0) {
    await expect(scene).toContainText(head('dust.noneOwned'));
    await page.locator('#dustAllWrap').click();
    await expect(scene.locator('img')).toBeVisible();
  }
  expect(problems).toEqual([]);
});

test('"Carta dimenticata" con prefers-reduced-motion: la carta appare subito, senza copertura', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  // la ragnatela del pulsante in testata resta ferma al passaggio del mouse
  await page.hover('#navDust');
  expect(await page.locator('#navDust .nd-web').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await page.click('#navDust');
  // ragnatele del pulsante ferme anche al passaggio del mouse
  await page.hover('#dustBtn');
  expect(await page.locator('#dustBtn .bweb svg').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await page.click('#dustBtn');
  await expect(page.locator('#dustResult .dust-scene img')).toBeVisible();
  await expect(page.locator('#dustResult .dust-stage:not(.dust-empty) .dust-cover')).toHaveCount(0);
  await expect(page.locator('#dustBtn')).not.toHaveClass(/sweep/);
});
