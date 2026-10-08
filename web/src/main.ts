import './style.css';

import {
  compute, deckShare, DEFAULT_OPTS, defaultRole, presetCounts, summarize, typicalCopies,
  type ImportSummary, type Opts, type Result,
} from './lib/compare';
import { detectLang, fmtDateTime, getLang, setLang, t, type Key, type Lang } from './i18n';
import { baseName, looksLikeCSV, readTable } from './lib/csv';
import { imageUrl, loadData, loadPrices, type Data } from './lib/data';
import { $, h, svg } from './lib/dom';
import { realignedCSV, textList } from './lib/exports';
import { daysBetween, fmtDate, fmtEur, fmtInt, fmtPct, fmtPrint } from './lib/format';
import { cheapestPrice, ownedPrice, priceTotals, printPrice, type PricesFile } from './lib/prices';
import { clearAll, idbGet, idbSet, lsDel, lsGet, lsSet } from './lib/store';
import { parseTextList } from './lib/text';
import type { Group, Role, Row } from './lib/types';
import { collectionIndex, type CollectionIndex, type Owned } from './lib/quick';
import { buildGroups, displayPrint, iconOf, memberCodes, printsInSets, rarityHere, type SetGroup, type SetRow } from './lib/sets';
import { setIcon } from './ui/seticon';
import { restrictToSet, shownNote, visible, type ListFilters, type Seen } from './lib/view';
import { availableTypes, emptyFilters, haystacks, isActive, mvLabel, textWords, type CardFilters } from './lib/cardfilter';
import { clearFilters, colorLabel, initFilterPanel, typeLabel } from './ui/filterpanel';
import { italianLoaded, loadItalian, nameHays } from './lib/italian';
import { renderAbout } from './ui/about';
import { initSetPicker } from './ui/setpicker';
import { initDust } from './ui/dust';
import { initDecks } from './ui/decks';
import { initQuick } from './ui/quick';
import { cancelClose, closeSheet, HOVER_OPEN_MS, isHoverBlocked, isOpenFor, isWarm, openSheet, recentlyClosed, renderGrid, scheduleClose, setSheetItalian, unblockHover } from './ui/sheet';

// Elenchi di carte: 10 alla volta; filtri, ordinamento, riepiloghi ed export lavorano sempre sulla lista completa
// (gli export: tutte le carte che rispettano i filtri attivi, non solo quelle mostrate).
const PAGE = 10;
const NEW_DAYS = 60;
const STALE_SOURCE_DAYS = 21;
const PASTED = '__pasted__'; // sorgente dei gruppi incollati: il nome si traduce quando viene mostrato
const periodLabel = (i: number) => t(`period.${i}` as Key);
const periodDesc = (i: number) => t(`periodDesc.${i}` as Key);

interface Saved {
  v: 2;
  groups: Group[];
  roles: Record<string, Role>;
  opts: Opts;
  showMissing?: boolean;
  savedAt: number;
}

interface SummaryItem {
  source: string;
  kind: 'csv' | 'text';
  s: ImportSummary;
}

const S = {
  d: null as Data | null,
  prices: null as PricesFile | null,
  groups: [] as Group[],
  roles: {} as Record<string, Role>,
  opts: { ...DEFAULT_OPTS } as Opts,
  showMissing: false,
  savedAt: null as number | null,
  query: '',
  // i filtri che nascondono carte (ultima apparizione, ricerca, "Solo quelle che possiedi") non si salvano mai
  seen: 'all' as Seen,
  // colore, costo di mana, tipo e testo delle regole (pannello "Filtri"): anche questi mai salvati
  cf: emptyFilters() as CardFilters,
  /** testo in cui cercare (riga del tipo e testo delle regole), da data/texts.json scaricato al primo uso */
  hay: null as string[] | null,
  types: [] as string[],
  /** per ogni carta, il testo in cui cercare il nome (inglese e italiani), quando i nomi italiani sono arrivati */
  names: null as string[] | null,
  sort: (lsGet('sort') as 'share' | 'name' | 'recent' | 'oldest') || 'share',
  results: [] as Result[],
  view: [] as Result[],
  shown: PAGE,
  summaries: [] as SummaryItem[],
  allNames: null as Set<string> | null,
  replacing: false,
  cix: null as CollectionIndex | null,
  // filtro per espansione
  setGroups: null as Map<string, SetGroup> | null,
  setRows: new Map<string, SetRow>(),
  setFilter: null as string | null,
  setCodes: null as Set<string> | null,
  setHidden: false,
  setOwned: false,
};
let quick: { refresh(): void } | null = null;
let dust: { refresh(): void } | null = null;
let decks: { show(): void; refresh(): void } | null = null;
let setPicker: { refresh(): void } | null = null;
let panel: { render(): void; close(): void } | null = null;
let textsLoading: Promise<boolean> | null = null;
let setsLoading: Promise<Map<string, SetGroup> | null> | null = null;
let toastTimer: number | undefined;
let resetTimer: number | undefined;
let hoverTimer: number | undefined;
let saveTimer: number | undefined;
let focusNoSheet = false;

/** Collezione appena rimossa: resta salvata nel browser finché si può annullare (circa 8 secondi). */
interface Removed {
  groups: Group[];
  roles: Record<string, Role>;
  summaries: SummaryItem[];
  showMissing: boolean;
  savedAt: number | null;
  query: string;
  seen: typeof S.seen;
  setOwned: boolean;
  cf: CardFilters;
}
const UNDO_MS = 8000;
let removed: Removed | null = null;
let undoTimer: number | undefined;

/* ---------- utilità ---------- */

function toast(msg: string): void {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2600);
}

function groupName(g: Group): string {
  if (g.kind === 'text' && g.source === PASTED) {
    const n = g.id.match(/-(\d+)$/)?.[1];
    return n ? `${t('group.pasted')} ${n}` : t('group.pasted');
  }
  return g.name;
}

const cardsWord = (n: number) => t('load.cards', { n });

const hasColl = () => S.groups.some((g) => S.roles[g.id] === 'coll');

async function getAllNames(): Promise<Set<string> | null> {
  if (S.allNames) return S.allNames;
  try {
    const r = await fetch('data/allnames.json');
    if (!r.ok) return null;
    S.allNames = new Set<string>(await r.json());
  } catch {
    return null;
  }
  return S.allNames;
}

/* ---------- persistenza ---------- */

function persist(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    S.savedAt = Date.now();
    // con una rimozione annullabile in corso la collezione precedente resta salvata (le preferenze si aggiornano)
    const keep = removed;
    const ok = await idbSet('state', {
      v: 2, groups: keep ? keep.groups : S.groups, roles: keep ? keep.roles : S.roles, opts: S.opts,
      showMissing: keep ? keep.showMissing : S.showMissing, savedAt: S.savedAt,
    } satisfies Saved);
    $('#memo').textContent = ok ? memoText() : t('err.storage');
  }, 150);
}

function memoText(): string {
  if (!S.savedAt) return '';
  return t('grp.saved', { when: fmtDateTime(S.savedAt) });
}

async function restore(): Promise<void> {
  const saved = await idbGet<Saved>('state');
  if (!saved || saved.v !== 2 || !Array.isArray(saved.groups)) return;
  S.groups = saved.groups;
  S.roles = saved.roles || {};
  S.opts = { ...DEFAULT_OPTS, ...(saved.opts || {}) };
  S.showMissing = !!saved.showMissing;
  S.savedAt = saved.savedAt || null;
}

/* ---------- importazione ---------- */

