import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fmtAgo, fmtDate, fmtDateShort, translate, type Key, type Lang } from '../src/i18n';

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

/** Clic su Informazioni, lingua o tema: su mobile stanno nel pannello del pulsante "⋯", che si apre se serve. */
async function navClick(page: Page, sel: string): Promise<void> {
  if (!(await page.locator(sel).isVisible()) && (await page.locator('#navMore').isVisible())) await page.click('#navMore');
  await page.click(sel);
}

/** Scrive nel campo "Cerca una carta" (filtra l'elenco) e chiude i suggerimenti, che coprono le prime righe. */
async function typeSearch(page: Page, q: string): Promise<void> {
  await page.fill('#search', q);
  if (await page.locator('#searchList').isVisible()) await page.locator('#search').press('Escape');
}

/** "Ultima apparizione" (nel pannello "Filtri" dal 2026-10-15): apre il pannello, sceglie, lo richiude. */
async function setSeen(page: Page, v: 'all' | 'recent' | 'old'): Promise<void> {
  if (!(await page.locator('#seenFilter').isVisible())) await page.click('#filtersBtn');
  await page.selectOption('#seenFilter', v);
  await page.click('#fpDone');
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
  await expect(page.locator('#loadIntro')).toHaveText(tr('load.intro'));
  await expect(page.locator('#search')).toHaveAttribute('placeholder', tr('search.placeholder'));
  await expect(page.locator('#loadArea')).toBeVisible();
  await expect(page.locator('#loaded')).toBeHidden();
  await expect(page.locator('#period option')).toHaveCount(4);
  await expect(page.locator('#period')).toHaveValue('1');
  await expect(page.locator('#period option').first()).toContainText(tr('period.0'));
  const n = Number((await page.locator('#verdict').innerText()).replace(/[.,]/g, '').match(/\d+/)?.[0]);
  await expect(page.locator('#verdict')).toHaveText(tr('res.list', { n }));
  await expect(page.locator('#cardRows tr')).toHaveCount(10);
  await expect(page.locator('#shownCount')).toHaveText(tr('res.shown', { n: 10, total: n.toLocaleString(L === 'it' ? 'it-IT' : 'en-US') }));
  await expect(page.locator('#more')).toHaveText(tr('res.moreN', { n: 100, left: (n - 10).toLocaleString(L === 'it' ? 'it-IT' : 'en-US') }));
  await expect(page.locator('#extraColl')).toBeHidden();
  await expect(page.locator('.box, .tick, #assign, #optBasics')).toHaveCount(0);
  // date nella lingua scelta (data di data/meta.json)
  const meta = JSON.parse(readFileSync(resolve(HERE, '../../data/meta.json'), 'utf-8'));
  await expect(page.locator('#dataline')).toContainText(fmtDateShort(meta.last_tournament, new Date().getUTCFullYear(), L));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
});

test('riga dei dati: età sempre visibile, avviso solo oltre 15 giorni', async ({ page }) => {
  const meta = JSON.parse(readFileSync(resolve(HERE, '../../data/meta.json'), 'utf-8'));
  const at = (days: number) => new Date(Date.parse(meta.last_tournament.slice(0, 10) + 'T12:00:00Z') + days * 86400000);
  await page.clock.setFixedTime(at(8));
  await setup(page);
  const line = page.locator('#dataline');
  await expect(line).toContainText(`(${fmtAgo(8, L)})`);
  await expect(line.locator('.warn')).toHaveCount(0);
  await page.clock.setFixedTime(at(15));
  await page.reload();
  await expect(line).toContainText(`(${fmtAgo(15, L)})`);
  await expect(line.locator('.warn')).toHaveCount(0);
  await page.clock.setFixedTime(at(16));
  await page.reload();
  await expect(line.locator('.warn')).toHaveText(tr('data.stale', { days: 16 }));
});

test('selettore IT/EN: cambia tutti i testi e la scelta resta dopo il ricaricamento', async ({ page }) => {
  await setup(page);
  const other: Lang = L === 'it' ? 'en' : 'it';
  await navClick(page, `[data-lang="${other}"]`);
  await expect(page.locator('html')).toHaveAttribute('lang', other);
  await expect(page.locator('#navAbout')).toHaveText(translate(other, 'nav.about'));
  await expect(page.locator('#loadIntro')).toHaveText(translate(other, 'load.intro'));
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
  // minimo mazzi, solo legali e side sono nel pannello "Filtri": la barra mostra periodo, espansione e ricerca
  await expect(page.locator('#optMin')).toBeHidden();
  await page.click('#filtersBtn');
  await page.fill('#optMin', '500');
  await expect(page.locator('#verdict')).not.toHaveText(before);
  await page.fill('#optMin', '1');
  await page.click('#fpDone');
  await page.selectOption('#period', '3');
  for (const q of ['island', 'snow-covered', 'wastes']) {
    await typeSearch(page, q);
    const names = await page.locator('#cardRows .nm').allInnerTexts();
    expect(names.filter((x) => /^(Plains|Island|Swamp|Mountain|Forest|Wastes|Snow-Covered .+)$/.test(x))).toEqual([]);
  }
  await typeSearch(page, 'zzzz-nessuna');
  await expect(page.locator('#cardRows')).toContainText(tr('res.noMatch'));
});

test('CSV ManaBox: riga compatta, solo possedute, mancanti, Binder inclusi, export', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const problems = await setup(page);
  await uploadCollection(page);
  await expect(page.locator('#loadArea')).toBeHidden();
  await expect(page.locator('#loaded')).toContainText(tr('load.replace'));
  // carte distinte e copie (prima "15 carte": le copie, proxy compreso, contate come carte)
  await expect(page.locator('#loaded')).toContainText(tr('load.cardsCopies', { cards: tr('load.cards', { n: 6 }), copies: tr('load.copies', { n: 14 }) }));
  const owned = Number((await page.locator('#verdict').innerText()).match(/\d+/)?.[0]);
  await expect(page.locator('#verdict')).toHaveText(tr('res.owned', { n: owned }));

  // di default solo le possedute, ordinate dalle più giocate
  const rows = (await page.locator('#cardRows tr').allInnerTexts()).join('\n');
  expect(rows).not.toContain(tr('badge.missing'));
  expect(rows).not.toContain('Kor Skyfisher'); // nel mazzo: escluso
  await typeSearch(page, 'brainstorm');
  await expect(page.locator('#cardRows tr').first().locator('.c-qty')).toContainText('5');
  await expect(page.locator('#cardRows tr').first().locator('img.thumb.owned')).toHaveCount(2);
  await typeSearch(page, '');

  // gruppi inclusi, in fondo
  await expect(page.locator('#grpSummary')).toHaveText(tr('grp.summary', { inc: 2, total: 4 }));
  await page.locator('#grpSummary').click();
  await expect(page.locator('#groupRows input[value="skip"]:checked')).toHaveCount(2);
  await expect(page.locator('#groupRows')).toContainText(tr('grp.exclude'));
  await expect(page.locator('#optProxyWrap')).toBeVisible();
  await typeSearch(page, 'tolarian terror');
  // con la ricerca attiva la carta non è nell'elenco (solo proxy): la nota propone di aprirne la scheda
  await expect(page.locator('#cardRows')).toContainText(tr('search.noneInList', { q: 'tolarian terror' }));
  await expect(page.locator('#openFromNote')).toHaveText(tr('search.openCard', { name: 'Tolarian Terror' }));
  await page.locator('#optProxyWrap').click();
  await expect(page.locator('#cardRows tr').first()).toContainText('Tolarian Terror');

  // mostra anche le mancanti
  await typeSearch(page, 'kor skyfisher');
  // con la ricerca attiva la carta non è nell'elenco: la nota propone di aprirne la scheda
  await expect(page.locator('#cardRows')).toContainText(tr('search.noneInList', { q: 'kor skyfisher' }));
  await page.locator('label:has(#optMissing)').click();
  await expect(page.locator('#cardRows tr').first()).toContainText(tr('badge.missing'));

  // riepilogo dell'importazione
  await expect(page.locator('#impSummary')).toHaveText(tr('imp.summary', { rows: tr('imp.rows', { n: 10 }), unrec: 0 }));
  await page.locator('#impSummary').click();
  await expect(page.locator('#importSummary')).toContainText(tr('imp.notInList', { n: 1 }));

  // export, con nomi di file nella lingua: tutte le carte che rispettano i filtri attivi (qui la ricerca)
  await page.locator('#expDetails summary').click();
  await page.click('[data-copy="missing"]');
  // (gli appunti di Windows possono aggiungere spazi in fondo alle righe)
  expect((await page.evaluate(() => navigator.clipboard.readText())).trim()).toBe('1 Kor Skyfisher');
  await typeSearch(page, '');
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
  await page.click('#pasteToggle');
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
  await typeSearch(page, 'fire // ice');
  await expect(page.locator('#cardRows tr').first()).toContainText(`MH2 #290 ${tr('print.foil')}`);
});

test('errori nella lingua scelta', async ({ page }) => {
  await setup(page);
  await page.click('#pasteToggle');
  await page.click('#pasteAdd');
  await expect(page.locator('#errors')).toHaveText(tr('err.pasteEmpty'));
  await page.setInputFiles('#files', { name: 'strano.csv', mimeType: 'text/csv', buffer: Buffer.from('foo,bar\n1,2\n') });
  await expect(page.locator('#errors')).toHaveText(tr('err.noName', { file: 'strano.csv', headers: 'foo, bar' }));
});

test('scheda con ventaglio: tastiera, carta attiva visibile, Esc', async ({ page }) => {
  await setup(page);
  await uploadCollection(page);
  await typeSearch(page, 'brainstorm');
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
  const img = sheet.locator('.active-card img:not(.ph)');
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

test('Come funziona: breve, FAQ chiuse, avviso Fan Content Policy ufficiale una sola volta, sintesi solo in italiano', async ({ page }) => {
  await setup(page);
  // due righe: avviso breve e donazioni (solo un link semplice, nessun widget)
  await expect(page.locator('footer p')).toHaveCount(2);
  await expect(page.locator('footer')).toContainText(tr('foot.line'));
  await expect(page.locator('footer .donate')).toHaveText(`${tr('donate.lead')} ${tr('donate.link')}`);
  await expect(page.locator('footer a[href="https://ko-fi.com/pauperindex"]')).toHaveText(tr('donate.link'));
  // "Note legali" nel piè di pagina: porta direttamente al blocco legale della pagina "Come funziona"
  const legalLink = page.locator('footer a[href="#note-legali"]');
  await expect(legalLink).toHaveText(tr('foot.link'));
  await legalLink.focus();
  await page.keyboard.press('Enter');
  const about = page.locator('#viewAbout');
  await expect(about.locator('h2').first()).toHaveText(tr('about.title'));
  await expect(page.locator('#navAbout')).toHaveAttribute('aria-current', 'page');
  await expect(about.locator('#legal')).toBeInViewport();
  await expect(about.locator('#legal')).toBeFocused();
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
  await expect(faqs).toHaveCount(8); // con "Da dove vengono i prezzi?", "Cosa vuol dire il tier?" e "Perché mancano i tornei degli ultimi giorni?"
  for (let i = 0; i < 8; i++) await expect(faqs.nth(i)).not.toHaveAttribute('open', '');
  await about.getByText(tr('about.faq.tier.q')).click();
  await expect(about.getByText(tr('about.faq.tier.a'))).toBeVisible();
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

test('cerca una carta: suggerimenti ed elenco filtrato, Invio parziale, nome esatto, frecce, scheda completa', async ({ page }) => {
  await setup(page);
  const input = page.locator('#search');
  const list = page.locator('#searchList');
  await expect(input).toHaveAttribute('placeholder', tr('search.placeholder'));
  await expect(input).toHaveAttribute('role', 'combobox');
  await expect(page.locator('#quickInput, #quickResult')).toHaveCount(0); // un solo campo
  await input.fill('brainst');
  await expect(list).toBeVisible();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await expect(list.locator('[role="option"]').first()).toContainText('Brainstorm');
  await expect(list.locator('[role="option"][aria-selected="true"]')).toHaveCount(0); // nessuno evidenziato
  await expect(page.locator('#cardRows .nm').first()).toHaveText('Brainstorm'); // l'elenco è già filtrato
  // Invio con un testo parziale: niente scheda, suggerimenti e tastiera chiusi, elenco filtrato
  await input.press('Enter');
  await expect(list).toBeHidden();
  await expect(input).not.toBeFocused();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#cardRows .nm').first()).toHaveText('Brainstorm');
  // Invio con un nome esatto: la scheda completa (legalità, statistiche, ultime apparizioni, ingresso, possesso)
  await input.fill('Brainstorm');
  await input.press('Enter');
  const sheet = page.locator('#sheet');
  await expect(sheet).toBeVisible();
  await expect(page.locator('#sheetTitle')).toContainText('Brainstorm');
  await expect(page.locator('#sheetTitle .badge')).toHaveText(tr('quick.legal.l'));
  await expect(sheet).toContainText(tr('sheet.lastMtgo').trim());
  await expect(sheet).toContainText(head('quick.entry'));
  await expect(sheet).toContainText(tr('quick.noCollection'));
  await expect(sheet.locator('.fan-item').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  // frecce: la voce evidenziata si apre con Invio
  await input.fill('light');
  await input.press('ArrowDown');
  await expect(list.locator('[role="option"]').first()).toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowDown');
  const second = list.locator('[role="option"]').nth(1);
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await expect(input).toHaveAttribute('aria-activedescendant', 'sopt-1');
  const name = (await second.locator('.qname').innerText()).trim();
  await input.press('Enter');
  await expect(page.locator('#sheetTitle')).toContainText(name);
  await page.keyboard.press('Escape');
  // Esc: prima chiude i suggerimenti, poi svuota il campo
  await input.fill('light');
  await input.press('Escape');
  await expect(list).toBeHidden();
  await expect(input).toHaveValue('light');
  await input.press('Escape');
  await expect(input).toHaveValue('');
  // toccare fuori chiude i suggerimenti; l'elenco filtrato resta visibile
  await input.fill('counterspe');
  await expect(list).toBeVisible();
  await page.locator('#verdict').click();
  await expect(list).toBeHidden();
  await expect(page.locator('#cardRows .nm').first()).toHaveText('Counterspell');
});

test('cerca una carta: carta mai giocata (scheda ridotta), bannata, nessun risultato', async ({ page }) => {
  await setup(page);
  const input = page.locator('#search');
  await input.fill('black lot');
  const opt = page.locator('#searchList [role="option"]', { hasText: 'Black Lotus' });
  await expect(opt).toContainText(tr('quick.tagNever'));
  await opt.click();
  const sheet = page.locator('#sheet');
  await expect(page.locator('#sheetTitle')).toContainText('Black Lotus');
  await expect(sheet).toContainText(tr('quick.never'));
  await expect(page.locator('#sheetTitle .badge')).toHaveText(tr('quick.legal.n'));
  await expect(sheet.locator('.fan-item')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await input.fill('Gush');
  await input.press('Enter');
  await expect(page.locator('#sheetTitle .badge')).toHaveText(tr('quick.legal.b'));
  await page.keyboard.press('Escape');
  await input.fill('zzqq');
  await expect(page.locator('#searchList')).toContainText(tr('quick.noResults'));
});

test('cerca una carta con la collezione: possesso e printing; la nota propone la scheda se l’elenco non la trova', async ({ page }) => {
  await setup(page);
  await uploadCollection(page);
  const input = page.locator('#search');
  const sheet = page.locator('#sheet');
  await input.fill('Lightning Bolt');
  await input.press('Enter');
  await expect(sheet).toContainText('LEA #161 it ×1');
  await page.keyboard.press('Escape');
  await input.fill('Kor Skyfisher'); // solo nel mazzo, che è escluso
  await input.press('Enter');
  await expect(sheet).toContainText(tr('sheet.notOwned'));
  await page.keyboard.press('Escape');
  // Black Lotus: posseduta ma mai giocata, quindi non è nell'elenco: la nota propone la scheda
  await input.fill('black lotus');
  await input.press('Escape');
  await expect(page.locator('#cardRows')).toContainText(tr('search.noneInList', { q: 'black lotus' }));
  await page.locator('#openFromNote').click();
  await expect(page.locator('#sheetTitle')).toContainText('Black Lotus');
  await expect(sheet).toContainText(tr('quick.never'));
  await page.keyboard.press('Escape');
  // periodo cambiato: la scheda aperta dopo usa il nuovo periodo
  await page.selectOption('#period', '0');
  await input.fill('Brainstorm');
  await input.press('Enter');
  await expect(sheet).toContainText(tr('period.0'));
});

test('cerca una carta: se tutti i nomi arrivano dopo la scelta, l’elenco non si riapre da solo', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/data/cardnames.json', async (route) => {
    await gate;
    await route.continue();
  });
  await setup(page);
  const input = page.locator('#search');
  await input.fill('brainst');
  await expect(page.locator('#searchList [role="option"]').first()).toContainText('Brainstorm');
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page.locator('#searchList')).toBeHidden();
  await expect(page.locator('#sheetTitle')).toContainText('Brainstorm');
  const loaded = page.waitForResponse('**/data/cardnames.json');
  release();
  await loaded;
  await page.waitForTimeout(300);
  await expect(page.locator('#searchList')).toBeHidden();
  await expect(input).toHaveValue('Brainstorm');
});

test('cerca una carta: i nomi che arrivano mentre si sceglie con le frecce non cambiano la scelta', async ({ page }) => {
  // il difetto del controllo rapido: all'arrivo di tutti i nomi l'elenco si ridisegnava e tornava al primo suggerimento
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/data/cardnames.json', async (route) => {
    await gate;
    await route.continue();
  });
  await setup(page);
  const input = page.locator('#search');
  await input.fill('light');
  await input.press('ArrowDown');
  await input.press('ArrowDown');
  const chosen = page.locator('#searchList [role="option"][aria-selected="true"]');
  const name = (await chosen.locator('.qname').innerText()).trim();
  const loaded = page.waitForResponse('**/data/cardnames.json');
  release();
  await loaded;
  await page.waitForTimeout(300); // i suggerimenti si sono ridisegnati con tutti i nomi
  await expect(chosen).toHaveCount(1);
  await expect(chosen.locator('.qname')).toHaveText(name);
  await input.press('Enter');
  await expect(page.locator('#sheetTitle')).toContainText(name);
});

