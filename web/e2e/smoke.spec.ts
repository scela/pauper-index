import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIX = resolve(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+P9/PQAJpAPq4u1pTwAAAABJRU5ErkJggg==', 'base64');
const FCP = "Ce l'ho? Pauper is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.";

async function setup(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|reviews\/index\.json|404/.test(m.text())) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(String(e)));
  // niente richieste vere al CDN di Scryfall durante i test
  await page.route('https://cards.scryfall.io/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
  await page.goto('./');
  await expect(page.locator('#banner')).toContainText('Dati al');
  return problems;
}

async function uploadCollection(page: Page): Promise<void> {
  await page.setInputFiles('#files', resolve(FIX, 'collezione-sintetica.csv'));
  await expect(page.locator('#importSummary')).toContainText('collezione-sintetica.csv');
}

test('carica dati, preset e lista integrata senza errori, con CSP', async ({ page }) => {
  const problems = await setup(page);
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await expect(page.locator('#presets .preset')).toHaveCount(4);
  await expect(page.locator('#presets input:checked')).toHaveValue('1');
  await expect(page.locator('#verdict')).toContainText('La lista contiene');
  await expect(page.locator('#cardRows tr')).toHaveCount(100);
  await expect(page.locator('#more')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
});

test('export CSV ManaBox: ruoli, stato, proxy, riepilogo ed export', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const problems = await setup(page);
  await uploadCollection(page);
  const groups = page.locator('#groupRows tr');
  await expect(groups).toHaveCount(4);
  await expect(page.locator('#groupRows input[value="skip"]:checked')).toHaveCount(2); // deck e list esclusi
  await expect(page.locator('#importSummary')).toContainText('mai giocate in Pauper'); // Black Lotus
  await expect(page.locator('#verdict')).toContainText('Possiedi');

  await page.fill('#search', 'brainstorm');
  const row = page.locator('#cardRows tr').first();
  await expect(row).toContainText('Posseduta');
  await expect(row.locator('.c-qty')).toHaveText('5');
  await expect(row.locator('img.thumb.owned')).toHaveCount(2);

  await page.fill('#search', 'tolarian terror');
  await expect(page.locator('#cardRows tr').first()).toContainText('Mancante'); // proxy non conta
  await page.locator('#optProxyWrap').click();
  await expect(page.locator('#cardRows tr').first()).toContainText('Posseduta');

  await page.fill('#search', 'kor skyfisher');
  await expect(page.locator('#cardRows tr').first()).toContainText('Mancante'); // il mazzo è "Ignora"

  await page.click('[data-copy="owned"]');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toMatch(/^1 /m);
  expect(clip).toContain('1 Brainstorm');
  const dl = page.waitForEvent('download');
  await page.click('[data-save="csv"]');
  const file = await dl;
  expect(file.suggestedFilename()).toBe('list-riallineata.csv');
  const csv = readFileSync(await file.path(), 'utf-8');
  expect(csv.split('\r\n')[0]).toBe('Name,Set code,Collector number,Foil,Language,Scryfall ID,Quantity');
  expect(csv).toContain('Brainstorm,ICE,61,normal,en,8d42d7aa-7f53-4cfc-842a-086aab2448d1,1');
  expect(problems).toEqual([]);
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
  const items = sheet.locator('.fan-item');
  expect(await items.count()).toBeLessThanOrEqual(7);
  await expect(sheet.locator('.fan-item.owned').first()).toBeVisible();
  await expect(sheet.locator('.tag')).toBeVisible(); // "Tua"
  await expect(sheet).toContainText('Ultima su');
  // la carta attiva è interamente visibile
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
});

test('testo incollato: riepilogo, non riconosciute, nessun Binder', async ({ page }) => {
  await setup(page);
  await page.fill('#pasteText', readFileSync(resolve(FIX, 'testo-sintetico.txt'), 'utf-8'));
  await page.click('#pasteAdd');
  const sum = page.locator('#importSummary');
  await expect(sum).toContainText('Con il testo non ci sono Binder');
  await expect(sum).toContainText('1 non riconosciute');
  await expect(sum).toContainText('mai giocate in Pauper');
  await sum.locator('summary').click();
  await expect(sum).toContainText('Carta Che Non Esiste');
  await expect(page.locator('#groupRows tr')).toHaveCount(1);
  await page.fill('#search', 'fire // ice');
  const row = page.locator('#cardRows tr').first();
  await expect(row).toContainText('Posseduta');
  await expect(row).toContainText('MH2 #290 foil');
  // CSV incollato come testo: riconosciuto come file
  await page.fill('#pasteText', 'Name,Quantity,Binder Name\nGush,1,Incollato\n');
  await page.click('#pasteAdd');
  await expect(page.locator('#groupRows')).toContainText('Incollato');
});

test('CSV malevolo: nessuno script eseguito, testo mostrato alla lettera', async ({ page }) => {
  await setup(page);
  await page.setInputFiles('#files', resolve(FIX, 'malevolo.csv'));
  await expect(page.locator('#groupRows')).toContainText('<script>window.__xss=1</script>');
  await page.locator('#importSummary summary').click();
  await expect(page.locator('#importSummary')).toContainText('<img src=x onerror="window.__xss=1">');
  await page.mouse.move(10, 10);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(await page.locator('#groupRows img, #groupRows script, #importSummary img').count()).toBe(0);
});

test('Informazioni: avviso Fan Content Policy esatto e privacy', async ({ page }) => {
  await setup(page);
  await page.click('#navAbout');
  await expect(page.locator('#fcp')).toHaveText(FCP);
  await expect(page.locator('#viewAbout')).toContainText('Nessun account, nessun cookie, nessuna analytics');
  await expect(page.locator('#viewAbout')).toContainText('primi 32 mazzi');
  await expect(page.locator('footer')).toContainText(FCP);
  await page.click('#viewAbout a[href="#"]');
  await expect(page.locator('#viewMain')).toBeVisible();
});

test('persistenza e "Cancella i miei dati"', async ({ page }) => {
  await setup(page);
  await uploadCollection(page);
  await page.waitForTimeout(400); // salvataggio differito
  await page.reload();
  await expect(page.locator('#groupRows tr')).toHaveCount(4);
  await page.click('#clearData');
  await page.click('#clearData');
  await expect(page.locator('#assign')).toBeHidden();
  await page.reload();
  await expect(page.locator('#banner')).toContainText('Dati al');
  await expect(page.locator('#assign')).toBeHidden();
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('celho:')));
  expect(keys).toEqual([]);
});