/* ---------- rimozione della collezione (con Annulla) ---------- */

function removeCollection(): void {
  commitRemoval(); // una rimozione precedente ancora annullabile diventa definitiva
  removed = {
    groups: S.groups, roles: S.roles, summaries: S.summaries, showMissing: S.showMissing, savedAt: S.savedAt,
    query: S.query, seen: S.seen, setOwned: S.setOwned, cf: S.cf,
  };
  // via solo la collezione: periodo, lingua, tema e le altre preferenze restano; i filtri dell'elenco ripartono azzerati
  Object.assign(S, { groups: [], roles: {}, summaries: [], showMissing: false, query: '', seen: 'all', setOwned: false, replacing: false,
    cf: emptyFilters() });
  ($('#search') as HTMLInputElement).value = '';
  ($('#seenFilter') as HTMLSelectElement).value = 'all';
  showErrors([]);
  refresh(false);
  const bar = $('#undoBar');
  bar.hidden = false;
  bar.replaceChildren(h('span', { class: 'undo-text' }, t('load.removed')),
    h('button', { class: 'btn small undo-btn', type: 'button', id: 'undoRemove' }, t('load.undo')));
  // il pulsante "Rimuovi" non c'è più: il focus va su Annulla, raggiungibile subito da tastiera
  ($('#undoRemove') as HTMLButtonElement).focus();
  window.clearTimeout(undoTimer);
  undoTimer = window.setTimeout(() => {
    const hadFocus = document.activeElement?.id === 'undoRemove';
    commitRemoval();
    if (hadFocus) ($('#files') as HTMLInputElement).focus();
  }, UNDO_MS);
}

function undoRemoval(): void {
  if (!removed) return;
  const r = removed;
  removed = null;
  window.clearTimeout(undoTimer);
  hideUndo();
  Object.assign(S, {
    groups: r.groups, roles: r.roles, summaries: r.summaries, showMissing: r.showMissing, savedAt: r.savedAt,
    query: r.query, seen: r.seen, setOwned: r.setOwned, cf: r.cf,
  });
  ($('#search') as HTMLInputElement).value = r.query;
  ($('#seenFilter') as HTMLSelectElement).value = r.seen;
  refresh(false);
  document.getElementById('removeColl')?.focus();
}

/** La rimozione diventa definitiva: la collezione viene cancellata anche dal browser. */
function commitRemoval(): void {
  window.clearTimeout(undoTimer);
  hideUndo();
  if (!removed) return;
  removed = null;
  persist();
}

function hideUndo(): void {
  const bar = $('#undoBar');
  bar.hidden = true;
  bar.replaceChildren();
}

function beginImport(): void {
  commitRemoval(); // un nuovo caricamento rende definitiva la rimozione
  // "Sostituisci": il nuovo caricamento prende il posto della collezione precedente
  if (S.replacing) {
    S.groups = [];
    S.roles = {};
    S.summaries = [];
    S.replacing = false;
  }
}

function addGroups(gs: Group[]): void {
  for (const g of gs) {
    const i = S.groups.findIndex((x) => x.id === g.id);
    if (i >= 0) S.groups[i] = g;
    else S.groups.push(g);
    if (!S.roles[g.id]) S.roles[g.id] = defaultRole(g);
  }
}

function textGroup(rows: Row[], label: string | null): Group {
  let n = 1;
  let id = 'testo';
  while (S.groups.some((g) => g.id === id)) id = `testo-${++n}`;
  const name = label ?? t('group.pasted');
  return { id, name: n > 1 ? `${name} ${n}` : name, type: '', source: label ?? PASTED, rows, hasProxy: false, kind: 'text' };
}

async function summarizeImport(source: string, kind: 'csv' | 'text', groups: Group[]): Promise<void> {
  if (!S.d) return;
  let s = summarize(S.d, groups);
  if (s.unrecognized.length) {
    const all = await getAllNames();
    if (all) s = summarize(S.d, groups, all);
  }
  S.summaries = [{ source, kind, s }, ...S.summaries.filter((x) => x.source !== source)].slice(0, 6);
}

function readOne(name: string, text: string): { groups?: Group[]; kind?: 'csv' | 'text'; error?: string } {
  if (text.includes('\u0000')) return { error: t('err.notText', { file: name }) };
  if (/\.csv$/i.test(name) || looksLikeCSV(text)) {
    const res = readTable(name, text);
    if ('groups' in res) return { groups: res.groups, kind: 'csv' };
    if (res.error === 'noname') {
      return { error: t('err.noName', { file: name, headers: res.headers.slice(0, 8).join(', ') }) };
    }
    return { error: t('err.noCards', { file: name }) };
  }
  const { rows } = parseTextList(text);
  if (!rows.length) return { error: t('err.noLines', { file: name }) };
  return { groups: [textGroup(rows, baseName(name) || t('group.text'))], kind: 'text' };
}

async function handleFiles(files: File[]): Promise<void> {
  const errs: string[] = [];
  const parsed: { name: string; r: ReturnType<typeof readOne> }[] = [];
  for (const f of files) {
    try {
      parsed.push({ name: f.name, r: readOne(f.name, await f.text()) });
    } catch {
      errs.push(t('err.read', { file: f.name }));
    }
  }
  const ok = parsed.filter((p) => p.r.groups);
  parsed.forEach((p) => p.r.error && errs.push(p.r.error));
  showErrors(errs);
  if (!ok.length) return;
  beginImport();
  for (const p of ok) {
    addGroups(p.r.groups!);
    await summarizeImport(p.name, p.r.kind!, p.r.groups!);
  }
  refresh();
}

async function handleText(): Promise<void> {
  const ta = $('#pasteText') as HTMLTextAreaElement;
  const text = ta.value;
  if (!text.trim()) {
    showErrors([t('err.pasteEmpty')]);
    return;
  }
  let groups: Group[];
  let kind: 'csv' | 'text';
  if (looksLikeCSV(text)) {
    const res = readTable(t('group.pasted'), text);
    if (!('groups' in res)) {
      showErrors([t('err.pasteCsvEmpty')]);
      return;
    }
    groups = res.groups;
    kind = 'csv';
  } else {
    const { rows } = parseTextList(text);
    if (!rows.length) {
      showErrors([t('err.pasteNoCards')]);
      return;
    }
    beginImport();
    groups = [textGroup(rows, null)];
    kind = 'text';
  }
  if (kind === 'csv') beginImport();
  showErrors([]);
  addGroups(groups);
  ta.value = '';
  await summarizeImport(groups.length === 1 && groups[0].source !== PASTED ? groups[0].name : PASTED, kind, groups);
  refresh();
}

function showErrors(list: string[]): void {
  $('#errors').replaceChildren(...list.map((e) => h('li', null, e)));
}

/* ---------- rendering ---------- */

function refresh(save = true): void {
  if (!S.d) return;
  S.results = compute(S.d, S.groups, S.roles, S.opts);
  S.cix = collectionIndex(S.d, S.groups, S.roles, S.opts.proxies);
  applySetFilter();
  S.shown = PAGE;
  render();
  if (save) persist();
}

function render(): void {
  renderLoad();
  renderFilters();
  renderResults();
  renderExtra();
  quick?.refresh();
  dust?.refresh();
  decks?.refresh();
  setPicker?.refresh();
}

/* ---------- filtro per espansione ---------- */

async function loadSetGroups(): Promise<Map<string, SetGroup> | null> {
  if (S.setGroups) return S.setGroups;
  setsLoading ??= fetch('data/sets.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((rows: SetRow[] | null) => {
      if (rows) S.setRows = new Map(rows.map((r) => [r.c, r]));
      return (S.setGroups = rows ? buildGroups(rows) : null);
    })
    .catch(() => null);
  return setsLoading;
}