test('cerca una carta: Invio con un nome esatto prima che i suggerimenti siano pronti apre la scheda appena arrivano', async ({ page }) => {
  // dati delle carte e tutti i nomi trattenuti: il nome e Invio arrivano prima di qualsiasi suggerimento
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  for (const f of ['cards', 'cardnames']) {
    await page.route(`**/data/${f}.json`, async (route) => {
      await gate;
      await route.continue();
    });
  }
  await page.route('https://cards.scryfall.io/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.goto('./');
  const input = page.locator('#search');
  await input.fill('Brainstorm');
  await input.press('Enter');
  await expect(page.locator('#sheet')).toBeHidden();
  release();
  await expect(page.locator('#sheetTitle')).toContainText('Brainstorm');
  await expect(page.locator('#searchList')).toBeHidden();

  // un testo parziale non apre nulla (l'attesa vale solo per il nome esatto): resta l'elenco filtrato
  let release2!: () => void;
  const gate2 = new Promise<void>((r) => { release2 = r; });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route('https://cards.scryfall.io/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.route('**/data/cards.json', async (route) => {
    await gate2;
    await route.continue();
  });
  await page.reload();
  await input.fill('brainst');
  await input.press('Enter');
  release2();
  await expect(page.locator('#cardRows .nm').first()).toHaveText('Brainstorm');
  await page.waitForTimeout(300);
  await expect(page.locator('#sheet')).toBeHidden();
});

test('interazioni prima che arrivino i dati: banner, "Cerca una carta", Mazzi e Carta dimenticata senza errori', async ({ page }) => {
  // "Cannot read properties of null (reading 'cards')" nella CI del 16/10: scrivere nel campo prima di cards.json
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|reviews\/index\.json|404/.test(m.text())) problems.push(m.text()); });
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/data/cards.json', async (route) => {
    await gate;
    await route.continue();
  });
  await page.route('https://cards.scryfall.io/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.goto('./');
  await page.click('#welcomeClose');
  const input = page.locator('#search');
  await input.focus();
  await input.pressSequentially('light', { delay: 20 });
  await input.press('ArrowDown');
  await input.press('Enter');
  await input.press('Escape');
  await input.fill('Brainstorm');
  await page.click('#navDecks');
  await expect(page.locator('#viewDecks')).toBeVisible();
  await page.click('#navDust');
  await expect(page.locator('#viewDust')).toBeVisible();
  await page.locator('#dustMin').fill('10');
  await page.locator('#dustBtn').click({ trial: !(await page.locator('#dustBtn').isEnabled()) });
  await page.waitForTimeout(200);
  expect(problems).toEqual([]);
  // all'arrivo dei dati la pagina si completa, sempre senza errori
  release();
  await expect(page.locator('#dustMinCount')).not.toHaveText('');
  await page.click('#navDecks');
  await expect(page.locator('#tierSections .fam-card').first()).toBeVisible();
  // indietro fino alla pagina principale: il testo scritto prima dei dati filtra l'elenco
  for (let i = 0; i < 3; i++) await page.goBack();
  await expect(page.locator('#viewMain')).toBeVisible();
  await expect(input).toHaveValue('Brainstorm');
  await expect(page.locator('#cardRows .nm').first()).toHaveText('Brainstorm');
  expect(problems).toEqual([]);
});

test('testata: una riga, pannello "⋯" su mobile, pulsanti speciali, libro che si apre senza cambiare dimensioni', async ({ page, isMobile }) => {
  await setup(page);
  const top = (await page.locator('.top').boundingBox())!;
  expect(top.height).toBeLessThanOrEqual(60); // una sola riga, anche su mobile
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  // riga dei dati corta: ultimo torneo e mazzi; il resto è in Informazioni
  await expect(page.locator('#dataline')).toContainText(head('data.line'));
  expect((await page.locator('#dataline').boundingBox())!.height).toBeLessThanOrEqual(isMobile ? 40 : 24);
  const book = page.locator('#navDecks');
  await expect(book).toHaveAccessibleName(tr('nav.decks'));
  await expect(page.locator('#navDust')).toHaveAccessibleName(tr('nav.dust'));
  await expect(page.locator('#navDebuts')).toHaveAccessibleName(tr('nav.debuts'));
  // i tre pulsanti speciali: stessa altezza
  const heights = await page.locator('.special').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(heights).toHaveLength(3);
  expect(new Set(heights).size).toBe(1);
  const more = page.locator('#navMore');
  if (isMobile) {
    // Informazioni, lingua e tema nel pannello "⋯": si apre, Esc lo chiude e riporta il focus, toccare fuori lo chiude
    await expect(page.locator('#navAbout')).toBeHidden();
    await expect(more).toHaveAccessibleName(tr('nav.more'));
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#navAbout')).toBeVisible();
    // la prima voce (Preferite) riceve il focus
    await expect(page.locator('#navFav')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#navAbout')).toBeHidden();
    await expect(more).toBeFocused();
    await more.click();
    await page.locator('#verdict').click();
    await expect(page.locator('#navAbout')).toBeHidden();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    // cambio di pagina senza toccare il pannello (link, "indietro" del browser o il gesto di Android): si chiude
    await more.click();
    await page.evaluate(() => { location.hash = '#mazzi'; });
    await expect(page.locator('#navAbout')).toBeHidden();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await page.goBack();
    await expect(page.locator('#viewMain')).toBeVisible();
    await expect(page.locator('#navAbout')).toBeHidden();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
  } else {
    await expect(more).toBeHidden();
    await expect(page.locator('#navAbout')).toBeVisible();
  }
  // libro: aperto sulla pagina Mazzi, stesse dimensioni del pulsante
  const before = (await book.boundingBox())!;
  await page.route('**/data/decks-61.json', (r) => r.fulfill({ json: syntheticDecks() }));
  await book.click();
  await expect(book).toHaveAttribute('aria-current', 'page');
  await expect.poll(() => page.locator('.book-cover').evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
  const after = (await book.boundingBox())!;
  expect([after.width, after.height].map(Math.round)).toEqual([before.width, before.height].map(Math.round));
  // sipario: aperto sulla pagina Debutti, stesse dimensioni
  const curtain = page.locator('#navDebuts');
  const c0 = (await curtain.boundingBox())!;
  await curtain.click();
  await expect(curtain).toHaveAttribute('aria-current', 'page');
  await expect(book).not.toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#viewDebuts')).toBeVisible();
  await expect.poll(() => page.locator('.curtain .left').evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
  const c1 = (await curtain.boundingBox())!;
  expect([c1.width, c1.height].map(Math.round)).toEqual([c0.width, c0.height].map(Math.round));
});

test('testata sui telefoni da 360 a 430 px: nome, tre pulsanti speciali e "⋯" su una riga; sotto 360 solo il logo', async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop-it' && info.project.name !== 'desktop-en', 'larghezze impostate dal test');
  const ctx = await browser.newContext({ ...info.project.use, baseURL, viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, bypassCSP: true });
  const page = await ctx.newPage();
  await setup(page);
  await page.addStyleTag({ content: 'body, body *:not(.brand) { font-family: Arial, "Liberation Sans", sans-serif !important; }' });
  for (const w of [320, 360, 375, 390, 430]) {
    await page.setViewportSize({ width: w, height: 740 });
    const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
    const top = await box('.top');
    expect(top.height, `${w}px`).toBeLessThanOrEqual(60);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${w}px`).toBe(0);
    const ys = await Promise.all(['#navDecks', '#navDust', '#navDebuts', '#navMore'].map(async (s) => box(s)));
    for (const b of ys) expect(Math.abs(b.y + b.height / 2 - (ys[0].y + ys[0].height / 2)), `${w}px`).toBeLessThanOrEqual(3);
    if (w < 360) await expect(page.locator('.home .brand')).toBeHidden();
    else {
      await expect(page.locator('.home .brand')).toBeVisible();
      expect((await box('.home .brand')).x + (await box('.home .brand')).width, `${w}px`).toBeLessThanOrEqual(ys[0].x);
    }
    for (const s of ['#navDecks', '#navDust', '#navDebuts']) expect((await box(s)).height).toBeGreaterThanOrEqual(44);
  }
  await ctx.close();
});

test('testata da tablet e desktop (761–1440 px), anche con un carattere largo: una riga, nessuno scorrimento', async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop-it' && info.project.name !== 'desktop-en', 'larghezze impostate dal test');
  // in CI il carattere di sistema è DejaVu Sans, molto più largo di quelli di Windows e macOS: con il terzo pulsante
  // la testata andava su due righe (CI rossa del 19/10). Qui si misura con un carattere largo anche in locale.
  const ctx = await browser.newContext({ ...info.project.use, baseURL, viewport: { width: 1280, height: 860 }, bypassCSP: true });
  const page = await ctx.newPage();
  await setup(page);
  await page.addStyleTag({ content: 'body, body *:not(.brand) { font-family: "DejaVu Sans", Verdana, sans-serif !important; }' });
  for (const w of [761, 800, 900, 960, 1024, 1199, 1200, 1280, 1440]) {
    await page.setViewportSize({ width: w, height: 860 });
    expect((await page.locator('.top').boundingBox())!.height, `${w}px`).toBeLessThanOrEqual(60);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${w}px`).toBe(0);
    await expect(page.locator('#navAbout')).toBeVisible();
    const hs = await page.locator('.special').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(new Set(hs).size, `${w}px`).toBe(1);
  }
  await ctx.close();
});

test('banner della prima visita: riquadro con i tre passi, X che lo chiude, non ricompare, torna dopo "Cancella i miei dati"', async ({ page }) => {
  await setup(page);
  const box = page.locator('#welcome');
  await expect(box).toBeVisible();
  await expect(page.locator('#welcome .step')).toHaveCount(3);
  await expect(page.locator('#welcome .step-ico')).toHaveCount(3);
  await expect(box).toContainText(tr('welcome.free'));
  // un riquadro nella pagina, non una finestra sopra il sito
  expect(await box.evaluate((e) => getComputedStyle(e).position)).toBe('static');
  expect(await page.locator('dialog[open]').count()).toBe(0);
  const x = page.locator('#welcomeClose');
  await expect(x).toHaveAccessibleName(tr('welcome.close'));
  const b = (await x.boundingBox())!;
  expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
  await x.click();
  await expect(box).toBeHidden();
  await expect(page.locator('#search')).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('pauper-index:welcomeClosed'))).toBe('1');
  // non ricompare ricaricando
  await page.reload();
  await expect(page.locator('#dataline')).toContainText(head('data.line'));
  await expect(box).toBeHidden();
  // solo nella pagina principale
  await page.click('#navDust');
  await expect(box).toBeHidden();
  await page.click('#home');
  // "Cancella i miei dati" cancella anche la scelta: il banner torna
  await page.locator('#extra').scrollIntoViewIfNeeded();
  await page.click('#clearData');
  await page.click('#clearData');
  await expect(box).toBeVisible();
});