const selectedGroup = (): SetGroup | null => (S.setFilter && S.setGroups?.get(S.setFilter)) || null;

/** Con un'espansione scelta, la lista (e gli export) si restringe alle carte stampate in quel gruppo di set. */
function applySetFilter(): void {
  const g = selectedGroup();
  S.setCodes = g ? memberCodes(g, S.setHidden) : null;
  S.results = restrictToSet(S.d!, S.results, S.setCodes);
}

function selectSet(code: string | null): void {
  S.setFilter = code;
  if (code) lsSet('set', code);
  else lsDel('set');
  refresh(false);
}

function renderDataline(): void {
  const m = S.d!.meta;
  const el = $('#dataline');
  el.classList.remove('error');
  el.replaceChildren(t('data.line', {
    last: fmtDate(m.last_tournament), tournaments: fmtInt(m.tournaments), decks: fmtInt(m.decks), generated: fmtDate(m.generated_at),
  }));
  // allarme calcolato anche nel browser: se i dati non cambiano non c'è un nuovo commit, ma l'avviso deve comparire
  const days = daysBetween(m.last_tournament, new Date().toISOString().slice(0, 10));
  if (m.source.status === 'ferma' || days > STALE_SOURCE_DAYS) {
    el.append(' ', h('span', { class: 'warn' }, t('data.stale', { days })));
  }
}

function collectionCards(): number {
  return S.groups.filter((g) => S.roles[g.id] === 'coll').reduce((a, g) => a + g.rows.reduce((b, r) => b + r.q, 0), 0);
}

function renderLoad(): void {
  const loaded = S.groups.length > 0;
  $('#loadArea').hidden = loaded && !S.replacing;
  $('#cancelReplace').hidden = !(loaded && S.replacing);
  const line = $('#loaded');
  line.hidden = !loaded || S.replacing;
  if (loaded) {
    line.replaceChildren(
      h('span', { class: 'loaded-text' }, t('load.collection'), h('b', null, cardsWord(collectionCards())), ' · ',
        h('button', { class: 'linkbtn', type: 'button', id: 'replace' }, t('load.replace'))),
      h('button', { class: 'btn small removecoll', type: 'button', id: 'removeColl' },
        svg('svg', { class: 'rm-ico', viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' },
          svg('path', { d: 'M4 4l8 8M12 4l-8 8' })),
        h('span', null, t('load.remove'))));
  }
}

function renderFilters(): void {
  const d = S.d!;
  // con un'espansione scelta i conteggi del periodo sono quelli dell'espansione, come il riepilogo
  const codes = S.setCodes;
  const counts = presetCounts(d, S.opts, codes ? (idx) => printsInSets(d, idx, codes).length > 0 : undefined);
  $('#period').replaceChildren(...counts.map((n, i) => h('option', { value: String(i), selected: S.opts.win === i },
    t('period.option', { label: periodLabel(i), n: fmtInt(n) }))));
  ($('#period') as HTMLSelectElement).value = String(S.opts.win);
  ($('#optMin') as HTMLInputElement).value = String(S.opts.minDecks);
  ($('#optLegal') as HTMLInputElement).checked = S.opts.legalOnly;
  ($('#optSide') as HTMLInputElement).checked = S.opts.side;
  ($('#setHidden') as HTMLInputElement).checked = S.setHidden;
  ($('#setOwned') as HTMLInputElement).checked = S.setOwned;
  $('#setOwnedWrap').hidden = !(selectedGroup() && hasColl());
}

function renderResults(): void {
  const R = S.results;
  const coll = hasColl();
  const period = periodDesc(S.opts.win);
  const ownedList = R.filter((x) => x.owned > 0);
  const owned = ownedList.length;
  // insieme contato nel titolo: le carte possedute nella vista collezione, altrimenti tutta la lista
  let headline: Result[] = R;
  let v: string;
  let sub: string;
  const g = selectedGroup();
  if (g) {
    const here = coll ? R.filter((x) => x.owned > 0 && ownedPrintInSet(x)).length : 0;
    v = t('set.summary', { n: R.length }) + (coll ? t('set.summaryOwned', { n: fmtInt(owned), here: fmtInt(here) }) : '');
    sub = t('set.sub', { name: g.name, year: g.date.slice(0, 4), period });
  } else if (!S.groups.length) {
    v = t('res.list', { n: R.length });
    sub = t('res.listSub', { period });
  } else if (!coll) {
    v = t('res.noGroups');
    sub = t('res.noGroupsSub');
  } else {
    headline = ownedList;
    v = t('res.owned', { n: owned });
    sub = t('res.ownedSub', { total: fmtInt(R.length), period });
  }
  $('#verdict').textContent = v;
  $('#sub').textContent = sub;
  $('#thQty').textContent = coll ? t('th.qtyYours') : t('th.qtyTypical');
  renderRows();
  renderNote(headline);
  renderPriceSummary();
  panel?.render();
}

/* ---------- prezzi indicativi ---------- */

/** Prezzo di una carta mancante: la stampa del set nella vista per espansione, altrimenti la più economica. */
function missingPrice(x: Result): number {
  if (S.setCodes) return printPrice(S.prices, x.idx, displayPrint(S.d!, x.idx, S.setCodes, S.setFilter!));
  return cheapestPrice(S.prices, x.idx);
}

/** Testo della colonna Prezzo: "—" se il prezzo manca. */
function priceText(x: Result): string {
  if (!S.prices) return '—';
  if (S.setCodes || x.owned === 0) {
    const c = missingPrice(x);
    if (!c) return '—';
    return S.setCodes ? fmtEur(c) : t('price.from', { p: fmtEur(c) });
  }
  const c = ownedPrice(S.d!, S.prices, x);
  return c ? fmtEur(c) : '—';
}

/**
 * Prezzi arrivati dopo il primo disegno: si aggiornano solo le celle e il riepilogo, senza ridisegnare le righe
 * (una scheda in apertura al passaggio del mouse resta legata alla sua carta).
 */
function showPrices(): void {
  const cells = document.querySelectorAll<HTMLElement>('#cardRows td.c-price');
  S.view.slice(0, cells.length).forEach((x, i) => { cells[i].textContent = priceText(x); });
  renderPriceSummary();
}

/** Valore delle copie possedute e costo delle mancanti, sulle carte dell'elenco con i filtri attivi. */
function renderPriceSummary(): void {
  const el = $('#priceSummary');
  el.hidden = !S.prices || !S.d;
  if (el.hidden) return el.replaceChildren();
  // stessi filtri dell'elenco (ricerca, ultima apparizione), comprese le mancanti anche se l'elenco non le mostra
  const rows = matching();
  const tot = priceTotals(S.d!, S.prices, rows, missingPrice);
  const unpriced = (n: number) => (n ? ` (${t('price.unpriced', { n: fmtInt(n) })})` : '');
  const parts: string[] = [];
  if (hasColl()) {
    parts.push(t('price.owned', { v: fmtEur(tot.ownedValue) }) + unpriced(tot.ownedUnpriced));
    if (tot.missingCards) parts.push(t('price.missing', { v: fmtEur(tot.missingCost) }) + unpriced(tot.missingUnpriced));
  } else {
    parts.push(t('price.list', { v: fmtEur(tot.missingCost) }) + unpriced(tot.missingUnpriced));
  }
  el.textContent = parts.join(' · ');
}

/** Filtri dell'elenco: senza espansione di default solo le possedute; con un'espansione tutte, a richiesta solo le possedute. */
function listFilters(): ListFilters {
  return { query: S.query, seen: S.seen, onlyOwned: hasColl() && (S.setCodes ? S.setOwned : !S.showMissing), card: S.cf, hay: S.hay, names: S.names };
}

/** Carte che rispettano tutti i filtri attivi, possedute e mancanti: export e riepilogo dei prezzi. */
function matching(): Result[] {
  return visible(S.d!, S.results, { ...listFilters(), onlyOwned: false });
}

/** Colore, costo, tipo e testo (pannello "Filtri") attivi; il testo conta solo quando texts.json è arrivato. */
const cardFiltersOn = () => isActive(S.cf);

async function loadTexts(): Promise<boolean> {
  if (S.hay) return true;
  const get = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  // testo inglese (obbligatorio) e testo delle stampe italiane (facoltativo: se manca si cerca solo in inglese)
  textsLoading ??= Promise.all([get('data/texts.json'), get('data/ittexts.json')])
    .then(([j, it]: ({ t?: string[] } | null)[]) => {
      const n = S.d?.cards.c.length;
      if (!S.d || !Array.isArray(j?.t) || j.t.length !== n) return false;
      S.hay = haystacks(S.d.cards.c, j.t, Array.isArray(it?.t) && it.t.length === n ? it.t : null);
      return true;
    })
    .catch(() => false)
    .then((ok) => {
      if (!ok) textsLoading = null; // si riprova al prossimo uso
      return ok;
    });
  return textsLoading;
}

/** Nomi italiani per la ricerca (al primo uso): quando arrivano, l'elenco si aggiorna se c'è una ricerca. */
function ensureItalian(): void {
  if (S.names || !S.d) return;
  const d = S.d;
  void loadItalian(d.cards.c.length).then((it) => {
    if (!it || S.d !== d || S.names) return;
    S.names = nameHays(d.cards.c, it);
    // si ridisegna solo se i nomi italiani cambiano l'elenco: un ridisegno inutile toglierebbe il focus alla riga
    // (e staccherebbe dalla sua carta una scheda aperta)
    if (S.query.trim() && filtered().map((x) => x.idx).join() !== S.view.map((x) => x.idx).join()) renderResults();
  });
}

/** Nomi italiani della carta per la scheda: con l'interfaccia in italiano, scaricati alla prima scheda aperta. */
function sheetItalian(idx: number): string[] | undefined {
  const it = italianLoaded();
  if (it) return it.played[idx];
  if (getLang() === 'it' && S.d) {
    void loadItalian(S.d.cards.c.length).then((x) => { if (x) setSheetItalian(idx, x.played[idx] || []); });
  }
  return undefined;
}

/** I filtri del pannello sono cambiati: l'elenco riparte dalle prime carte. */
function cardFiltersChanged(): void {
  S.shown = PAGE;
  renderResults();
}

function filtered(): Result[] {
  const d = S.d!;
  let rows = visible(d, S.results, listFilters());
  const name = (x: Result) => d.cards.c[x.idx].n;
  const cmpName = (a: Result, b: Result) => name(a).localeCompare(name(b), 'en', { sensitivity: 'base' });
  if (S.sort === 'share') rows = rows.sort((a, b) => b.share - a.share || cmpName(a, b));
  else if (S.sort === 'name') rows = rows.sort(cmpName);
  else {
    const z = (x: Result) => d.cards.c[x.idx].z;
    rows = rows.sort((a, b) => (S.sort === 'recent' ? z(b).localeCompare(z(a)) : z(a).localeCompare(z(b))) || cmpName(a, b));
  }
  return rows;
}

/** Perché l'elenco non mostra esattamente le carte contate nel riepilogo. */
function noteReasons(): string[] {
  const why: string[] = [];
  const f = listFilters();
  if (S.query.trim()) why.push(t('why.search', { q: S.query.trim() }));
  if (S.seen !== 'all') why.push(t(S.seen === 'old' ? 'why.old' : 'why.recent'));
  const cf = S.cf;
  const lower = (x: string) => x.toLocaleLowerCase(getLang());
  if (cf.colors.length) {
    why.push(cf.colorMode === 'only'
      ? t('why.colorOnly', { v: cf.colors.map((c) => lower(colorLabel(c))).join(t('why.and')) })
      : t('why.color', { v: cf.colors.map((c) => lower(colorLabel(c))).join(t('why.or')) }));
  }
  if (cf.mv.length) why.push(t('why.mv', { v: mvLabel(cf.mv) }));
  if (cf.types.length) why.push(t('why.type', { v: cf.types.map((x) => lower(typeLabel(x))).join(t('why.or')) }));
  if (textWords(cf.text).length) why.push(t('why.text', { q: cf.text.trim() }));
  if (S.setCodes && f.onlyOwned) why.push(t('why.onlyOwned'));
  if (!S.setCodes && hasColl() && S.showMissing) why.push(t('why.missing'));
  return why;
}

/** Nota sotto il riepilogo, quando l'elenco non mostra esattamente le carte contate nel titolo. */
function renderNote(headline: Result[]): void {
  const n = shownNote(headline, S.view);
  const el = $('#filterNote');
  el.hidden = n === null;
  if (n === null) return el.replaceChildren();
  const why = noteReasons();
  const clearable = !!S.query.trim() || S.seen !== 'all' || (!!S.setCodes && S.setOwned) || cardFiltersOn();
  el.replaceChildren(t('res.filtered', { n: fmtInt(n), why: why.join(', ') }),
    clearable ? ' · ' : '', clearable ? h('button', { class: 'linkbtn', type: 'button', id: 'clearListFilters' }, t('res.clearFilters')) : '');
}

function isNew(entry: string | undefined): boolean {
  if (!entry) return false;
  const s = S.d!.cards.sets[entry];
  if (!s) return false;
  const age = daysBetween(s[1], new Date().toISOString().slice(0, 10));
  return age >= 0 && age < NEW_DAYS;
}

/** La prima stampa posseduta che appartiene ai set del gruppo selezionato (se c'è). */
function ownedPrintInSet(x: Result): Result['prints'][number] | undefined {
  const d = S.d!;
  const prints = d.prints.p[x.idx] || [];
  const inSet = new Set(printsInSets(d, x.idx, S.setCodes!).map((i) => prints[i][0]));
  return x.prints.find((p) => inSet.has(p.row.i || (p.print >= 0 ? prints[p.print][0] : '')));
}

interface SetView {
  id: string; // Scryfall ID della stampa di questo set: sempre lei, mai la printing posseduta né quella di riferimento
  mine: boolean; // possiedi proprio questa stampa
  set: string;
  rarity: string;
  label: string;
  common: boolean;
}

/** Vista per espansione: immagine della stampa di quel set ed etichetta della rarità "qui". */
function setThumb(x: Result): SetView | null {
  const d = S.d!;
  const codes = S.setCodes!;
  const prints = d.prints.p[x.idx] || [];
  const pi = displayPrint(d, x.idx, codes, S.setFilter!);
  if (pi < 0) return null;
  const p = prints[pi];
  const mine = x.prints.some((o) => o.print === pi || o.row.i === p[0]
    || (!!o.row.c && o.row.s.toLowerCase() === p[1] && o.row.c === p[2]));
  const r = rarityHere(d, x.idx, codes)!;
  const pr = p[6] || 's';
  const rarity = t(`rarity.${pr}` as Key);
  let label: string;
  if (pr === 'c') label = t('set.common');
  else if (r.common) {
    // questa stampa non è comune, ma un'altra del gruppo sì (per esempio nel set Commander collegato)
    const ci = printsInSets(d, x.idx, codes).find((i) => prints[i][6] === 'c')!;
    label = t('set.commonOther', { rarity, set: setName(prints[ci][1]) });
  } else {
    const entry = r.entrySet ? d.cards.sets[r.entrySet] : null;
    label = entry ? t('set.notCommon', { rarity, set: entry[0], year: entry[1].slice(0, 4) }) : t('set.notCommonPlain', { rarity });
  }
  return { id: p[0], mine, set: p[1], rarity: pr, label, common: pr === 'c' || r.common };
}

const setName = (code: string) => S.setRows.get(code)?.n || S.d!.prints.sets[code]?.[0] || code.toUpperCase();

function thumbIds(x: Result): { id: string; owned: boolean }[] {
  const d = S.d!;
  const prints = d.prints.p[x.idx] || [];
  const ref = prints[d.cards.c[x.idx].r];
  const ids: { id: string; owned: boolean }[] = [];
  for (const p of x.prints) {
    const id = p.row.i || (p.print >= 0 ? prints[p.print][0] : '');
    if (id && !ids.some((x) => x.id === id)) ids.push({ id, owned: true });
  }
  if (!ids.length && ref) ids.push({ id: ref[0], owned: x.prints.length > 0 });
  return ids;
}


function renderRows(): void {
  const d = S.d!;
  const coll = hasColl();
  S.view = filtered();
  const rows = S.view.slice(0, S.shown);
  $('#more').hidden = S.view.length <= rows.length;
  const count = $('#shownCount');
  count.hidden = !rows.length;
  count.textContent = t('res.shown', { n: fmtInt(rows.length), total: fmtInt(S.view.length) });
  if (!rows.length) {
    $('#cardRows').replaceChildren(h('tr', { class: 'nores' }, h('td', { colspan: 6 },
      S.query || S.seen !== 'all' || cardFiltersOn() ? t('res.noMatch') : S.setCodes ? (S.setOwned ? t('res.noOwned') : t('set.empty'))
        : coll && !S.showMissing ? t('res.noOwned') : t('res.none'))));
    return;
  }
  $('#cardRows').replaceChildren(...rows.map((x) => {
    const c = d.cards.c[x.idx];
    const st = c.s[S.opts.win];
    const setView = S.setCodes ? setThumb(x) : null;
    const thumbs = setView ? [{ id: setView.id, owned: setView.mine }] : thumbIds(x);
    const refId = d.prints.p[x.idx]?.[c.r]?.[0];
    const entry = c.e ? d.cards.sets[c.e] : null;
    const status = coll && x.status !== 'owned'
      ? h('span', { class: `badge st-${x.status}` }, t('badge.missing'))
      : null;
    const own = x.prints.length
      ? h('span', { class: 'own' }, x.prints.map((p) => `${fmtPrint(p.row)} ×${p.q}`).join(', ')
        + (x.binders.length ? ` · ${x.binders.map((b) => b[0]).join(', ')}` : ''))
      : null;
    const btn = h('button', { class: 'cardbtn', type: 'button', dataset: { idx: String(x.idx) }, 'aria-haspopup': 'dialog', 'aria-label': t('card.open', { name: c.n }) },
      h('span', { class: 'thumbs' },
        ...thumbs.slice(0, 3).map((th) => h('img', {
          class: 'thumb' + (th.owned ? ' owned' : '') + (setView ? ' big' : ''), src: imageUrl(th.id, 'small'), alt: '', loading: 'lazy', width: 146, height: 204,
          // vista per espansione: miniatura grande, con l'immagine "normal" sugli schermi ad alta densità
          srcset: setView ? `${imageUrl(th.id, 'small')} 146w, ${imageUrl(th.id, 'normal')} 488w` : undefined,
          sizes: setView ? '(max-width: 640px) 88px, 112px' : undefined,
          dataset: refId ? { fallback: imageUrl(refId, 'small') } : undefined,
        })),
        thumbs.length > 3 ? h('span', { class: 'more-n' }, `+${thumbs.length - 3}`) : null),
      h('span', { class: 'nmwrap' }, h('span', { class: 'nm' }, c.n), status,
        isNew(c.e) ? h('span', { class: 'badge new' }, t('badge.new')) : null,
        c.l === 'b' ? h('span', { class: 'badge banned' }, t('badge.banned')) : null,
        setView ? h('span', { class: 'rarity' + (setView.common ? ' is-common' : '') },
          setIcon(iconOf(S.setRows.get(setView.set)), `${setName(setView.set)} · ${t(`rarity.${setView.rarity}` as Key)}`, setView.rarity),
          h('span', null, setView.label),
          setView.mine ? h('span', { class: 'tag mine' }, t('sheet.yours')) : null) : null,
        own));
    return h('tr', { class: coll ? `r-${x.status}` : '' },
      h('td', { class: 'c-name' }, btn),
      h('td', { class: 'c-qty num', 'data-label': t('mobile.qty') }, coll ? String(x.owned) : String(x.typical)),
      h('td', { class: 'c-pct num', 'data-label': t('mobile.decks') }, fmtPct(x.share), h('span', { class: 'muted' }, st ? ` · ${fmtInt(S.opts.side ? st[0] : st[1])}` : '')),
      h('td', { class: 'c-seen', 'data-label': t('mobile.last') }, fmtDate(c.z)),
      h('td', { class: 'c-entry', 'data-label': t('mobile.entry') }, entry && c.e ? `${c.e.toUpperCase()} ${entry[1].slice(0, 4)}` : '—'),
      h('td', { class: 'c-price num', 'data-label': t('mobile.price') }, priceText(x)));
  }));
}

function seg(id: string, val: Role, label: string, role: Role): HTMLLabelElement {
  return h('label', null, h('input', { type: 'radio', name: `role-${id}`, value: val, dataset: { gid: id }, checked: role === val }),
    h('span', null, label));
}

function renderExtra(): void {
  const loaded = S.groups.length > 0;
  $('#extraColl').hidden = !loaded;
  ($('#optMissing') as HTMLInputElement).checked = S.showMissing;
  // con un'espansione scelta la vista mostra già tutte le carte: l'opzione non serve
  $('#optMissing').closest('label')!.hidden = !!S.setCodes;
  if (!loaded) return;

  const inc = S.groups.filter((g) => S.roles[g.id] === 'coll').length;
  $('#grpSummary').textContent = t('grp.summary', { inc, total: S.groups.length });
  $('#groupRows').replaceChildren(...S.groups.map((g) => {
    const role = S.roles[g.id];
    const cards = g.rows.reduce((a, r) => a + r.q, 0);
    const typ = g.kind === 'text' ? t('group.typeText') : g.type || '';
    return h('tr', null,
      h('td', { class: 'g-name' }, h('span', { class: 'gname' }, groupName(g)), typ ? h('span', { class: 'gtype' }, typ) : null),
      h('td', { class: 'g-count count num' }, t('grp.count', { entries: fmtInt(g.rows.length), cards: fmtInt(cards) })),
      h('td', { class: 'g-role' }, h('div', { class: 'seg', role: 'radiogroup', 'aria-label': t('grp.roleAria', { name: groupName(g) }) },
        seg(g.id, 'coll', t('grp.include'), role), seg(g.id, 'skip', t('grp.exclude'), role))),
      h('td', { class: 'g-act' }, h('button', { class: 'btn quiet small', type: 'button', dataset: { remove: g.id } }, t('grp.remove'))));
  }));
  ($('#optProxy') as HTMLInputElement).checked = S.opts.proxies;
  $('#optProxyWrap').hidden = !S.groups.some((g) => g.hasProxy && S.roles[g.id] === 'coll');
  $('#memo').textContent = memoText();

  const unrec = S.summaries.reduce((a, x) => a + x.s.unrecognized.length, 0);
  const rows = S.summaries.reduce((a, x) => a + x.s.rows, 0);
  $('#impSummary').textContent = S.summaries.length
    ? t('imp.summary', { rows: t('imp.rows', { n: rows }), unrec: fmtInt(unrec) })
    : t('imp.title');
  $('#importSummary').replaceChildren(...(S.summaries.length ? S.summaries.map(({ source, kind, s }) => {
    const bits = [t('imp.rowsRead', { n: s.rows }), t('imp.inList', { n: fmtInt(s.inList) })];
    if (s.notInList) bits.push(t('imp.notInList', { n: fmtInt(s.notInList) }));
    bits.push(t('imp.unrec', { n: fmtInt(s.unrecognized.length) }));
    const shown = s.unrecognized.slice(0, 60);
    return h('div', { class: 'item' },
      h('b', null, source === PASTED ? t('group.pasted') : source), ': ', bits.join(', ') + '.',
      kind === 'text' ? h('p', { class: 'note' }, t('imp.textNote')) : null,
      s.approxPrint ? h('p', { class: 'note' }, t('imp.approx', { n: fmtInt(s.approxPrint) })) : null,
      shown.length
        ? h('details', null, h('summary', null, t('imp.unrecTitle')),
          h('ul', null, ...shown.map((r) => h('li', null, `${r.q} ${r.n}${r.s ? ` (${r.s.toUpperCase()})` : ''}`))),
          s.unrecognized.length > shown.length ? h('p', { class: 'note' }, t('imp.more', { n: s.unrecognized.length - shown.length })) : null,
          h('p', { class: 'note' }, t('imp.hint')))
        : null);
  }) : [h('p', { class: 'note' }, t('imp.empty'))]));
}

async function renderNews(): Promise<void> {
  const root = $('#news');
  const empty = h('p', { class: 'note' }, t('news.empty'));
  type Rev = {
    set: string; nome: string; uscita: string; data: string; sommario: string;
    nuove: [string, number, number][]; entrate: [string, number, number][]; uscite: [string, number][];
    legalita: [string, string, string][];
  };
  const leg = (x: string) => (['l', 'b', 'n'].includes(x) ? t(`legal.${x}` as Key) : x);
  const list_ = (title: string, items: string[]) => items.length
    ? h('div', null, h('b', null, title), h('ul', null, ...items.map((it) => h('li', null, it))))
    : null;
  try {
    const r = await fetch('data/reviews/index.json');
    const list = r.ok ? ((await r.json()) as Rev[]) : [];
    if (!Array.isArray(list) || !list.length) return void root.replaceChildren(empty);
    root.replaceChildren(...list.slice(0, 6).map((x) => h('details', { class: 'review' },
      h('summary', null, t('news.item', { name: x.nome, set: String(x.set).toUpperCase(), date: fmtDate(x.data) })),
      getLang() === 'it' ? h('p', { class: 'note' }, x.sommario) : null,
      list_(t('news.new'), (x.nuove || []).map(([n, d, p]) => t('news.decks', { name: n, n: fmtInt(d), pct: p }))),
      list_(t('news.entered'), (x.entrate || []).map(([n, d, p]) => t('news.decks', { name: n, n: fmtInt(d), pct: p }))),
      list_(t('news.left'), (x.uscite || []).map(([n]) => n)),
      list_(t('news.legality'), (x.legalita || []).map(([n, a, b]) => `${n}: ${leg(a)} → ${leg(b)}`)))));
  } catch {
    root.replaceChildren(empty);
  }
}

/* ---------- export ---------- */

function payload(kind: string): string {
  const d = S.d!;
  // tutte le carte che rispettano i filtri attivi (anche quelle non ancora mostrate), possedute e mancanti
  const rows = matching();
  if (kind === 'csv') return realignedCSV(d, rows);
  return textList(d, rows, kind as 'owned' | 'missing');
}

const LABEL: Record<string, Key> = { owned: 'export.labelOwned', missing: 'export.labelMissing', csv: 'export.labelCsv' };

async function copyText(text: string, what: string): Promise<void> {
  if (!text.trim()) return toast(t('export.nothingCopy', { what }));
  try {
    await navigator.clipboard.writeText(text);
    return toast(t('export.copied', { what }));
  } catch {
    ($('#copyText') as HTMLTextAreaElement).value = text;
    $('#copyPanel').hidden = false;
    ($('#copyText') as HTMLTextAreaElement).select();
  }
}

function saveText(text: string, filename: string, what: string): void {
  if (!text.trim()) return toast(t('export.nothingSave', { what }));
  const url = URL.createObjectURL(new Blob([text], { type: /\.csv$/.test(filename) ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' }));
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(t('export.saved', { file: filename }));
}

const doCopy = (kind: string) => copyText(payload(kind), t(LABEL[kind]));

function doSave(kind: string): void {
  saveText(payload(kind), t(kind === 'csv' ? 'export.fileCsv' : kind === 'owned' ? 'export.fileOwned' : 'export.fileMissing'), t(LABEL[kind]));
}

/* ---------- scheda ---------- */

function openFor(btn: HTMLElement, mode: 'hover' | 'click', animate = false): void {
  const d = S.d!;
  const idx = Number(btn.dataset.idx);
  // carte dei mazzi: possono essere fuori dalla lista con i filtri attuali, il possesso viene dalla collezione
  const inDecks = !!btn.closest('#viewDecks');
  const res = (inDecks ? null : S.results.find((x) => x.idx === idx)) || (inDecks && hasColl() ? ownedResult(idx) : null);
  const approx = !!res && res.prints.length > 0 && res.prints.every((p) => !p.exact);
  // vista per espansione: la carta attiva della scheda è la stampa di quel set
  const focusId = S.setCodes && res && !inDecks ? setThumb(res)?.id : undefined;
  openSheet(btn, {
    d, opts: S.opts, idx, res: hasColl() ? res : null, approx, focusId,
    prices: S.prices, itNames: sheetItalian(idx),
    onShowAll: (items, title) => renderGrid($('#gridDialog') as HTMLDialogElement, items, title),
  }, mode, animate);
}

/** Scheda degli artwork dal controllo rapido: anche per carte fuori dalla lista con i filtri attuali. */
/** Possesso di una carta qualsiasi (anche fuori dalla lista), nel formato dei risultati. */
function ownedResult(idx: number, owned: Owned | null = S.cix?.byCard.get(idx) || null): Result {
  const d = S.d!;
  const c = d.cards.c[idx];
  return {
    idx, owned: owned?.total || 0, need: 1, typical: typicalCopies(c, S.opts), share: deckShare(d, c, S.opts),
    status: owned && owned.total > 0 ? 'owned' : 'missing', prints: owned?.prints || [], binders: owned?.binders || [],
  };
}

function openArtworksFor(anchor: HTMLElement, idx: number, owned: Owned | null): void {
  const d = S.d!;
  const res: Result | null = hasColl() ? ownedResult(idx, owned) : null;
  const approx = !!res && res.prints.length > 0 && res.prints.every((p) => !p.exact);
  openSheet(anchor, {
    d, opts: S.opts, idx, res, approx, prices: S.prices, itNames: sheetItalian(idx),
    onShowAll: (items, title) => renderGrid($('#gridDialog') as HTMLDialogElement, items, title),
  }, 'click');
}

/* ---------- tema e viste ---------- */

function applyTheme(theme: string | null): void {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  const dark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  $('#theme').textContent = dark ? t('theme.toLight') : t('theme.toDark');
}

/** Testi statici di index.html (data-i18n*), lingua del documento e selettore IT/EN. */
function applyStatic(): void {
  document.documentElement.lang = getLang();
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n as Key); });
  document.querySelectorAll<HTMLElement>('[data-i18n-ph]').forEach((el) => el.setAttribute('placeholder', t(el.dataset.i18nPh as Key)));
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria as Key)));
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => el.setAttribute('title', t(el.dataset.i18nTitle as Key)));
  document.querySelectorAll<HTMLElement>('[data-i18n-content]').forEach((el) => el.setAttribute('content', t(el.dataset.i18nContent as Key)));
  document.querySelectorAll<HTMLElement>('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === getLang())));
  applyTheme(lsGet('theme'));
}