test('caricamento: frase, due pulsanti, area di testo su richiesta, aiuto per ManaBox, riga della collezione', async ({ page, isMobile }) => {
  await setup(page);
  await expect(page.locator('#loadIntro')).toHaveText(tr('load.intro'));
  await expect(page.locator('.filebtn')).toHaveText(tr('load.fileBtn'));
  const toggle = page.locator('#pasteToggle');
  await expect(toggle).toHaveText(tr('load.pasteBtn'));
  // l'area di testo compare solo toccando "Incolla una lista"
  await expect(page.locator('#pasteText')).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#pasteText')).toBeFocused();
  await toggle.click();
  await expect(page.locator('#pasteText')).toBeHidden();
  // aiuto per l'export: chiuso, con i passi e il link alla guida ufficiale
  const howto = page.locator('details.howto');
  await expect(howto.locator('summary')).toHaveText(tr('load.howto'));
  await howto.locator('summary').click();
  await expect(howto.locator('li')).toHaveCount(3);
  await expect(howto.locator('a')).toHaveAttribute('href', 'https://manabox.app/guides/collection/import-export/');
  await expect(howto.locator('a')).toHaveAttribute('rel', 'noopener noreferrer');
  // il file si sceglie dal pulsante (l'input è dentro l'etichetta) e con la tastiera
  await uploadCollection(page);
  await expect(page.locator('#loadArea')).toBeHidden();
  const rm = page.locator('#removeColl');
  await expect(rm).toHaveAccessibleName(tr('load.remove'));
  await expect(rm).toHaveText(tr('load.removeShort'));
  if (isMobile) expect((await rm.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // con la collezione la riga è una sola
  expect((await page.locator('#loaded').boundingBox())!.height).toBeLessThanOrEqual(isMobile ? 100 : 56);
});

test('primo schermo su iPhone SE (375×667): obiettivi senza e con collezione', async ({ browser, baseURL, isMobile }, info) => {
  test.skip(!isMobile, 'obiettivi misurati su mobile');
  // gli obiettivi valgono per un telefono (San Francisco su iPhone, Roboto su Android): si misura con Arial, di larghezza
  // simile, uguale in locale (Windows) e in CI (Liberation Sans, installata da "playwright install --with-deps").
  // Senza, su Ubuntu il carattere di sistema sarebbe DejaVu Sans, molto più larga. Solo qui la CSP è aggirata, per lo stile.
  const ctx = await browser.newContext({ ...info.project.use, baseURL, viewport: { width: 375, height: 667 }, bypassCSP: true });
  const page = await ctx.newPage();
  // prezzi sintetici per ogni printing, come nei dati reali (quasi tutte le carte hanno un prezzo): nella CI
  // data/prices.json non esiste (si genera alla pubblicazione), ma il riepilogo va misurato
  const prints = (await (await page.request.get('data/printings.json')).json()) as { p: unknown[][] };
  const allPrices = JSON.stringify({ v: 1, date: '2026-10-07', p: prints.p.map((ps) => ps.flatMap(() => [100, 0])) });
  await page.route('**/data/prices.json', (r) => r.fulfill({ contentType: 'application/json', body: allPrices }));
  await setup(page);
  // con il banner della prima visita aperto: nel primo schermo il banner e il blocco di caricamento
  await page.addStyleTag({ content: 'body, body *:not(.brand) { font-family: Arial, "Liberation Sans", sans-serif !important; }' });
  await expect(page.locator('#welcome')).toBeVisible();
  expect(await page.locator('#welcome').evaluate((e) => e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(667);
  expect(await page.locator('#loadArea').evaluate((e) => e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(667);
  // gli obiettivi valgono con il banner chiuso
  await page.click('#welcomeClose');
  await page.addStyleTag({ content: 'body, body *:not(.brand) { font-family: Arial, "Liberation Sans", sans-serif !important; }' });
  // i prezzi arrivano dopo: si misura con il riepilogo visibile (il caso più alto)
  await expect(page.locator('#priceSummary')).toBeVisible();
  const bottom = (sel: string, i = 0) => page.locator(sel).nth(i).evaluate((e) => e.getBoundingClientRect().bottom);
  // senza collezione: blocco di caricamento, campo di ricerca e le prime 3 carte (obiettivo del piano)
  for (const sel of ['#loadIntro', '#loadArea', '#search']) expect(await bottom(sel)).toBeLessThanOrEqual(667);
  expect(await bottom('#cardRows tr', 2)).toBeLessThanOrEqual(667);
  // con la collezione: "Possiedi N carte" e almeno 3 carte
  await page.click('#pasteToggle');
  await page.fill('#pasteText', '4 Ponder\n4 Brainstorm\n4 Counterspell\n2 Lightning Bolt\n4 Preordain\n2 Snuff Out\n2 Cast Down\n2 Mulldrifter');
  await page.click('#pasteAdd');
  await expect(page.locator('#verdict')).toHaveText(tr('res.owned', { n: 8 }));
  await expect(page.locator('#priceSummary')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await bottom('#verdict')).toBeLessThanOrEqual(667);
  expect(await bottom('#cardRows tr', 2)).toBeLessThanOrEqual(667);
  await ctx.close();
});

test('tier list su iPhone SE (375×667): schede orizzontali, "Tier 1" e 2 archetipi interi nel primo schermo', async ({ browser, baseURL, isMobile }, info) => {
  test.skip(!isMobile, 'obiettivo misurato su mobile');
  // dati reali (decks-61.json committato), carattere Arial come nel test del primo schermo
  const ctx = await browser.newContext({ ...info.project.use, baseURL, viewport: { width: 375, height: 667 }, bypassCSP: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('pauper-index:welcomeClosed', '1'));
  await setup(page);
  await page.click('#navDecks');
  const cards = page.locator('.tier-sec.t1 .fam-card');
  await expect(cards.nth(1)).toBeVisible();
  await page.addStyleTag({ content: 'body, body *:not(.brand) { font-family: Arial, "Liberation Sans", sans-serif !important; }' });
  // una sola riga introduttiva; il link sul tier accanto al primo titolo
  await expect(page.locator('.tier-lead')).toBeHidden();
  await expect(page.locator('.decks-lead')).toBeHidden();
  await expect(page.locator('#dNoColl .nc-short')).toBeVisible();
  expect((await page.locator('#dNoColl').boundingBox())!.height).toBeLessThanOrEqual(30);
  await expect(page.locator('.tier-sec.t1 .tier-what')).toBeVisible();
  await expect(page.locator('.tier-what')).toHaveCount(1);
  expect(await page.locator('.tier-sec.t1 .tier-head').evaluate((e) => e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(667);
  expect(await cards.nth(1).evaluate((e) => e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(667);
  // illustrazione a sinistra, larga 112 px e 4:3, con l'artista visibile sotto ogni immagine
  for (const i of [0, 1]) {
    const img = (await cards.nth(i).locator('.fam-art img').boundingBox())!;
    const body = (await cards.nth(i).locator('.fam-body').boundingBox())!;
    expect(Math.round(img.width)).toBe(112);
    expect(Math.round(img.height)).toBe(84);
    expect(body.x).toBeGreaterThan(img.x + img.width - 1);
    await expect(cards.nth(i).locator('.fam-artist .fa-short')).toBeVisible();
    const artist = (await cards.nth(i).locator('.fam-artist').boundingBox())!;
    expect(artist.y).toBeGreaterThanOrEqual(img.y + img.height - 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await ctx.close();
});

test('righe compatte su mobile, filtri su una riga, "Ultima apparizione" nel pannello con la sua etichetta', async ({ page, isMobile }) => {
  await setup(page);
  const row = page.locator('#cardRows tr').first();
  if (isMobile) {
    // righe: nome e dati essenziali in chiaro; le colonne della tabella non si vedono
    await expect(row.locator('.mline')).toBeVisible();
    await expect(row.locator('.mline')).toContainText(tr('row.share', { pct: '' }).trim()); // "dei mazzi"
    await expect(row.locator('.mline')).toContainText(tr('row.typical', { n: 9 }).split('9')[0].trim()); // "di solito"
    await expect(row.locator('.mline2')).toContainText(head('row.entry'));
    await expect(row.locator('td.c-qty')).toBeHidden();
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(90);
    // filtri su una riga, senza etichette visibili ma con il nome accessibile
    expect((await page.locator('#filters').boundingBox())!.height).toBeLessThanOrEqual(64);
    await expect(page.locator('#period')).toHaveAccessibleName(new RegExp(tr('filters.period')));
    await expect(page.locator('#setInput')).toHaveAccessibleName(tr('set.label'));
    // suggerimenti dell'espansione larghi quanto la barra (non quanto il campo, che è stretto)
    await page.locator('#setInput').click();
    await expect(page.locator('#setList')).toBeVisible(); // sets.json arriva al primo uso
    const list = (await page.locator('#setList').boundingBox())!;
    const bar = (await page.locator('#filters').boundingBox())!;
    expect(list.width).toBeGreaterThanOrEqual(bar.width - 2);
    await page.locator('#setInput').press('Escape');
    // con la collezione: "ne hai N" invece delle copie tipiche
    await uploadCollection(page);
    await expect(page.locator('#cardRows tr').first().locator('.mline')).toContainText(head('row.owned'));
  } else {
    await expect(row.locator('.mline')).toBeHidden();
    await expect(row.locator('td.c-qty')).toBeVisible();
  }
  // "Ultima apparizione": nel pannello, con l'etichetta rimovibile e il conteggio in "Filtri (N)"
  await expect(page.locator('.res-tools #seenFilter')).toHaveCount(0);
  await setSeen(page, 'old');
  const chip = page.locator('#activeFilters .fchip', { hasText: tr('seen.old') });
  await expect(chip).toBeVisible();
  await expect(page.locator('#filtersBtnText')).toHaveText(tr('filters.moreN', { n: 1 }));
  await chip.click();
  await expect(page.locator('#activeFilters')).toBeHidden();
  await page.click('#filtersBtn');
  await expect(page.locator('#seenFilter')).toHaveValue('all');
  await page.selectOption('#seenFilter', 'recent');
  await page.click('#fpClear');
  await expect(page.locator('#seenFilter')).toHaveValue('all');
});

test('testata con prefers-reduced-motion: il libro cambia stato senza animazione', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  for (const el of ['.book-cover', '#navDecks']) {
    expect(await page.locator(el).evaluate((e) => getComputedStyle(e).transitionDuration)).toMatch(/^0s/);
  }
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
    await setSeen(page, 'old');
    await typeSearch(page, 'bolt');
    await navClick(page, section);
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

test('"Rimuovi collezione": via subito, Annulla per 8 secondi, poi cancellata davvero; le preferenze restano', async ({ page, isMobile }) => {
  test.setTimeout(45000);
  await setup(page);
  await uploadCollection(page);
  // gruppi salvati nel browser (IndexedDB)
  const saved = () => page.evaluate(() => new Promise<number>((res) => {
    const r = indexedDB.open('pauper-index');
    r.onsuccess = () => {
      const g = r.result.transaction('kv').objectStore('kv').get('state');
      g.onsuccess = () => { res(g.result?.groups?.length ?? 0); r.result.close(); };
    };
  }));
  await expect.poll(saved).toBeGreaterThan(0);
  await page.selectOption('#period', '3'); // preferenza: resta
  await setSeen(page, 'old'); // filtri dell'elenco: ripartono azzerati
  await typeSearch(page, 'bolt');
  const rm = page.locator('#removeColl');
  await expect(rm).toHaveAccessibleName(tr('load.remove'));
  expect((await rm.boundingBox())!.height).toBeGreaterThanOrEqual(isMobile ? 44 : 34); // area di tocco
  await rm.click();
  // nessuna conferma: la collezione sparisce subito e si riapre l'area di caricamento
  await expect(page.locator('#loaded')).toBeHidden();
  await expect(page.locator('#loadArea')).toBeVisible();
  const bar = page.locator('#undoBar');
  await expect(bar).toHaveAttribute('role', 'status'); // annunciato dai lettori di schermo
  await expect(bar).toContainText(tr('load.removed'));
  await expect(page.locator('#undoRemove')).toBeFocused(); // raggiungibile subito da tastiera
  await expect(page.locator('#seenFilter')).toHaveValue('all');
  await expect(page.locator('#search')).toHaveValue('');
  await expect(page.locator('#period')).toHaveValue('3');
  expect(await saved()).toBeGreaterThan(0); // finché si può annullare, i dati restano nel browser
  // Annulla (da tastiera) ripristina tutto com'era
  await page.keyboard.press('Enter');
  await expect(bar).toBeHidden();
  await expect(page.locator('#loaded')).toContainText(tr('load.collection').trim());
  await expect(page.locator('#seenFilter')).toHaveValue('old');
  await expect(page.locator('#search')).toHaveValue('bolt');
  // di nuovo, lasciando scadere il messaggio: la collezione viene cancellata davvero
  await page.locator('#removeColl').click();
  await expect(bar).toBeVisible();
  await expect(bar).toBeHidden({ timeout: 10000 });
  await expect.poll(saved).toBe(0);
  await page.reload();
  await expect(page.locator('#dataline')).toContainText(head('data.line'));
  await expect(page.locator('#loadArea')).toBeVisible();
  await expect(page.locator('#loaded')).toBeHidden();
  await expect(page.locator('#period')).toHaveValue('3');
});

test('visita successiva: preferenze ricordate (periodo, espansione), filtri che nascondono carte azzerati', async ({ page }) => {
  await setup(page);
  await uploadCollection(page);
  await page.selectOption('#period', '3');
  await pickSet(page, 'ice age', 'Ice Age');
  await page.locator('label:has(#setOwned)').click();
  await setSeen(page, 'old');
  await typeSearch(page, 'storm');
  await page.reload();
  await expect(page.locator('#dataline')).toContainText(head('data.line'));
  // preferenze: collezione, periodo ed espansione restano
  await expect(page.locator('#loaded')).toContainText(tr('load.collection').trim());
  await expect(page.locator('#period')).toHaveValue('3');
  await expect(page.locator('#setWrap')).toHaveClass(/has-set/);
  await expect(page.locator('#setInput')).toHaveValue(/Ice Age/);
  // filtri che nascondono carte: azzerati
  await expect(page.locator('#seenFilter')).toHaveValue('all');
  await expect(page.locator('#search')).toHaveValue('');
  await expect(page.locator('#setOwned')).not.toBeChecked();
  await expect(page.locator('#filterNote')).toBeHidden();
  // togliere l'espansione: la visita successiva parte senza
  await page.locator('#setInput').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('#dataline')).toContainText(head('data.line'));
  await expect(page.locator('#setWrap')).not.toHaveClass(/has-set/);
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
  await typeSearch(page, 'lightning bolt');
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
  await typeSearch(page, '');
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
  // letti tutti insieme: un ridisegno a metà lettura (per esempio all'arrivo dei nomi italiani) darebbe numeri misti
  const raw = await page.evaluate(() => {
    const text = (id: string) => {
      const el = document.getElementById(id) as HTMLElement;
      return el.hidden ? null : el.innerText;
    };
    return { head: text('verdict') || '', shown: text('shownCount'), note: text('filterNote') };
  });
  return { head: num(raw.head), list: raw.shown ? num(raw.shown, 1) : 0, note: raw.note ? num(raw.note) : null };
}

test('riepilogo ed elenco: stesso insieme, e i filtri che nascondono carte sono dichiarati', async ({ page, isMobile }) => {
  await setup(page);
  // il caso segnalato: Edge of Eternities, storico, "non viste da oltre 6 mesi" (ricordato nel browser)
  await pickSet(page, 'edge of eternities', 'Edge of Eternities');
  await page.selectOption('#period', '3');
  let c = await counts(page);
  expect(c.note).toBeNull();
  expect(c.list).toBe(c.head);
  // il menu Periodo conta le carte dell'espansione, come il riepilogo
  // (su mobile le voci mostrano solo il periodo: il numero è nel titolo subito sotto)
  if (!isMobile) await expect(page.locator('#period option:checked')).toContainText(c.head.toLocaleString(L === 'it' ? 'it-IT' : 'en-US'));
  else await expect(page.locator('#period option:checked')).toHaveText(tr('period.3'));
  await setSeen(page, 'old');
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
  await typeSearch(page, 'a');
  c = await counts(page);
  expect(c.note).toBe(c.list);
  await expect(page.locator('#filterNote')).toContainText(tr('why.search', { q: 'a' }));
  await typeSearch(page, '');

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

test('"Carica altri": si parte da 10, poi 100 alla volta con quelle che restano, focus sulla prima aggiunta, ripartenza da 10', async ({ page }) => {
  await setup(page);
  const rows = page.locator('#cardRows tr');
  await expect(page.locator('#verdict')).toHaveText(/\d/); // il titolo si scrive subito dopo la riga dei dati
  const total = (await page.locator('#verdict').innerText()).replace(/[.,]/g, '').match(/\d+/)![0];
  const fmt = (x: number) => x.toLocaleString(L === 'it' ? 'it-IT' : 'en-US');
  await expect(rows).toHaveCount(10);
  const firstByShare = await page.locator('#cardRows .nm').nth(0).innerText();
  // "Carica altre 100 · ne restano N"
  await expect(page.locator('#more')).toHaveText(tr('res.moreN', { n: 100, left: fmt(Number(total) - 10) }));
  await page.locator('#more').focus();
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(110);
  await expect(page.locator('#shownCount')).toHaveText(tr('res.shown', { n: 110, total: fmt(Number(total)) }));
  await expect(page.locator('#more')).toHaveText(tr('res.moreN', { n: 100, left: fmt(Number(total) - 110) }));
  // il focus è sulla prima carta aggiunta, e la scheda non si apre da sola
  await expect(page.locator('#cardRows .cardbtn').nth(10)).toBeFocused();
  await expect(page.locator('#sheet')).toBeHidden();
  // l'ordinamento lavora sulla lista completa e riparte da 10
  await page.selectOption('#sort', 'name');
  await expect(rows).toHaveCount(10);
  await expect(page.locator('#shownCount')).toHaveText(tr('res.shown', { n: 10, total: fmt(Number(total)) }));
  expect(await page.locator('#cardRows .nm').nth(0).innerText()).not.toBe(firstByShare);
  // meno di 100 rimaste: "Carica le ultime N"
  await typeSearch(page, 'blast');
  const n = Number((await page.locator('#shownCount').innerText()).replace(/[.,]/g, '').match(/\d+\D+(\d+)/)![1]);
  if (n > 10 && n <= 110) await expect(page.locator('#more')).toHaveText(n - 10 === 1 ? tr('res.moreOne') : tr('res.moreLast', { n: n - 10 }));
  // la ricerca filtra la lista completa, non solo le carte visibili
  await typeSearch(page, 'pyroblast');
  await expect(rows).toHaveCount(1);
  await expect(page.locator('#more')).toBeHidden();
  await expect(page.locator('#shownCount')).toHaveText(tr('res.shown', { n: 1, total: 1 }));
});

test('"Carta dimenticata": soglia dei mazzi storici, conteggio, pulsante disattivato con il motivo, mai salvata', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // pesche immediate
  await setup(page);
  await page.click('#navDust');
  const min = page.locator('#dustMin');
  const count = page.locator('#dustMinCount');
  const btn = page.locator('#dustBtn');
  const num = async () => Number((await count.innerText()).replace(/[.,\s]/g, '').match(/\d+/)![0]);
  await expect(min).toHaveValue('20');
  await expect(min).toHaveAccessibleName(new RegExp(tr('dust.minLabel')));
  await expect(count).toContainText(head('dust.minCount'));
  const at20 = await num();
  await min.fill('10');
  await expect.poll(num).toBeGreaterThan(at20);
  // soglia troppo alta: nessuna carta, pulsante disattivato con il motivo
  await min.fill('99999');
  await expect(count).toHaveText(tr('dust.minNone', { min: (99999).toLocaleString(L === 'it' ? 'it-IT' : 'en-US') }));
  await expect(btn).toBeDisabled();
  await expect(page.locator('#dustResult .dust-stage')).toBeDisabled(); // anche la cornice vuota
  // soglia alta ma possibile: la carta pescata ha almeno quei mazzi nello storico
  await min.fill('50');
  await expect(btn).toBeEnabled();
  const at50 = await num();
  expect(at50).toBeLessThan(at20);
  await btn.click();
  const title = page.locator('#dustTitle');
  await expect(title).toBeVisible();
  const first = (await title.innerText()).trim();
  const decks = Number((await page.locator('#dustResult .dust-info p').first().innerText()).replace(/[.,]/g, '').match(/\d+/)![0]);
  expect(decks).toBeGreaterThanOrEqual(50);
  // cambiando soglia la carta già vista non torna (nessuna ripetizione nella sessione)
  await min.fill('10');
  const seen = [first];
  for (let k = 0; k < 4; k++) {
    await btn.click();
    const name = (await title.innerText()).trim();
    expect(seen).not.toContain(name);
    seen.push(name);
  }
  // mai salvata: alla visita successiva riparte da 20
  await page.reload();
  await page.click('#navDust');
  await expect(min).toHaveValue('20');
});

test('"Carta dimenticata": soglia con la collezione, conteggio delle tue carte e "Pesca tra tutte le carte"', async ({ page }) => {
  await setup(page);
  await uploadCollection(page);
  await page.click('#navDust');
  const count = page.locator('#dustMinCount');
  const mine = (await count.innerText()).trim();
  // la collezione sintetica può non avere carte dimenticate: conteggio delle tue, oppure il motivo
  const ownedTail = tr('dust.minCountOwned', { n: 2 }).replace(/^2\s*/, ''); // "delle tue carte da pescare"
  expect(mine.endsWith(ownedTail) || mine === tr('dust.minNoneOwned', { min: 20 })).toBe(true);
  await page.locator('#dustAll').check();
  await expect(count).toContainText(head('dust.minCount'));
  await expect(page.locator('#dustBtn')).toBeEnabled();
});

test('"Carta dimenticata": pagina dalla testata, scena, animazione che poi sparisce, niente ripetizioni', async ({ page }) => {
  const problems = await setup(page);
  // non è più nella zona del controllo rapido
  await expect(page.locator('#quick #dustBtn')).toHaveCount(0);
  await expect(page.locator('#navDust')).toHaveAccessibleName(tr('nav.dust'));
  // nella testata è un pulsante compatto (pieno di colore, con icona e ragnatela), "Informazioni" un link discreto
  await expect(page.locator('#navDust .nd-ico')).toHaveCount(1);
  await expect(page.locator('#navDust .nd-web .cw')).toHaveCount(1);
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
  expect(await res.locator('img.card-cur').evaluate((el) => getComputedStyle(el).filter)).toBe('none');
  await expect(res.locator('.dust-cover')).toHaveCount(0, { timeout: 5000 });
  const names = new Set([await page.locator('#dustTitle').innerText()]);
  for (let i = 0; i < 4; i++) {
    const before = await page.locator('#dustTitle').innerText();
    await page.click('#dustBtn');
    // alla pressione le ragnatele del pulsante vengono spazzate via, poi compare la carta nuova
    await expect(page.locator('#dustTitle')).not.toHaveText(before);
    names.add(await page.locator('#dustTitle').innerText());
    await expect(res.locator('.dust-cover')).toHaveCount(0); // fine della sequenza (una pressione durante salta alla fine)
  }
  expect(names.size).toBe(5);
  // con la collezione compare l'interruttore; se nessuna tua carta è dimenticata lo si dice (prima non compariva nulla)
  await page.goto('./');
  await uploadCollection(page);
  await page.click('#navDust');
  await expect(page.locator('#dustAllWrap')).toBeVisible();
  if (await page.locator('#dustBtn').isDisabled()) {
    // nessuna tua carta è dimenticata: pulsante disattivato con il motivo; "Pesca tra tutte le carte" lo riattiva
    await expect(page.locator('#dustMinCount')).toHaveText(tr('dust.minNoneOwned', { min: 20 }));
    await page.locator('#dustAllWrap').click();
    await expect(page.locator('#dustBtn')).toBeEnabled();
  }
  await page.click('#dustBtn');
  const scene = page.locator('#dustResult .dust-scene');
  await expect(scene.locator('img.card-cur')).toBeVisible();
  expect(problems).toEqual([]);
});

test('"Carta dimenticata" con prefers-reduced-motion: la carta appare subito, senza copertura', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  // la ragnatela del pulsante in testata resta ferma al passaggio del mouse
  await page.hover('#navDust');
  expect(await page.locator('#navDust .cw-corner').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await page.click('#navDust');
  // ragnatele del pulsante ferme anche al passaggio del mouse
  await page.hover('#dustBtn');
  for (const el of await page.locator('#dustBtn .cw-corner, #dustResult .cw-corner').all()) {
    expect(await el.evaluate((x) => getComputedStyle(x).animationName)).toBe('none');
  }
  await page.click('#dustBtn');
  await expect(page.locator('#dustResult .dust-scene img.card-cur')).toBeVisible();
  await expect(page.locator('#dustResult .dust-stage:not(.dust-empty) .dust-cover')).toHaveCount(0);
  await expect(page.locator('#dustBtn')).not.toHaveClass(/sweep/);
  // carta in 3D disattivata: il puntatore e il dito non la muovono
  const stage = page.locator('#dustResult .dust-stage:not(.dust-empty)');
  await expect(stage).not.toHaveClass(/tilt/);
  const b = (await stage.boundingBox())!;
  await stage.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 3, isPrimary: true, clientX: b.x + 5, clientY: b.y + 5, bubbles: true });
  await stage.dispatchEvent('pointermove', { pointerType: 'touch', pointerId: 3, isPrimary: true, clientX: b.x + 5, clientY: b.y + 5, bubbles: true });
  await page.waitForTimeout(300);
  expect(await stage.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
});

test('"Carta dimenticata": ragnatele generate e mosse appena; carta in 3D che torna piatta', async ({ page, isMobile }) => {
  await setup(page);
  await page.click('#navDust');
  // ragnatele generate (diverse a ogni pesca), con un'oscillazione a riposo
  await expect(page.locator('#dustResult .dust-empty .cw .cw-corner')).toHaveCount(3);
  expect(await page.locator('#dustResult .cw-corner').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('cw-sway');
  await expect(page.locator('#dustBtn .bweb .cw')).toHaveCount(3);
  await page.click('#dustBtn');
  const stage = page.locator('#dustResult .dust-stage.tilt');
  await expect(stage).toHaveCount(1, { timeout: 6000 }); // si attiva alla fine della spazzata
  await expect(page.locator('#dustResult .dust-cover')).toHaveCount(0);
  const transform = () => stage.evaluate((el) => getComputedStyle(el).transform);
  expect(await transform()).toBe('none'); // a riposo è piatta
  // l'immagine non ha mai filtri né livelli sopra: la profondità viene solo dall'ombra
  for (const im of await stage.locator('img').all()) expect(await im.evaluate((el) => getComputedStyle(el).filter)).toBe('none');
  await expect(stage.locator(':scope > :not(img):not([hidden])')).toHaveCount(0);
  const b = (await stage.boundingBox())!;
  if (!isMobile) {
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.move(b.x + b.width * 0.9, b.y + b.height * 0.1, { steps: 4 });
    await expect.poll(transform).not.toBe('none');
    // inclinazione massima di circa 10 gradi su ciascun asse
    const angles = (await stage.evaluate((el) => el.style.transform)).match(/-?\d+(\.\d+)?(?=deg)/g)!.map(Number);
    expect(angles).toHaveLength(2);
    for (const a of angles) expect(Math.abs(a)).toBeLessThanOrEqual(10);
    expect(Math.max(...angles.map(Math.abs))).toBeGreaterThan(3);
    await page.mouse.move(2, 2); // il cursore esce: torna piatta
    await expect.poll(transform, { timeout: 3000 }).toBe('none');
  }
  // al tocco: segue il dito finché è appoggiato e torna piatta al rilascio
  const touch = { pointerType: 'touch', pointerId: 9, isPrimary: true, clientX: b.x + 10, clientY: b.y + b.height - 10, bubbles: true };
  await stage.dispatchEvent('pointerdown', touch);
  await stage.dispatchEvent('pointermove', touch);
  await expect.poll(transform).not.toBe('none');
  await stage.dispatchEvent('pointerup', touch);
  await expect.poll(transform, { timeout: 3000 }).toBe('none');
});

test('"Carta dimenticata": passaggio fluido, animazioni entro 1 s, carta successiva precaricata, nuova pressione salta alla fine', async ({ page, isMobile }) => {
  const normal: string[] = [];
  page.on('request', (r) => { if (r.url().startsWith('https://cards.scryfall.io/normal/')) normal.push(r.url()); });
  await setup(page);
  await page.click('#navDust');
  const stage = page.locator('#dustResult .dust-stage');
  const size = async () => { const b = (await stage.boundingBox())!; return [Math.round(b.width), Math.round(b.height), Math.round(b.x)]; };
  const empty = await size();
  // durata: le animazioni dichiarate (ritardo + durata) stanno entro 1 s e la sequenza arriva alla fine. Niente tempo
  // a orologio, che dipende dal carico della macchina: la misura reale è in scripts/dust-perf.mjs
  await page.evaluate(() => {
    const w = window as unknown as { dustAnims: { name: string; end: number; inf: boolean }[] };
    w.dustAnims = [];
    document.addEventListener('animationstart', (ev) => {
      const el = ev.target as Element;
      if (!el.closest('#dustResult')) return;
      const a = el.getAnimations().find((x) => (x as CSSAnimation).animationName === ev.animationName);
      const tm = a?.effect?.getComputedTiming();
      if (tm) w.dustAnims.push({ name: ev.animationName, end: Number(tm.endTime), inf: tm.iterations === Infinity });
    }, true);
  });
  await page.click('#dustBtn');
  await expect(page.locator('#dustResult img.card-cur')).toHaveCount(1);
  await expect(page.locator('#dustResult .dust-cover')).toHaveCount(0, { timeout: 10_000 });
  const anims = (await page.evaluate(() => (window as unknown as { dustAnims: { name: string; end: number; inf: boolean }[] }).dustAnims))
    .filter((a) => !a.inf);
  const names = new Set(anims.map((a) => a.name));
  for (const n of ['card-in', 'film-off', 'dust-fly', 'cw-tear']) expect(names, n).toContain(n);
  for (const a of anims) expect(a.end, a.name).toBeLessThanOrEqual(1000);
  // dimensioni e posizione della cornice fisse: nessun salto tra cornice vuota e carta
  expect(await size()).toEqual(empty);
  // la carta successiva è già scaricata mentre si guarda quella attuale
  const shown = await page.locator('#dustResult img.card-cur').getAttribute('src');
  await expect.poll(() => normal.filter((u) => u.split('?')[0] !== shown).length).toBeGreaterThan(0);
  const preloaded = normal.filter((u) => u !== shown);
  const title = await page.locator('#dustTitle').innerText();
  // inclinazione 3D: torna piatta dolcemente alla nuova pesca ed è disattivata durante l'animazione
  if (!isMobile) {
    const b = (await stage.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.move(b.x + b.width * 0.9, b.y + b.height * 0.1, { steps: 4 });
    await expect.poll(() => stage.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
  }
  await page.locator('#dustBtn').focus();
  await page.keyboard.press('Enter');
  // la carta vecchia non sparisce di colpo: per un momento ci sono entrambe, in dissolvenza
  await expect(page.locator('#dustResult img.card-out')).toHaveCount(1);
  await expect(page.locator('#dustResult img.card-in')).toHaveCount(1);
  // una nuova pressione durante l'animazione salta subito alla fine (nessun accumulo): verificato nello stesso
  // momento della pressione, non con un tempo d'attesa
  const jump = await page.evaluate(() => {
    const q = (s: string) => document.querySelectorAll(s).length;
    const before = q('#dustResult .dust-cover');
    (document.getElementById('dustBtn') as HTMLButtonElement).click();
    return { before, after: q('#dustResult .dust-cover'), fading: q('#dustResult img.card-in, #dustResult img.card-out') };
  });
  expect(jump).toEqual({ before: 1, after: 0, fading: 0 });
  await expect(page.locator('#dustResult img.card-cur')).toHaveCount(1);
  await expect(page.locator('#dustTitle')).not.toHaveText(title);
  // la carta mostrata è quella precaricata
  expect(preloaded).toContain(await page.locator('#dustResult img.card-cur').getAttribute('src'));
  await expect.poll(() => stage.evaluate((el) => getComputedStyle(el).transform), { timeout: 3000 }).toBe('none');
  expect(await size()).toEqual(empty);
});

/** Porta la carta i in alto nella finestra: la scheda della carta i + 1 si apre sotto, la carta i resta libera. */
async function hoverPair(page: Page, i: number) {
  const cards = page.locator('#cardRows .cardbtn');
  await expect(cards.nth(i + 1)).toBeVisible();
  await cards.nth(i).evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 120));
  const center = async (k: number) => {
    const b = (await cards.nth(k).boundingBox())!;
    return [b.x + b.width / 2, b.y + b.height / 2] as const;
  };
  return { above: await center(i), below: await center(i + 1), names: [await cards.nth(i).locator('.nm').textContent(), await cards.nth(i + 1).locator('.nm').textContent()] };
}

test('scheda al passaggio del mouse: si apre dopo una breve sosta, cambia carta senza chiudersi, si chiude uscendo', async ({ page, isMobile }) => {
  test.skip(isMobile, 'solo con il mouse');
  await setup(page);
  const sheet = page.locator('#sheet');
  const { above, below, names } = await hoverPair(page, 2);
  await page.mouse.move(5, 5);
  await page.mouse.move(...below);
  await expect(sheet).toBeVisible({ timeout: 1000 });
  await expect(sheet).toHaveClass(/sheet-in/); // comparsa breve
  await expect(page.locator('#sheetTitle')).toContainText(names[1]!);
  // da una carta all'altra: il contenuto cambia, la scheda non si chiude mai
  await sheet.evaluate((el) => {
    (window as unknown as { __hid: boolean }).__hid = false;
    new MutationObserver(() => { if (el.hidden) (window as unknown as { __hid: boolean }).__hid = true; }).observe(el, { attributes: true });
  });
  await page.mouse.move(...above, { steps: 4 });
  await expect(page.locator('#sheetTitle')).toContainText(names[0]!, { timeout: 300 });
  expect(await page.evaluate(() => (window as unknown as { __hid: boolean }).__hid)).toBe(false);
  // dalla carta alla scheda: resta aperta
  const sb = (await sheet.boundingBox())!;
  await page.mouse.move(sb.x + 40, sb.y + 40, { steps: 3 });
  await page.waitForTimeout(300);
  await expect(sheet).toBeVisible();
  // fuori dalla carta e dalla scheda: si chiude subito, con una dissolvenza breve
  await page.mouse.move(sb.x + sb.width + 20, sb.y + sb.height + 40);
  await expect(sheet).toBeHidden({ timeout: 400 });
});

test('scheda: non si apre quando l’elenco sale sotto il mouse fermo (Esc sul pannello "Filtri")', async ({ page, isMobile }) => {
  test.skip(isMobile, 'solo con il mouse');
  await setup(page);
  const sheet = page.locator('#sheet');
  // il punto dove sta la prima carta a pannello chiuso: con il pannello aperto lì c'è il pannello
  const b = (await page.locator('#cardRows .cardbtn').first().boundingBox())!;
  const x = Math.round(b.x + 20);
  const y = Math.round(b.y + b.height / 2);
  await page.click('#filtersBtn');
  await expect(page.locator('#fpanel')).toBeVisible();
  await page.mouse.move(x, y);
  expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('#fpanel'), [x, y])).toBe(true);
  // Esc: il pannello si chiude e l'elenco sale sotto il cursore fermo
  await page.keyboard.press('Escape');
  await expect(page.locator('#fpanel')).toBeHidden();
  expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('#cardRows .cardbtn'), [x, y])).toBe(true);
  await page.waitForTimeout(500);
  await expect(sheet).toBeHidden();
  // un movimento reale sopra la carta la apre
  await page.mouse.move(x + 3, y);
  await expect(sheet).toBeVisible({ timeout: 1000 });
});

test('scheda al passaggio del mouse con prefers-reduced-motion: nessuna animazione', async ({ page, isMobile }) => {
  test.skip(isMobile, 'solo con il mouse');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  const sheet = page.locator('#sheet');
  const { below } = await hoverPair(page, 2);
  await page.mouse.move(5, 5);
  await page.mouse.move(...below);
  await expect(sheet).toBeVisible({ timeout: 1000 });
  await expect(sheet).not.toHaveClass(/sheet-in/);
  expect(await sheet.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await page.mouse.move(5, 5);
  await expect(sheet).toBeHidden({ timeout: 300 });
});

/** prices.json sintetico allineato ai dati reali: prezzi solo per Brainstorm (ICE #61 1 €, FRC #39 foil 7 €). */
function syntheticPrices(): string {
  const data = resolve(HERE, '../../data');
  const cards = JSON.parse(readFileSync(resolve(data, 'cards.json'), 'utf-8')) as { c: { n: string }[] };
  const prints = JSON.parse(readFileSync(resolve(data, 'printings.json'), 'utf-8')) as { p: [string, string, string][][] };
  const bs = cards.c.findIndex((c) => c.n === 'Brainstorm');
  const p = prints.p.map((list, i) => list.flatMap((pr) => {
    if (i !== bs) return [0, 0];
    if (pr[1] === 'ice' && pr[2] === '61') return [100, 0];
    if (pr[1] === 'frc' && pr[2] === '39') return [300, 700];
    return [50, 0];
  }));
  return JSON.stringify({ v: 1, date: '2026-10-07', p });
}

test('lista incollata: carte e copie nella riga della collezione, valore "almeno" con la stampa più economica', async ({ page }) => {
  const eur = (c: number) => (c / 100).toLocaleString(L === 'it' ? 'it-IT' : 'en-US', { style: 'currency', currency: 'EUR' });
  await page.route('**/data/prices.json', (r) => r.fulfill({ contentType: 'application/json', body: syntheticPrices() }));
  await setup(page);
  await page.click('#pasteToggle');
  await page.fill('#pasteText', '4 Brainstorm\n2 Counterspell');
  await page.click('#pasteAdd');
  await expect(page.locator('#loaded')).toContainText(tr('load.cardsCopies', { cards: tr('load.cards', { n: 2 }), copies: tr('load.copies', { n: 6 }) }));
  await expect(page.locator('#verdict')).toHaveText(tr('res.owned', { n: 2 }));
  // Brainstorm senza printing: 4 × 0,50 € (la stampa non foil più economica); Counterspell senza alcun prezzo
  const sum = page.locator('#priceSummary');
  await expect(sum).toContainText(tr('price.ownedMin', { v: eur(200) }));
  await expect(sum).toContainText(tr('price.estimated', { n: 1 }));
  await expect(sum).toContainText(tr('price.unpriced', { n: 1 }));
  await expect(sum).not.toContainText(tr('price.owned', { v: eur(0) }));
  // la colonna Prezzo usa la stessa stima ("da X €"), non "—"
  await expect(page.locator('#cardRows tr').filter({ hasText: 'Brainstorm' }).first().locator('.c-price')).toHaveText(tr('price.from', { p: eur(50) }));
});

test('prezzi indicativi: colonna, riepilogo, scheda e Informazioni; "—" se mancano', async ({ page }) => {
  const eur = (c: number) => (c / 100).toLocaleString(L === 'it' ? 'it-IT' : 'en-US', { style: 'currency', currency: 'EUR' });
  await page.route('**/data/prices.json', (r) => r.fulfill({ contentType: 'application/json', body: syntheticPrices() }));
  const problems = await setup(page);
  // senza collezione: la stampa più economica, "da X €"; riepilogo di una copia di ciascuna
  await typeSearch(page, 'brainstorm');
  const row = page.locator('#cardRows tr').filter({ hasText: 'Brainstorm' }).first();
  await expect(row.locator('.c-price')).toHaveText(tr('price.from', { p: eur(50) }));
  await expect(page.locator('#priceSummary')).toContainText(head('price.list'));
  await typeSearch(page, '');
  await uploadCollection(page);
  // posseduta: la printing di valore più alto (qui la foil)
  await expect(page.locator('#cardRows tr').filter({ hasText: 'Brainstorm' }).first().locator('.c-price')).toHaveText(eur(700));
  await expect(page.locator('#cardRows tr').filter({ hasText: 'Counterspell' }).first().locator('.c-price')).toHaveText('—');
  // tutte le copie: 4 × 1 € + 7 € foil; le altre possedute non hanno prezzo
  await expect(page.locator('#priceSummary')).toContainText(tr('price.owned', { v: eur(1100) }));
  await expect(page.locator('#priceSummary')).toContainText(head('price.unpriced'));
  // scheda: prezzo sotto ogni printing del ventaglio e dettaglio delle printing possedute
  await typeSearch(page, 'brainstorm');
  await page.locator('#cardRows .cardbtn').first().focus();
  await page.keyboard.press('Enter');
  const sheet = page.locator('#sheet');
  await expect(sheet).toBeVisible();
  expect(await sheet.locator('.fan-price').count()).toBe(await sheet.locator('.fan-item').count());
  await expect(sheet.locator('dl')).toContainText(tr('sheet.price'));
  await expect(sheet.locator('.yourprices')).toContainText(eur(700));
  await expect(sheet.locator('.yourprices')).toContainText(eur(100));
  await page.keyboard.press('Escape');
  // Informazioni: una sola frase nelle domande frequenti
  await page.goto('./#informazioni');
  await expect(page.locator('#viewAbout')).toContainText(tr('about.faq.prices.q'));
  expect(problems).toEqual([]);
});

test('prezzi assenti (file mancante): "—" e nessun riepilogo, senza errori', async ({ page }) => {
  await page.route('**/data/prices.json', (r) => r.fulfill({ status: 404, body: '' }));
  const problems = await setup(page);
  await uploadCollection(page);
  await expect(page.locator('#cardRows .c-price').first()).toHaveText('—');
  await expect(page.locator('#priceSummary')).toBeHidden();
  expect(problems).toEqual([]);
});

/* ---------- filtri per colore, costo, tipo e testo ---------- */

const visibleNames = (page: Page) => page.locator('#cardRows .nm').allInnerTexts();

test('simboli di mana: pannello Filtri e Mazzi, dallo sprite del sito, con nome accessibile e spunta', async ({ page }) => {
  const sprite: number[] = [];
  page.on('response', (r) => { if (r.url().endsWith('/data/manasymbols.svg')) sprite.push(r.status()); });
  await setup(page);
  await page.click('#filtersBtn');
  // colori: simbolo decorativo e nome scritto accanto
  const blue = page.locator('#fpColors [data-v="U"]');
  await expect(blue).toHaveAccessibleName(tr('color.U'));
  await expect(blue.locator('svg.mana use')).toHaveAttribute('href', 'data/manasymbols.svg#U');
  await expect(blue.locator('svg.mana')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#fpColors [data-v="M"] use')).toHaveAttribute('href', 'data/manasymbols.svg#M');
  // costo: simboli {0}–{6} con il nome accessibile ("Costo 3", "Costo 6 o più")
  await expect(page.locator('#fpMv [data-v="3"]')).toHaveAccessibleName(tr('fp.mvBtn', { n: 3 }));
  await expect(page.locator('#fpMv [data-v="6"]')).toHaveAccessibleName(tr('fp.mvBtnMore', { n: 6 }));
  await expect(page.locator('#fpMv [data-v="0"] use')).toHaveAttribute('href', 'data/manasymbols.svg#N0');
  // premuto: spunta visibile, oltre ad aria-pressed e al colore
  await expect(blue.locator('.fcheck')).toBeHidden();
  await blue.click();
  await expect(blue).toHaveAttribute('aria-pressed', 'true');
  await expect(blue.locator('.fcheck')).toBeVisible();
  await expect(blue).toBeFocused();
  await blue.click();
  await expect(blue.locator('.fcheck')).toBeHidden();
  await page.keyboard.press('Escape');
  expect(sprite).toContain(200);
  // Mazzi: simboli dei colori, con il nome dei colori come testo alternativo del gruppo
  await page.route('**/data/decks-61.json', (r) => r.fulfill({ json: syntheticDecks() }));
  await page.click('#navDecks');
  const pips = page.locator('#tierSections .pips').first();
  await expect(pips).toHaveAttribute('role', 'img');
  await expect(pips).toHaveAttribute('aria-label', /.+/);
  expect(await pips.locator('svg.mana').count()).toBeGreaterThan(0);
  await expect(page.locator('#tierSections .cdot')).toHaveCount(0);
});

test('filtri: pannello, etichette rimovibili, nota, conteggio, testo scaricato solo al primo uso', async ({ page }, info) => {
  const problems = await setup(page);
  const texts: string[] = [];
  page.on('request', (r) => { if (/\/data\/(it)?texts\.json/.test(r.url())) texts.push(r.url().replace(/.*\/data\//, '')); });
  const mobile = info.project.name.startsWith('mobile');
  const btn = page.locator('#filtersBtn');
  await expect(btn).toHaveText(tr('filters.more'));
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#activeFilters')).toBeHidden();
  await page.selectOption('#period', '3');
  const all = await counts(page);

  await btn.click();
  const panel = page.locator('#fpanel');
  await expect(panel).toBeVisible();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  // su mobile il pannello si apre dal basso (modale), su desktop sotto la barra
  expect(await panel.evaluate((el) => el.matches(':modal'))).toBe(mobile);
  await expect(page.locator('#fpText')).toHaveAttribute('placeholder', tr('fp.textPh'));
  await expect(page.locator('label[for="fpText"]')).toHaveText(tr('fp.text'));
  await expect(page.locator('#fpTypes [data-v]').first()).toHaveText(tr('ftype.Creature'));

  // blu, costo 1, istantaneo: Brainstorm sì
  const blue = page.locator('#fpColors [data-v="U"]');
  await blue.click();
  await expect(blue).toHaveAttribute('aria-pressed', 'true');
  await expect(blue).toBeFocused(); // il pulsante premuto non perde il focus
  await page.click('#fpMv [data-v="1"]');
  await page.click('#fpTypes [data-v="Instant"]');
  await expect(btn).toHaveText(tr('filters.moreN', { n: 3 }));
  const c = await counts(page);
  expect(c.head).toBe(all.head); // il titolo conta l'insieme del periodo, come con la ricerca
  expect(c.note).toBe(c.list);
  expect(c.list).toBeLessThan(all.list);
  await expect(page.locator('#fpDone')).toHaveText(tr('fp.show', { n: c.list }));
  await expect(page.locator('#filterNote')).toContainText(tr('why.mv', { v: '1' }));
  await expect(page.locator('#filterNote')).toContainText(tr('why.type', { v: tr('ftype.Instant').toLocaleLowerCase(L) }));
  expect(await visibleNames(page)).toContain('Brainstorm');

  // testo delle regole: texts.json solo adesso
  expect(texts).toEqual([]);
  await page.fill('#fpText', 'PUT two cards');
  await expect(page.locator('#cardRows .nm').first()).toHaveText('Brainstorm');
  await expect(page.locator('#fpTextStatus')).toHaveText('');
  expect(texts.sort()).toEqual(['ittexts.json', 'texts.json']); // testo inglese e testo delle stampe italiane
  await expect(btn).toHaveText(tr('filters.moreN', { n: 4 }));
  // testo italiano (stampa italiana più recente di Brainstorm: "Pesca tre carte, poi…")
  await page.fill('#fpText', 'pesca tre carte');
  await expect(page.locator('#cardRows .nm').first()).toHaveText('Brainstorm');
  // senza tipo e costo: anche i sottotipi della riga del tipo
  await page.click('#fpTypes [data-v="Instant"]');
  await page.click('#fpMv [data-v="1"]');
  await page.fill('#fpText', 'faerie');
  await expect(page.locator('#cardRows .nm').first()).toBeVisible();
  await page.fill('#fpText', '');

  // chiusura: il focus torna sul pulsante; Esc chiude
  await page.click('#fpDone');
  await expect(panel).toBeHidden();
  await expect(btn).toBeFocused();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await btn.click();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  // etichette: una per colore; si tolgono una alla volta o tutte insieme
  const chips = page.locator('#activeFilters .fchip');
  await expect(chips).toHaveText([tr('color.U')]);
  await btn.click();
  await page.click('#fpColors [data-v="B"]');
  await page.click('#fpMv [data-v="2"]');
  await page.click('#fpMv [data-v="1"]');
  await page.click('#fpMv [data-v="6"]');
  await page.click('#fpDone');
  await expect(chips).toHaveText([tr('color.U'), tr('color.B'), tr('chip.mv', { v: '1–2, 6+' })]);
  await chips.nth(1).click();
  await expect(chips).toHaveText([tr('color.U'), tr('chip.mv', { v: '1–2, 6+' })]);
  await expect(chips.nth(0)).toHaveAttribute('aria-label', tr('chip.remove', { f: tr('color.U') }));
  // "solo questi colori": un'etichetta sola
  await btn.click();
  await page.locator('label:has(input[name="colorMode"][value="only"])').click();
  await page.click('#fpDone');
  await expect(chips).toHaveText([tr('chip.colorsOnly', { list: tr('color.U') }), tr('chip.mv', { v: '1–2, 6+' })]);
  await expect(page.locator('#filterNote')).toContainText(tr('why.colorOnly', { v: tr('color.U').toLocaleLowerCase(L) }));
  await page.locator('#activeFilters .linkbtn').click();
  await expect(page.locator('#activeFilters')).toBeHidden();
  await expect(page.locator('#filterNote')).toBeHidden();
  await expect(btn).toHaveText(tr('filters.more'));
  expect((await counts(page)).list).toBe(all.list);

  // "Togli questi filtri" nella nota toglie anche questi
  await btn.click();
  await page.click('#fpColors [data-v="C"]');
  await page.click('#fpDone');
  await expect(page.locator('#filterNote')).toBeVisible();
  await page.locator('#clearListFilters').click();
  await expect(page.locator('#activeFilters')).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
});

test('filtri: export di tutte le carte filtrate, vista per espansione, azzerati alla visita successiva', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setup(page);
  await uploadCollection(page);
  // possedute: Brainstorm, Counterspell, Delver, Tolarian Terror (blu), Lightning Bolt (rossa), Fire // Ice (blu e rossa)
  await page.click('#filtersBtn');
  await page.click('#fpColors [data-v="R"]');
  await page.click('#fpDone');
  await expect(page.locator('#activeFilters .fchip')).toHaveCount(1);
  expect((await visibleNames(page)).sort()).toEqual(['Fire // Ice', 'Lightning Bolt']);
  const clip = async () => (await page.evaluate(() => navigator.clipboard.readText())).split('\n').map((x) => x.trim()).filter(Boolean);
  await page.locator('#expDetails summary').click();
  await page.click('[data-copy="owned"]');
  expect((await clip()).sort()).toEqual(['1 Fire // Ice', '1 Lightning Bolt']);
  // le mancanti filtrate vanno nell'export anche se l'elenco non le mostra
  await page.click('[data-copy="missing"]');
  const missing = await clip();
  expect(missing.length).toBeGreaterThan(10); // più delle 10 righe di una pagina
  expect(missing).not.toContain('1 Brainstorm');
  expect(missing).not.toContain('1 Lightning Bolt');
  // "solo questi colori" con il rosso: via Fire // Ice
  await page.click('#filtersBtn');
  await page.locator('label:has(input[name="colorMode"][value="only"])').click();
  await page.click('#fpDone');
  await expect(page.locator('#cardRows .nm')).toHaveText(['Lightning Bolt']);

  // vista per espansione: il filtro si combina con l'espansione
  await pickSet(page, 'ice age', 'Ice Age');
  await expect(page.locator('#activeFilters .fchip')).toHaveCount(1);
  expect(await visibleNames(page)).not.toContain('Brainstorm');

  // visita successiva: azzerati (l'espansione, che è una preferenza, resta)
  await page.reload();
  await expect(page.locator('#dataline')).toContainText(head('data.line'));
  await expect(page.locator('#setWrap')).toHaveClass(/has-set/);
  await expect(page.locator('#activeFilters')).toBeHidden();
  await expect(page.locator('#filtersBtn')).toHaveText(tr('filters.more'));
  await expect(page.locator('#cardRows .nm', { hasText: 'Brainstorm' })).toHaveCount(1);
});

/* ---------- nomi italiani ---------- */

test('nomi italiani: controllo rapido, ricerca nell’elenco, scheda; file scaricati solo al primo uso', async ({ page }) => {
  const problems = await setup(page);
  const files: string[] = [];
  page.on('request', (r) => { if (/\/data\/itnames/.test(r.url())) files.push(r.url().replace(/.*\/data\//, '')); });
  await page.waitForTimeout(300);
  expect(files).toEqual([]);

  // ricerca nell'elenco: storico, nome italiano con apostrofo scritto in un altro modo e senza accenti
  await page.selectOption('#period', '3');
  await expect(page.locator('#search')).toHaveAttribute('placeholder', tr('search.placeholder'));
  await typeSearch(page, 'tempesta cerebr');
  await expect(page.locator('#cardRows .nm').first()).toHaveText('Brainstorm');
  // un solo campo: al primo uso servono anche i nomi delle carte mai giocate, per i suggerimenti
  await expect.poll(() => [...files].sort()).toEqual(['itnames-other.json', 'itnames.json']);
  await typeSearch(page, 'SORGENTE D’ICORE');
  await expect(page.locator('#cardRows .nm')).toHaveText(['Ichor Wellspring']);
  await typeSearch(page, 'sorgente dicore');
  await expect(page.locator('#cardRows .nm')).toHaveText(['Ichor Wellspring']);
  // carta mai stampata in italiano: si cerca con il nome inglese
  await typeSearch(page, 'fire // ice');
  await expect(page.locator('#cardRows .nm')).toHaveText(['Fire // Ice']);
  await typeSearch(page, '');

  // suggerimenti: "Fulmine (Lightning Bolt)"; anche le carte mai giocate
  const input = page.locator('#search');
  await input.fill('fulmine');
  const first = page.locator('#searchList [role="option"]').first();
  await expect(first).toHaveText('Fulmine (Lightning Bolt)');
  expect(files.sort()).toEqual(['itnames-other.json', 'itnames.json']);
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(input).toHaveValue('Fulmine'); // nell'elenco resta il nome cercato, che trova la carta
  await expect(page.locator('#sheetTitle')).toContainText('Lightning Bolt');
  await expect(page.locator('#sheetIt')).toHaveText('Fulmine'); // cercata in italiano: anche con l'interfaccia in inglese
  await page.keyboard.press('Escape');
  // nome esatto italiano: Invio apre la scheda; accenti e maiuscole non contano
  await input.fill('PRESCELTO DELL ANTENATA');
  await input.press('Enter');
  await expect(page.locator('#sheetTitle')).toContainText("Ancestor's Chosen");
  await expect(page.locator('#sheet')).toContainText(tr('quick.never'));
  await page.keyboard.press('Escape');

  // scheda: il nome italiano sotto quello inglese, solo con l'interfaccia in italiano
  await typeSearch(page, 'brainstorm');
  await page.locator('#cardRows .cardbtn').first().click();
  await expect(page.locator('#sheetTitle')).toContainText('Brainstorm');
  if (L === 'it') await expect(page.locator('#sheetIt')).toHaveText('Tempesta Cerebrale');
  else await expect(page.locator('#sheetIt')).toBeHidden();
  expect(problems).toEqual([]);
});

test('nomi italiani: la scheda in italiano li scarica alla prima apertura; senza file si cerca in inglese', async ({ page }) => {
  await page.route('**/data/itnames*.json', (r) => r.fulfill({ status: 404, body: '' }));
  const problems = await setup(page);
  await typeSearch(page, 'tempesta');
  await expect(page.locator('#cardRows')).toContainText(tr('res.noMatch'));
  await typeSearch(page, 'brainstorm');
  await expect(page.locator('#cardRows .nm').first()).toHaveText('Brainstorm');
  await page.locator('#search').fill('brainst');
  await expect(page.locator('#searchList [role="option"]').first()).toHaveText('Brainstorm');
  await page.locator('#search').press('Escape');
  await page.locator('#cardRows .cardbtn').first().click();
  await expect(page.locator('#sheetTitle')).toContainText('Brainstorm');
  await expect(page.locator('#sheetIt')).toBeHidden();
  expect(problems.filter((p) => !/itnames/.test(p))).toEqual([]);
});

test('nomi italiani: scheda aperta prima di ogni ricerca, interfaccia in italiano', async ({ page }) => {
  await setup(page);
  if (L !== 'it') await navClick(page, '[data-lang="it"]');
  await typeSearch(page, '');
  await page.locator('#cardRows .cardbtn').first().click();
  const name = (await page.locator('#sheetTitle').innerText()).trim();
  expect(name.length).toBeGreaterThan(0);
  await expect(page.locator('#sheetIt')).toBeVisible(); // arriva dopo il file, senza riaprire la scheda
});

/* ---------- Mazzi ---------- */

/** File dei mazzi sintetico, con gli indici delle carte vere di data/cards.json (i dati cambiano ogni giorno). */
function syntheticDecks(days = 61) {
  const cards: { n: string }[] = JSON.parse(readFileSync(resolve(HERE, '../../data/cards.json'), 'utf-8')).c;
  const ix = (n: string) => {
    const i = cards.findIndex((c) => c.n === n);
    if (i < 0) throw new Error(`carta assente: ${n}`);
    return i;
  };
  const [bs, cs, dv, tt, lb, fi, isl, mnt] = ['Brainstorm', 'Counterspell', 'Delver of Secrets // Insectile Aberration', 'Tolarian Terror',
    'Lightning Bolt', 'Fire // Ice', 'Island', 'Mountain'].map(ix);
  const fillers = Array.from({ length: 12 }, () => ['xU', 'U', [bs, 1, isl, 59], [], [[2026080100, 30]]]);
  return {
    v: 2, days, anchor: '2026-10-04', basics: [isl, mnt],
    t: {
      2026100400: ['2026-10-04', 'Pauper Challenge 32', 'https://www.mtgo.com/decklist/sintetico-1', 'm'],
      2026092000: ['2026-09-20', 'Pauper League', 'https://www.mtgo.com/decklist/sintetico-2', 'm'],
      2026091000: ['2026-09-10', 'Torneo locale', 'https://melee.gg/Tournament/View/1', 'p'],
      2026090500: ['2026-09-05', 'Torneo di settembre', 'https://melee.gg/Tournament/View/3', 'p'],
      2026080100: ['2026-08-01', 'Torneo vecchio', 'https://melee.gg/Tournament/View/2', 'p'],
    },
    a: {
      c1: ['Mono-Blue Terror', 'U', 'c', 'c1'], c1R: ['Izzet Terror', 'UR', 'c', 'c1'],
      a2: ['Lightning Bolt + Fire // Ice', 'R', 'a', 'a2'], xU: ['', 'U', 'x'],
    },
    // famiglie: [nome, tier, quota in punti base, carta simbolo, lista tipica]
    f: { c1: ['Terror', 1, 625, tt, 0], a2: ['Lightning Bolt + Fire // Ice', 4, 60, lb, 1] },
    l: [
      ['c1', 'U', [bs, 4, cs, 4, dv, 4, tt, 4, isl, 44], [fi, 2], [[2026092000, '5-0'], [2026091000, 2]]],
      ['a2', 'R', [lb, 4, fi, 4, mnt, 52], [], [[2026100400, 7]]],
      ['c1', 'U', [bs, 4, isl, 56], [], [[2026091000, 1], [2026080100, 3]]],
      ['c1R', 'UR', [bs, 4, tt, 4, lb, 4, isl, 48], [], [[2026090500, 5]]],
      ...fillers,
    ],
  };
}

async function mockDecks(page: Page): Promise<{ year: number }> {
  const calls = { year: 0 };
  await page.route('**/data/decks-61.json', (r) => r.fulfill({ json: syntheticDecks() }));
  await page.route('**/data/decks-365.json', (r) => {
    calls.year++;
    return r.fulfill({ json: syntheticDecks(365) });
  });
  return calls;
}

const first = (lang: Lang, n: number) => (lang === 'it' ? `${n}°` : `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : 'th'}`);

test('mazzi senza collezione: tier list, pagina dell\'archetipo con le varianti, non classificate, decklist ed export', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const calls = await mockDecks(page);
  const problems = await setup(page);
  await expect(page.locator('#navDecks')).toHaveText(tr('nav.decks'));
  await page.click('#navDecks');
  await expect(page.locator('#navDecks')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#viewMain')).toBeHidden();
  // tier list: un archetipo in Tier 1 (scheda con l'illustrazione), uno tra gli "Altri" (riga), le non classificate in fondo
  await expect(page.locator('#tVerdict')).toHaveText(tr('tier.verdict', { n: 2 }));
  await expect(page.locator('#dResults')).toBeHidden();
  const card = page.locator('.tier-sec.t1 .fam-card');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.fam-name')).toHaveText('Terror');
  await expect(card.locator('.fam-art img')).toHaveAttribute('src', /\/art_crop\//);
  // artista sotto l'immagine (mai sopra) e la riga del copyright visibile
  await expect(card.locator('.fam-artist')).toContainText('Tolarian Terror');
  await expect(page.locator('#dTier > .artcredit')).toHaveText(tr('tier.copyright'));
  await expect(card.locator('.fam-vars')).toContainText('Mono-Blue');
  await expect(card.locator('.fam-vars')).toContainText('Izzet');
  await expect(page.locator('.tier-sec.t4 .fam-row')).toHaveCount(1);
  await expect(page.locator('.tier-sec.t4 .fam-art')).toHaveCount(0);
  await expect(page.locator('.fam-unclassified a')).toHaveAttribute('href', '#mazzi/x');
  // pagina dell'archetipo: intestazione, varianti, liste per ultima apparizione
  await card.click();
  await expect(page).toHaveURL(/#mazzi\/c1$/);
  await expect(page.locator('#navDecks')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#dArchHead .arch-name')).toContainText('Terror');
  await expect(page.locator('#dArchHead .tier-badge')).toHaveText(tr('tier.n', { n: 1 }));
  await expect(page.locator('#dArchHead .artcredit')).toHaveText(tr('tier.copyright'));
  await expect(page.locator('#dVerdict')).toHaveText(tr('decks.verdict', { n: 3 }));
  await expect(page.locator('#dSub')).toContainText(tr('decks.sortLast'));
  await expect(page.locator('#dNoColl')).toBeVisible();
  await expect(page.locator('#dMinWrap')).toBeHidden();
  await expect(page.locator('#dSideWrap')).toBeHidden();
  await expect(page.locator('#deckList .dk')).toHaveCount(3);
  await expect(page.locator('#deckList .dk-comp')).toHaveCount(0);
  const top = page.locator('#deckList .dk').first();
  await expect(top.locator('.dk-name')).toHaveText('Mono-Blue Terror');
  await expect(top).toContainText(tr('decks.times', { n: 2 }));
  await expect(top.locator('.dk-best a')).toHaveAttribute('href', 'https://melee.gg/Tournament/View/1');
  await expect(top.locator('.dk-best b')).toHaveText(first(L, 2));
  // variante: la nota dice perché se ne vedono meno, "Togli questi filtri" la toglie
  await expect(page.locator('#dArchWrap')).toBeVisible();
  await expect(page.locator('#dArch option').first()).toHaveText(tr('decks.variantAll', { n: 2 }));
  await page.selectOption('#dArch', 'c1R');
  await expect(page.locator('#deckList .dk')).toHaveCount(1);
  await expect(page.locator('#dVerdict')).toHaveText(tr('decks.verdict', { n: 3 }));
  await expect(page.locator('#dNote')).toContainText(tr('decks.filtered', { n: 1, why: tr('decks.whyVariant', { v: 'Izzet Terror' }) }));
  await page.click('#dClear');
  await expect(page.locator('#deckList .dk')).toHaveCount(3);
  await expect(page.locator('#dNote')).toBeHidden();
  // decklist per tipo, con il side; export nel formato di MTG Arena
  await top.locator('.dk-list summary').click();
  await expect(top.locator('.dk-side h5')).toHaveText(`${tr('decks.sideboard')} (2)`);
  await expect(top.locator('.dk-sec h5').first()).toHaveText(`${tr('decks.sec.creature')} (8)`);
  await top.locator('[data-dcopy="deck"]').click();
  const clip = (await page.evaluate(() => navigator.clipboard.readText())).split('\n').map((x) => x.trimEnd());
  // nomi come in MTG Arena: Delver (transform) solo con la prima faccia, Fire // Ice (split) completa
  expect(clip.slice(0, 8)).toEqual(['4 Brainstorm', '4 Counterspell', '4 Delver of Secrets', '4 Tolarian Terror',
    '44 Island', '', 'Sideboard', '2 Fire // Ice']);
  const dl = page.waitForEvent('download');
  await top.locator('[data-dsave="deck"]').click();
  expect((await dl).suggestedFilename()).toBe(tr('decks.fileDeck', { name: 'mono-blue-terror' }));
  // il nome di una carta apre la scheda
  await top.locator('.dk-sec .dk-card').first().click();
  await expect(page.locator('#sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  // ultimo anno: scaricato solo su richiesta
  expect(calls.year).toBe(0);
  await page.selectOption('#dPeriod', '365');
  await expect(page.locator('#dSub')).toContainText(head('decks.sub365'));
  expect(calls.year).toBe(1);
  // ritorno alla tier list con il link e con "indietro"
  await page.click('.arch-back');
  await expect(page.locator('#tierSections .fam-card')).toHaveCount(1);
  await expect(page.locator('#dArchHead')).toBeHidden();
  await page.goBack();
  await expect(page.locator('#dArchHead .arch-name')).toContainText('Terror');
  await page.goBack();
  await expect(page.locator('#tierSections')).toBeVisible();
  // liste non classificate: una pagina come quella di un archetipo; 10, poi 20 alla volta
  await page.click('.fam-unclassified a');
  await expect(page.locator('#dArchHead .arch-name')).toHaveText(tr('arch.unclassified'));
  await expect(page.locator('#dArchWrap')).toBeHidden(); // un solo gruppo di colori
  await expect(page.locator('#deckList .dk')).toHaveCount(10);
  await expect(page.locator('#dShown')).toHaveText(tr('decks.shown', { n: 10, total: 12 }));
  await expect(page.locator('#dMore')).toHaveText(tr('decks.moreLast', { n: 2 }));
  await page.click('#dMore');
  await expect(page.locator('#deckList .dk')).toHaveCount(12);
  await expect(page.locator('#dMore')).toBeHidden();
  await expect(page.locator('#deckList .dk-name').nth(10)).toBeFocused();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
});

test('tier list: filtri per colore, tier e prezzo, nota coerente, prezzi in arrivo, vai all\'archetipo', async ({ page }, info) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/data/prices.json', async (route) => {
    await gate;
    await route.fulfill({ contentType: 'application/json', body: syntheticPrices() });
  });
  await mockDecks(page);
  const problems = await setup(page);
  await page.goto('./#mazzi');
  await expect(page.locator('#tierSections .fam-card')).toHaveCount(1);
  // su mobile i filtri partono chiusi
  const box = page.locator('#tfBox');
  if (info.project.name.startsWith('mobile')) {
    expect(await box.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    await box.locator('summary').click();
  }
  // prezzo: disattivato finché i prezzi non arrivano, poi "Prezzo della lista tipica" (senza collezione)
  await expect(page.locator('#tfPrice')).toBeDisabled();
  await expect(page.locator('#tfPrice option').first()).toHaveText(tr('tier.pricePending'));
  release();
  await expect(page.locator('#tfPrice')).toBeEnabled();
  await expect(page.locator('#tfPriceLabel')).toHaveText(tr('tier.priceList'));
  await expect(page.locator('.fam-card .fam-price')).toContainText(head('tier.typicalPrice'));
  // simboli di mana grandi almeno 18 px; stato premuto con la spunta, non solo con il colore
  const pip = page.locator('.fam-card .pips svg.mana').first();
  expect((await pip.boundingBox())!.width).toBeGreaterThanOrEqual(18);
  const red = page.locator('#tfColors [data-v="R"]');
  await expect(red.locator('.fcheck')).toBeHidden();
  await red.click();
  await expect(red).toHaveAttribute('aria-pressed', 'true');
  await expect(red.locator('.fcheck')).toBeVisible();
  // "almeno uno": Terror resta per la variante Izzet; le non classificate spariscono
  await expect(page.locator('#tierSections .fam-card')).toHaveCount(1);
  await expect(page.locator('#tierSections .fam-row')).toHaveCount(1);
  await expect(page.locator('.fam-unclassified')).toHaveCount(0);
  await expect(page.locator('#tfCount')).toHaveText(' (1)');
  // "solo questi colori": resta solo l'archetipo rosso; il titolo conta tutti, la nota dice perché se ne vedono meno
  await page.locator('input[name="tColorMode"][value="only"]').check({ force: true });
  await expect(page.locator('#tierSections .fam-card')).toHaveCount(0);
  await expect(page.locator('#tierSections .fam-row')).toHaveCount(1);
  await expect(page.locator('#tVerdict')).toHaveText(tr('tier.verdict', { n: 2 }));
  await expect(page.locator('#tNote')).toContainText(tr('tier.filtered', { n: 1, total: 2, why: tr('why.colorOnly', { v: tr('color.R').toLocaleLowerCase(L) }) }));
  await page.click('#tClear');
  await expect(page.locator('#tNote')).toBeHidden();
  await expect(page.locator('.fam-unclassified')).toHaveCount(1);
  await expect(page.locator('#tfCount')).toHaveText('');
  // tier
  await page.click('#tfTiers [data-v="4"]');
  await expect(page.locator('#tierSections .fam-card')).toHaveCount(0);
  await expect(page.locator('#tierSections .fam-row')).toHaveCount(1);
  await page.click('#tClear');
  // prezzo della lista tipica: Terror costa 2 € (solo Brainstorm ha un prezzo), entrambe sotto i 50 €
  await page.selectOption('#tfPrice', '50');
  await expect(page.locator('#tierSections .fam-card')).toHaveCount(1);
  await expect(page.locator('#tNote')).toBeVisible();
  await page.click('#tClear');
  // vai all'archetipo
  await page.selectOption('#tfGoto', 'a2');
  await expect(page).toHaveURL(/#mazzi\/a2$/);
  await expect(page.locator('#dArchHead .arch-name')).toContainText('Lightning Bolt + Fire // Ice');
  await expect(page.locator('#dArchHead .tier-badge')).toHaveText(tr('tier.others'));
  await expect(page.locator('#dArchWrap')).toBeHidden(); // una sola variante
  await expect(page.locator('#dPriceLabel')).toHaveText(tr('tier.priceListOne'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
});

test('mazzi con la collezione: lista più vicina nella tier list, completamento, mancanti, solo main, minimo, già completo', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockDecks(page);
  // in CI data/prices.json non esiste (si genera alla pubblicazione): senza prezzi il filtro del prezzo resta disattivato
  await page.route('**/data/prices.json', (r) => r.fulfill({ contentType: 'application/json', body: syntheticPrices() }));
  const problems = await setup(page);
  await uploadCollection(page);
  await page.click('#navDecks');
  // tier list: completamento della lista più vicina; prezzo = costo per completare
  await expect(page.locator('#tSub')).toContainText(tr('tier.subColl', { n: 1 }));
  await expect(page.locator('.fam-card .fam-comp')).toBeVisible();
  await expect(page.locator('#tfPriceLabel')).toHaveText(tr('tier.priceMissing'));
  await expect(page.locator('#tfMinWrap')).not.toHaveAttribute('hidden'); // su mobile il riquadro dei filtri è chiuso
  await expect(page.locator('#tfPrice')).toBeEnabled();
  await page.goto('./#mazzi/c1');
  await expect(page.locator('#dSub')).toContainText(tr('decks.sortComp'));
  await expect(page.locator('#dSub')).toContainText(tr('decks.fullN', { n: 1 }));
  await expect(page.locator('#dNoColl')).toBeHidden();
  await expect(page.locator('#dPriceLabel')).toHaveText(tr('tier.priceMissingOne'));
  // per completamento: prima la completa
  const top = page.locator('#deckList .dk').first();
  await expect(top.locator('.dk-best b')).toHaveText(first(L, 1));
  await expect(top).toContainText(tr('decks.complete'));
  await page.selectOption('#dMin', '1');
  await expect(page.locator('#deckList .dk')).toHaveCount(1);
  await expect(page.locator('#dNote')).toContainText(tr('decks.whyFull'));
  await page.selectOption('#dMin', '0');
  // "già completo": solo le liste complete, anche se alle altre mancano solo carte senza prezzo
  await page.selectOption('#dPrice', '0');
  await expect(page.locator('#deckList .dk')).toHaveCount(1);
  await expect(page.locator('#dNote')).toContainText(tr('tier.whyDone'));
  await page.click('#dClear');
  await page.selectOption('#dArch', 'c1');
  const deck = page.locator('#deckList .dk').nth(1);
  // Tolarian Terror è un proxy (non contato): mancano 4 Tolarian Terror, 2 Counterspell e 1 Delver; il side c'è
  await expect(deck.locator('.dk-cnt')).toHaveText(tr('decks.have', { have: 11, need: 18 }));
  await expect(deck.locator('.dk-mhead b')).toHaveText(tr('decks.missing', { n: 7 }));
  await deck.locator('[data-dcopy="missing"]').click();
  const clip = (await page.evaluate(() => navigator.clipboard.readText())).split('\n').map((x) => x.trimEnd()).filter(Boolean);
  // stessi nomi della decklist: Delver (transform) solo con la prima faccia
  expect(clip).toEqual(['4 Tolarian Terror', '2 Counterspell', '1 Delver of Secrets']);
  await deck.locator('.dk-list summary').click();
  await expect(deck.locator('.dk-sec li.miss')).toContainText('Tolarian Terror');
  await expect(deck.locator('.dk-sec li.part', { hasText: 'Counterspell' })).toContainText(tr('decks.missCopies', { n: 2 }));
  await expect(deck.locator('.dk-sec li.have').first()).toContainText('Brainstorm');
  // solo main: il side non conta
  await page.locator('#dSideWrap label').first().click();
  await expect(deck.locator('.dk-cnt')).toHaveText(tr('decks.have', { have: 9, need: 16 }));
  // la scelta main/side resta (anche nella tier list), i filtri no
  await page.reload();
  await expect(page.locator('#deckList .dk').first()).toBeVisible();
  await expect(page.locator('#dSideWrap input[value="main"]')).toBeChecked();
  await expect(page.locator('#dArch')).toHaveValue('');
  await page.click('.arch-back');
  await expect(page.locator('input[name="tSide"][value="main"]')).toBeChecked();
  expect(problems).toEqual([]);
});

test('mazzi: i prezzi in arrivo non tolgono il focus, non chiudono le decklist e non ricaricano dopo un errore', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/data/prices.json', async (route) => {
    await gate;
    await route.continue();
  });
  await page.route('**/data/decks-61.json', (r) => r.fulfill({ json: syntheticDecks() }));
  await setup(page);
  await page.goto('./#mazzi/x');
  await expect(page.locator('#deckList .dk')).toHaveCount(10);
  await page.click('#dMore');
  const name = page.locator('#deckList .dk-name').nth(10);
  await expect(name).toBeFocused();
  const second = page.locator('#deckList .dk').nth(1);
  await second.locator('.dk-list summary').click();
  await name.focus();
  const prices = page.waitForResponse('**/data/prices.json');
  release();
  await prices;
  await page.waitForTimeout(300); // il ridisegno all'arrivo dei prezzi
  await expect(page.locator('#deckList .dk-name').nth(10)).toBeFocused();
  await expect(page.locator('#deckList .dk').nth(1).locator('details.dk-list')).toHaveAttribute('open', '');
});

test('mazzi: dopo un errore il messaggio e "Riprova" restano anche quando arrivano i prezzi', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/data/prices.json', async (route) => {
    await gate;
    await route.continue();
  });
  let calls = 0;
  await page.route('**/data/decks-61.json', (r) => { calls++; return r.fulfill({ status: 404, body: '' }); });
  await setup(page);
  await page.goto('./#mazzi');
  await expect(page.locator('#dStatus')).toContainText(tr('decks.error'));
  const retry = await page.locator('#dRetry').elementHandle();
  const prices = page.waitForResponse('**/data/prices.json');
  release();
  await prices;
  await page.waitForTimeout(200);
  expect(await retry!.evaluate((el) => el.isConnected)).toBe(true);
  expect(calls).toBe(1);
});

test('mazzi: file non disponibile, messaggio e Riprova', async ({ page }) => {
  let fail = true;
  await page.route('**/data/decks-61.json', (r) => (fail ? r.fulfill({ status: 404, body: '' }) : r.fulfill({ json: syntheticDecks() })));
  await setup(page);
  await page.goto('./#mazzi');
  await expect(page.locator('#dStatus')).toContainText(tr('decks.error'));
  await expect(page.locator('#dResults')).toBeHidden();
  fail = false;
  await page.click('#dRetry');
  await expect(page.locator('#tierSections .fam-card')).toHaveCount(1);
  await expect(page.locator('#dStatus')).toBeHidden();
});

/* ---------- Debutti ---------- */

const DEBUTS = JSON.parse(readFileSync(resolve(HERE, '../../data/debuts.json'), 'utf-8'));
const debAge = (iso: string) => (Date.parse(DEBUTS.anchor) - Date.parse(iso)) / 864e5;
const debIn = (days: number) => DEBUTS.c.filter((r: { f: string; u?: string }) => debAge(r.u || r.f) <= days);

async function openDebuts(page: Page): Promise<void> {
  await page.evaluate(() => { location.hash = '#debutti'; });
  await expect(page.locator('.deb-card').first()).toBeVisible();
}

test('debutti: file scaricato solo all\'apertura, 90 giorni, categorie, analisi, scheda e "In osservazione"', async ({ page }) => {
  const problems = await setup(page);
  const reqs: string[] = [];
  page.on('request', (r) => { if (r.url().includes('debuts.json')) reqs.push(r.url()); });
  await page.waitForTimeout(300);
  expect(reqs).toEqual([]);
  await openDebuts(page);
  const n90 = debIn(90).length;
  await expect(page.locator('#debPeriod')).toHaveValue('90');
  await expect(page.locator('.deb-card')).toHaveCount(n90);
  await expect(page.locator('#debCount')).toHaveText(tr('deb.count', { n: n90, days: 90 }));
  expect(reqs).toHaveLength(1);
  // periodo: 30 giorni
  await page.selectOption('#debPeriod', '30');
  await expect(page.locator('.deb-card')).toHaveCount(debIn(30).length);
  await page.selectOption('#debPeriod', '90');
  // categoria: solo le appena legali
  const legal = debIn(90).filter((r: { k: string }) => r.k === 'l').length;
  await page.selectOption('#debKind', 'l');
  await expect(page.locator('.deb-card')).toHaveCount(legal);
  for (const b of await page.locator('.deb-card .deb-badge:not(.week)').all()) await expect(b).toHaveText(tr('deb.badge.l'));
  await page.selectOption('#debKind', '');
  // analisi della prima carta (la più giocata)
  const first = page.locator('.deb-card').first();
  await first.locator('.deb-an summary').click();
  await expect(first.locator('.deb-sec h4').first()).toHaveText(tr('deb.a.archs'));
  await expect(first.locator('.deb-weeks')).toBeVisible();
  await expect(first.locator('.deb-weeks')).toHaveAttribute('aria-label', new RegExp(head('deb.a.weeksAlt')));
  for (const a of await first.locator('.deb-best a').all()) {
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  }
  // la carta apre la scheda del sito
  const name = await first.locator('.deb-title').innerText();
  await first.locator('.deb-title').click();
  await expect(page.locator('#sheetTitle')).toContainText(name);
  await page.keyboard.press('Escape');
  // in osservazione: chiusa, con il numero delle carte del periodo e il motivo
  const watch = page.locator('#debWatch');
  const w90 = DEBUTS.o.filter((o: [number, string, string]) => debAge(o[2]) <= 90);
  await expect(watch).not.toHaveAttribute('open', '');
  await expect(watch.locator('summary')).toHaveText(tr('deb.watch', { n: w90.length, decks: DEBUTS.minDecks, players: DEBUTS.minPlayers }));
  await watch.locator('summary').click();
  await expect(watch.locator('li')).toHaveCount(w90.length);
  await expect(watch.locator('li b').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
});

test('debutti con la collezione: possesso, prezzo e "Solo quelle che possiedi"', async ({ page }) => {
  await setup(page);
  await uploadCollection(page);
  await openDebuts(page);
  await expect(page.locator('#debOwnedWrap')).toBeVisible();
  await expect(page.locator('.deb-own')).toHaveCount(debIn(90).length);
  await page.check('#debOwned');
  const owned = await page.locator('.deb-card').count();
  if (owned === 0) await expect(page.locator('#debNone')).toBeVisible();
  else await expect(page.locator('.deb-own.yes')).toHaveCount(owned);
});

test('debutti: file non disponibile, messaggio e Riprova', async ({ page }) => {
  await setup(page);
  await page.route('**/data/debuts.json', (r) => r.fulfill({ status: 404, body: '' }));
  await page.evaluate(() => { location.hash = '#debutti'; });
  await expect(page.locator('#debStatus')).toContainText(tr('deb.error'));
  await page.unroute('**/data/debuts.json');
  await page.click('#debRetry');
  await expect(page.locator('.deb-card').first()).toBeVisible();
  await expect(page.locator('#debStatus')).toBeHidden();
});

test('debutti su iPhone SE (375×667): titolo e 2 carte intere nel primo schermo', async ({ browser, baseURL, isMobile }, info) => {
  test.skip(!isMobile, 'obiettivo misurato su mobile');
  const ctx = await browser.newContext({ ...info.project.use, baseURL, viewport: { width: 375, height: 667 }, bypassCSP: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('pauper-index:welcomeClosed', '1'));
  await setup(page);
  await openDebuts(page);
  await page.addStyleTag({ content: 'body, body *:not(.brand) { font-family: Arial, "Liberation Sans", sans-serif !important; }' });
  await expect(page.locator('#debHeading')).toBeInViewport();
  const cards = page.locator('.deb-card');
  for (const i of [0, 1]) expect(await cards.nth(i).evaluate((e) => e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(667);
  // immagine della carta intera (con artista e copyright stampati), mai ritagliata
  const img = (await cards.first().locator('.deb-img img').boundingBox())!;
  expect(Math.abs(img.height / img.width - 204 / 146)).toBeLessThan(0.02);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await ctx.close();
});