function changeLang(l: Lang): void {
  if (l === getLang()) return;
  setLang(l);
  lsSet('lang', l);
  closeSheet();
  applyStatic();
  if (S.d) {
    renderDataline();
    render();
    void renderNews();
  }
  if (location.hash === '#informazioni') renderAbout($('#viewAbout'), S.d);
}

function route(): void {
  const about = location.hash === '#informazioni';
  const forgotten = location.hash === '#carta-dimenticata';
  const decksPage = location.hash === '#mazzi';
  $('#viewMain').hidden = about || forgotten || decksPage;
  $('#viewAbout').hidden = !about;
  $('#viewDust').hidden = !forgotten;
  $('#viewDecks').hidden = !decksPage;
  for (const [id, on] of [['#navAbout', about], ['#navDust', forgotten], ['#navDecks', decksPage]] as const) {
    if (on) $(id).setAttribute('aria-current', 'page');
    else $(id).removeAttribute('aria-current');
  }
  // nella pagina Informazioni il blocco legale e la FAQ sulle donazioni sostituiscono il piè di pagina
  document.querySelector<HTMLElement>('.wrap > .foot')!.hidden = about;
  closeSheet();
  if (about) renderAbout($('#viewAbout'), S.d);
  if (decksPage) decks?.show();
  if (about || forgotten || decksPage) window.scrollTo(0, 0);
}

/* ---------- eventi ---------- */

function wire(): void {
  const drop = $('#drop');
  $('#files').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const fs = [...(input.files || [])];
    input.value = '';
    if (fs.length) void handleFiles(fs);
  });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add('over');
  }));
  ['dragleave', 'dragend'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const fs = [...((e as DragEvent).dataTransfer?.files || [])];
    if (fs.length) void handleFiles(fs);
  });
  $('#pasteAdd').addEventListener('click', () => void handleText());
  const clip = $('#pasteClip');
  if (navigator.clipboard && 'readText' in navigator.clipboard) {
    clip.hidden = false;
    clip.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        const ta = $('#pasteText') as HTMLTextAreaElement;
        ta.value = text;
        ta.focus();
        if (!text.trim()) toast(t('clip.empty'));
      } catch {
        toast(t('clip.denied'));
      }
    });
  }
  $('#loaded').addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('#removeColl')) return removeCollection();
    if ((e.target as HTMLElement).id !== 'replace') return;
    S.replacing = true;
    renderLoad();
    ($('#files') as HTMLInputElement).focus();
  });
  $('#cancelReplace').addEventListener('click', () => {
    S.replacing = false;
    showErrors([]);
    renderLoad();
  });

  // filtri: ogni modifica aggiorna subito i risultati
  $('#filters').addEventListener('submit', (e) => e.preventDefault());
  const optBool = (sel: string, key: 'legalOnly' | 'side' | 'proxies') =>
    $(sel).addEventListener('change', (e) => {
      S.opts[key] = (e.target as HTMLInputElement).checked;
      refresh();
    });
  optBool('#optLegal', 'legalOnly');
  optBool('#optSide', 'side');
  optBool('#optProxy', 'proxies');
  $('#optMin').addEventListener('input', (e) => {
    const v = parseInt((e.target as HTMLInputElement).value, 10);
    if (!Number.isFinite(v) || v < 1) return;
    S.opts.minDecks = Math.min(v, 9999);
    refresh();
  });
  $('#period').addEventListener('change', (e) => {
    S.opts.win = Number((e.target as HTMLSelectElement).value);
    refresh();
  });
  $('#search').addEventListener('focus', ensureItalian);
  $('#search').addEventListener('input', (e) => {
    ensureItalian();
    S.query = (e.target as HTMLInputElement).value;
    S.shown = PAGE;
    renderResults();
  });
  const seenSel = $('#seenFilter') as HTMLSelectElement;
  seenSel.value = S.seen;
  seenSel.addEventListener('change', () => {
    S.seen = seenSel.value as typeof S.seen;
    S.shown = PAGE;
    renderResults();
  });
  const sortSel = $('#sort') as HTMLSelectElement;
  sortSel.value = S.sort;
  sortSel.addEventListener('change', () => {
    S.sort = sortSel.value as typeof S.sort;
    lsSet('sort', S.sort);
    S.shown = PAGE;
    renderRows();
  });
  $('#filterNote').addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id !== 'clearListFilters') return;
    S.query = '';
    S.seen = 'all';
    S.setOwned = false;
    clearFilters(S.cf);
    ($('#search') as HTMLInputElement).value = '';
    seenSel.value = 'all';
    ($('#setOwned') as HTMLInputElement).checked = false;
    S.shown = PAGE;
    renderResults();
  });
  $('#more').addEventListener('click', () => {
    const first = S.shown;
    S.shown += PAGE;
    renderRows();
    // accessibilità: il focus va sulla prima carta aggiunta (senza aprire la scheda)
    const btn = $('#cardRows').querySelectorAll<HTMLElement>('.cardbtn')[first];
    if (btn) {
      focusNoSheet = true;
      btn.focus();
      focusNoSheet = false;
    }
  });
  $('#setHidden').addEventListener('change', (e) => {
    S.setHidden = (e.target as HTMLInputElement).checked;
    lsSet('setHidden', S.setHidden ? '1' : '');
    refresh(false);
  });
  $('#setOwned').addEventListener('change', (e) => {
    S.setOwned = (e.target as HTMLInputElement).checked;
    S.shown = PAGE;
    renderResults();
  });
  $('#optMissing').addEventListener('change', (e) => {
    S.showMissing = (e.target as HTMLInputElement).checked;
    S.shown = PAGE;
    renderResults();
    persist();
  });

  $('#groupRows').addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.name?.startsWith('role-') && el.dataset.gid) {
      S.roles[el.dataset.gid] = el.value as Role;
      refresh();
    }
  });
  $('#groupRows').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-remove]');
    if (!b) return;
    const id = b.dataset.remove!;
    S.groups = S.groups.filter((g) => g.id !== id);
    delete S.roles[id];
    refresh();
  });

  document.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const c = el.closest<HTMLElement>('[data-copy]');
    if (c) return void doCopy(c.dataset.copy!);
    const s = el.closest<HTMLElement>('[data-save]');
    if (s) return void doSave(s.dataset.save!);
    const l = el.closest<HTMLElement>('[data-lang]');
    if (l) changeLang(l.dataset.lang as Lang);
  });
  $('#copyClose').addEventListener('click', () => {
    $('#copyPanel').hidden = true;
  });

  // scheda: passaggio del cursore, focus da tastiera, tocco
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  // si apre HOVER_OPEN_MS dopo che il cursore si ferma sulla carta; se la scheda è già aperta (o appena chiusa
  // uscendo da un'altra carta) cambia contenuto subito
  let hoverFor: HTMLElement | null = null;
  const armHover = (b: HTMLElement) => {
    window.clearTimeout(hoverTimer);
    hoverFor = b;
    hoverTimer = window.setTimeout(() => {
      hoverFor = null;
      openFor(b, 'hover', true);
    }, HOVER_OPEN_MS);
  };
  for (const rows of [$('#cardRows'), $('#deckList')]) {
    rows.addEventListener('mouseover', (e) => {
      if (!fine.matches) return;
      const b = (e.target as HTMLElement).closest<HTMLElement>('.cardbtn');
      if (!b) return;
      cancelClose();
      window.clearTimeout(hoverTimer);
      hoverFor = null;
      if (isOpenFor(Number(b.dataset.idx)) || isHoverBlocked(b)) return;
      if (isWarm()) openFor(b, 'hover');
      else armHover(b);
    });
    rows.addEventListener('mousemove', (e) => {
      if (!hoverFor) return;
      const b = (e.target as HTMLElement).closest<HTMLElement>('.cardbtn');
      if (b === hoverFor) armHover(b); // il cursore si muove ancora: si aspetta che si fermi
    });
    rows.addEventListener('mouseout', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.cardbtn');
      if (!b || b.contains(e.relatedTarget as Node)) return;
      unblockHover(b);
      window.clearTimeout(hoverTimer);
      hoverFor = null;
      // verso la scheda (anche quando si apre sopra la carta perché non sta né sopra né sotto): resta aperta
      if ($('#sheet').contains(e.relatedTarget as Node)) return;
      scheduleClose();
    });
    rows.addEventListener('focusin', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.cardbtn');
      if (b && !focusNoSheet && b.matches(':focus-visible') && !isOpenFor(Number(b.dataset.idx)) && !recentlyClosed()) openFor(b, 'hover');
    });
    rows.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.cardbtn');
      if (!b) return;
      window.clearTimeout(hoverTimer);
      openFor(b, 'click');
    });
  }
  const sheet = $('#sheet');
  sheet.addEventListener('mouseenter', cancelClose);
  sheet.addEventListener('mouseleave', scheduleClose);
  document.addEventListener('keydown', (e) => {
    // Esc chiude solo lo strato più in alto: se la griglia "Mostra tutte" è aperta, la chiude il browser
    if (e.key === 'Escape' && !sheet.hidden && !($('#gridDialog') as HTMLDialogElement).open) closeSheet(true);
  });
  document.addEventListener('pointerdown', (e) => {
    const el = e.target as HTMLElement;
    if (!sheet.hidden && !sheet.contains(el) && !el.closest('.cardbtn, .qimg, .qres .btn, .dust-stage') && !el.closest('dialog')) closeSheet();
  });

  // cancella i miei dati (conferma in due tempi)
  $('#clearData').addEventListener('click', async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    if (!b.classList.contains('warn')) {
      b.classList.add('warn');
      b.textContent = t('clear.confirm');
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        b.classList.remove('warn');
        b.textContent = t('clear.button');
      }, 4000);
      return;
    }
    window.clearTimeout(resetTimer);
    b.classList.remove('warn');
    b.textContent = t('clear.button');
    window.clearTimeout(saveTimer);
    window.clearTimeout(undoTimer);
    removed = null;
    hideUndo();
    await clearAll();
    Object.assign(S, { groups: [], roles: {}, opts: { ...DEFAULT_OPTS }, showMissing: false, savedAt: null, summaries: [], query: '', replacing: false,
      seen: 'all', setOwned: false, cf: emptyFilters() });
    seenSel.value = 'all';
    ($('#search') as HTMLInputElement).value = '';
    showErrors([]);
    // anche la lingua scelta è cancellata: si torna a quella del browser
    setLang(detectLang(null, navigator.languages || [navigator.language]));
    applyStatic();
    if (S.d) renderDataline();
    refresh(false);
    toast(t('clear.done'));
  });

  // logo e nome: tornano alla pagina principale ricaricandola (la collezione si ripristina da IndexedDB);
  // i filtri che nascondono carte non sono salvati, quindi ripartono azzerati
  $('#theme').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    lsSet('theme', next);
    applyTheme(next);
  });
  window.addEventListener('hashchange', route);
  $('#undoBar').addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'undoRemove') undoRemoval();
  });
  // pagina chiusa mentre si poteva annullare: la rimozione diventa definitiva
  window.addEventListener('pagehide', () => {
    if (!removed) return;
    removed = null;
    void idbSet('state', { v: 2, groups: [], roles: {}, opts: S.opts, showMissing: false, savedAt: Date.now() } satisfies Saved);
  });

  // immagine non disponibile (per esempio uno Scryfall ID sconosciuto): ripiego sulla printing di riferimento
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.dataset.fallback && img.src !== img.dataset.fallback) {
      img.removeAttribute('srcset');
      img.src = img.dataset.fallback;
      delete img.dataset.fallback;
    }
  }, true);
}

/* ---------- avvio ---------- */

async function main(): Promise<void> {
  setLang(detectLang(lsGet('lang'), navigator.languages || [navigator.language]));
  applyStatic();
  wire();
  setPicker = initSetPicker({
    groups: loadSetGroups, showHidden: () => S.setHidden, selected: selectedGroup, select: selectSet,
    enableHidden: () => {
      S.setHidden = true;
      lsSet('setHidden', '1');
      ($('#setHidden') as HTMLInputElement).checked = true;
      if (S.setFilter) refresh(false);
    },
  });
  panel = initFilterPanel({
    filters: () => S.cf, types: () => S.types, change: cardFiltersChanged, count: () => S.view.length, loadTexts,
  });
  quick = initQuick({
    data: () => S.d, opts: () => S.opts, collection: () => (hasColl() ? S.cix : null), openArtworks: openArtworksFor,
  });
  dust = initDust({
    data: () => S.d, opts: () => S.opts, collection: () => (hasColl() ? S.cix : null), openArtworks: openArtworksFor,
  });
  decks = initDecks({
    data: () => S.d,
    owned: () => (hasColl() && S.cix ? (idx: number) => S.cix!.byCard.get(idx)?.total || 0 : null),
    prices: () => S.prices,
    copy: (text, what) => void copyText(text, what),
    save: saveText,
  });
  route();
  try {
    S.d = await loadData();
  } catch {
    const el = $('#dataline');
    el.classList.add('error');
    el.textContent = t('data.error');
    return;
  }
  renderDataline();
  S.types = availableTypes(S.d.cards.c);
  await restore();
  lsDel('seen'); // salvata dalle versioni precedenti: non più usata
  // espansione scelta nella visita precedente (preferenza): si ripristina dopo aver letto data/sets.json
  const savedSet = lsGet('set');
  S.setHidden = lsGet('setHidden') === '1';
  if (savedSet && (await loadSetGroups())?.has(savedSet)) S.setFilter = savedSet;
  refresh(false);
  if (location.hash === '#informazioni') renderAbout($('#viewAbout'), S.d);
  void renderNews();
  // prezzi indicativi: dopo il resto, senza bloccare la pagina
  S.prices = await loadPrices(S.d);
  if (S.prices) {
    showPrices();
    decks?.refresh();
  }
}

void main();
