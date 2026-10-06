import './style.css';

import {
  compute, deckShare, DEFAULT_OPTS, defaultRole, presetCounts, summarize, typicalCopies,
  type ImportSummary, type Opts, type Result,
} from './lib/compare';
import { detectLang, fmtDateTime, getLang, setLang, t, type Key, type Lang } from './i18n';
import { baseName, looksLikeCSV, readTable } from './lib/csv';
import { imageUrl, loadData, type Data } from './lib/data';
import { $, h } from './lib/dom';
import { realignedCSV, textList } from './lib/exports';
import { daysBetween, fmtDate, fmtInt, fmtPct, fmtPrint } from './lib/format';
import { norm } from './lib/norm';
import { clearAll, idbGet, idbSet, lsGet, lsSet } from './lib/store';
import { parseTextList } from './lib/text';
import type { Group, Role, Row } from './lib/types';
import { collectionIndex, type CollectionIndex, type Owned } from './lib/quick';
import { buildGroups, displayPrint, memberCodes, printsInSets, rarityHere, type SetGroup, type SetRow } from './lib/sets';
import { renderAbout } from './ui/about';
import { initSetPicker } from './ui/setpicker';
import { initDust } from './ui/dust';
import { initQuick } from './ui/quick';
import { cancelClose, closeSheet, isHoverBlocked, isOpenFor, openSheet, recentlyClosed, renderGrid, scheduleClose, unblockHover } from './ui/sheet';

// Elenchi di carte: 10 alla volta; filtri, ordinamento, riepiloghi ed export lavorano sempre sulla lista completa.
const PAGE = 10;
const NEW_DAYS = 60;
const STALE_DAYS = 182;
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
  groups: [] as Group[],
  roles: {} as Record<string, Role>,
  opts: { ...DEFAULT_OPTS } as Opts,
  showMissing: false,
  savedAt: null as number | null,
  query: '',
  seen: (lsGet('seen') as 'all' | 'recent' | 'old') || 'all',
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
  setFilter: null as string | null,
  setCodes: null as Set<string> | null,
  setHidden: false,
  setOwned: false,
};
let quick: { refresh(): void } | null = null;
let dust: { refresh(): void } | null = null;
let setPicker: { refresh(): void } | null = null;
let setsLoading: Promise<Map<string, SetGroup> | null> | null = null;
let toastTimer: number | undefined;
let resetTimer: number | undefined;
let hoverTimer: number | undefined;
let saveTimer: number | undefined;
let focusNoSheet = false;

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
    const ok = await idbSet('state', {
      v: 2, groups: S.groups, roles: S.roles, opts: S.opts, showMissing: S.showMissing, savedAt: S.savedAt,
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

function beginImport(): void {
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
  setPicker?.refresh();
}

/* ---------- filtro per espansione ---------- */

async function loadSetGroups(): Promise<Map<string, SetGroup> | null> {
  if (S.setGroups) return S.setGroups;
  setsLoading ??= fetch('data/sets.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((rows: SetRow[] | null) => (S.setGroups = rows ? buildGroups(rows) : null))
    .catch(() => null);
  return setsLoading;
}

const selectedGroup = (): SetGroup | null => (S.setFilter && S.setGroups?.get(S.setFilter)) || null;

/** Con un'espansione scelta, la lista (e gli export) si restringe alle carte stampate in quel gruppo di set. */
function applySetFilter(): void {
  const g = selectedGroup();
  S.setCodes = g ? memberCodes(g, S.setHidden) : null;
  if (S.setCodes) {
    const codes = S.setCodes;
    S.results = S.results.filter((x) => printsInSets(S.d!, x.idx, codes).length > 0);
  }
}

function selectSet(code: string | null): void {
  S.setFilter = code;
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
    line.replaceChildren(t('load.collection'), h('b', null, cardsWord(collectionCards())), ' · ',
      h('button', { class: 'linkbtn', type: 'button', id: 'replace' }, t('load.replace')));
  }
}

function renderFilters(): void {
  const d = S.d!;
  const counts = presetCounts(d, S.opts);
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
  const owned = R.filter((x) => x.owned > 0).length;
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
    v = t('res.owned', { n: owned });
    sub = t('res.ownedSub', { total: fmtInt(R.length), period });
  }
  $('#verdict').textContent = v;
  $('#sub').textContent = sub;
  $('#thQty').textContent = coll ? t('th.qtyYours') : t('th.qtyTypical');
  renderRows();
}

function filtered(): Result[] {
  const d = S.d!;
  const q = norm(S.query);
  const anchor = d.cards.anchor;
  // senza espansione: di default solo le possedute; con un'espansione: tutte (esplorazione), a richiesta solo le possedute
  const onlyOwned = hasColl() && (S.setCodes ? S.setOwned : !S.showMissing);
  let rows = S.results.filter((x) => {
    if (onlyOwned && x.owned === 0) return false;
    const c = d.cards.c[x.idx];
    if (q && !norm(c.n).includes(q)) return false;
    if (S.seen !== 'all') {
      const old = daysBetween(c.z, anchor) > STALE_DAYS;
      if (S.seen === 'old' ? !old : old) return false;
    }
    return true;
  });
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

/** Vista per espansione: immagine della stampa di quel set ed etichetta della rarità "qui". */
function setThumb(x: Result): { thumb: { id: string; owned: boolean }; label: string; common: boolean } | null {
  const d = S.d!;
  const codes = S.setCodes!;
  const prints = d.prints.p[x.idx] || [];
  const pi = displayPrint(d, x.idx, codes, S.setFilter!);
  if (pi < 0) return null;
  const id = prints[pi][0];
  const ownedHere = ownedPrintInSet(x);
  const ownedId = ownedHere ? (ownedHere.row.i || prints[ownedHere.print][0]) : '';
  const r = rarityHere(d, x.idx, codes)!;
  let label: string;
  if (r.common) label = t('set.common');
  else {
    const rarity = t(`rarity.${r.rarity}` as Key);
    const entry = r.entrySet ? d.cards.sets[r.entrySet] : null;
    label = entry ? t('set.notCommon', { rarity, set: entry[0], year: entry[1].slice(0, 4) }) : t('set.notCommonPlain', { rarity });
  }
  return { thumb: { id: ownedId || id, owned: !!ownedHere }, label, common: r.common };
}

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
    $('#cardRows').replaceChildren(h('tr', { class: 'nores' }, h('td', { colspan: 5 },
      S.query || S.seen !== 'all' ? t('res.noMatch') : S.setCodes ? (S.setOwned ? t('res.noOwned') : t('set.empty'))
        : coll && !S.showMissing ? t('res.noOwned') : t('res.none'))));
    return;
  }
  $('#cardRows').replaceChildren(...rows.map((x) => {
    const c = d.cards.c[x.idx];
    const st = c.s[S.opts.win];
    const setView = S.setCodes ? setThumb(x) : null;
    const thumbs = setView ? [setView.thumb] : thumbIds(x);
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
          class: 'thumb' + (th.owned ? ' owned' : ''), src: imageUrl(th.id, 'small'), alt: '', loading: 'lazy', width: 146, height: 204,
          dataset: refId ? { fallback: imageUrl(refId, 'small') } : undefined,
        })),
        thumbs.length > 3 ? h('span', { class: 'more-n' }, `+${thumbs.length - 3}`) : null),
      h('span', { class: 'nmwrap' }, h('span', { class: 'nm' }, c.n), status,
        isNew(c.e) ? h('span', { class: 'badge new' }, t('badge.new')) : null,
        c.l === 'b' ? h('span', { class: 'badge banned' }, t('badge.banned')) : null,
        setView ? h('span', { class: 'rarity' + (setView.common ? ' is-common' : '') }, setView.label) : null, own));
    return h('tr', { class: coll ? `r-${x.status}` : '' },
      h('td', { class: 'c-name' }, btn),
      h('td', { class: 'c-qty num', 'data-label': t('mobile.qty') }, coll ? String(x.owned) : String(x.typical)),
      h('td', { class: 'c-pct num', 'data-label': t('mobile.decks') }, fmtPct(x.share), h('span', { class: 'muted' }, st ? ` · ${fmtInt(S.opts.side ? st[0] : st[1])}` : '')),
      h('td', { class: 'c-seen', 'data-label': t('mobile.last') }, fmtDate(c.z)),
      h('td', { class: 'c-entry', 'data-label': t('mobile.entry') }, entry && c.e ? `${c.e.toUpperCase()} ${entry[1].slice(0, 4)}` : '—'));
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
  if (kind === 'csv') return realignedCSV(d, S.results);
  return textList(d, S.results, kind as 'owned' | 'missing');
}

const LABEL: Record<string, Key> = { owned: 'export.labelOwned', missing: 'export.labelMissing', csv: 'export.labelCsv' };

async function doCopy(kind: string): Promise<void> {
  const text = payload(kind);
  if (!text.trim()) return toast(t('export.nothingCopy', { what: t(LABEL[kind]) }));
  try {
    await navigator.clipboard.writeText(text);
    return toast(t('export.copied', { what: t(LABEL[kind]) }));
  } catch {
    ($('#copyText') as HTMLTextAreaElement).value = text;
    $('#copyPanel').hidden = false;
    ($('#copyText') as HTMLTextAreaElement).select();
  }
}

function doSave(kind: string): void {
  const text = payload(kind);
  if (!text.trim()) return toast(t('export.nothingSave', { what: t(LABEL[kind]) }));
  const filename = t(kind === 'csv' ? 'export.fileCsv' : kind === 'owned' ? 'export.fileOwned' : 'export.fileMissing');
  const url = URL.createObjectURL(new Blob([text], { type: kind === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' }));
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(t('export.saved', { file: filename }));
}

/* ---------- scheda ---------- */

function openFor(btn: HTMLElement, mode: 'hover' | 'click'): void {
  const d = S.d!;
  const idx = Number(btn.dataset.idx);
  const res = S.results.find((x) => x.idx === idx) || null;
  const approx = !!res && res.prints.length > 0 && res.prints.every((p) => !p.exact);
  openSheet(btn, {
    d, opts: S.opts, idx, res: hasColl() ? res : null, approx,
    onShowAll: (items, title) => renderGrid($('#gridDialog') as HTMLDialogElement, items, title),
  }, mode);
}

/** Scheda degli artwork dal controllo rapido: anche per carte fuori dalla lista con i filtri attuali. */
function openArtworksFor(anchor: HTMLElement, idx: number, owned: Owned | null): void {
  const d = S.d!;
  const c = d.cards.c[idx];
  const res: Result | null = hasColl() ? {
    idx, owned: owned?.total || 0, need: 1, typical: typicalCopies(c, S.opts), share: deckShare(d, c, S.opts),
    status: owned && owned.total > 0 ? 'owned' : 'missing', prints: owned?.prints || [], binders: owned?.binders || [],
  } : null;
  const approx = !!res && res.prints.length > 0 && res.prints.every((p) => !p.exact);
  openSheet(anchor, {
    d, opts: S.opts, idx, res, approx,
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
  $('#viewMain').hidden = about;
  $('#viewAbout').hidden = !about;
  // nella pagina Informazioni il blocco legale e la FAQ sulle donazioni sostituiscono il piè di pagina
  document.querySelector<HTMLElement>('.wrap > .foot')!.hidden = about;
  closeSheet();
  if (about) {
    renderAbout($('#viewAbout'), S.d);
    window.scrollTo(0, 0);
  }
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
  $('#search').addEventListener('input', (e) => {
    S.query = (e.target as HTMLInputElement).value;
    S.shown = PAGE;
    renderRows();
  });
  const seenSel = $('#seenFilter') as HTMLSelectElement;
  seenSel.value = S.seen;
  seenSel.addEventListener('change', () => {
    S.seen = seenSel.value as typeof S.seen;
    lsSet('seen', S.seen);
    S.shown = PAGE;
    renderRows();
  });
  const sortSel = $('#sort') as HTMLSelectElement;
  sortSel.value = S.sort;
  sortSel.addEventListener('change', () => {
    S.sort = sortSel.value as typeof S.sort;
    lsSet('sort', S.sort);
    S.shown = PAGE;
    renderRows();
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
    renderRows();
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
  const rows = $('#cardRows');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  rows.addEventListener('mouseover', (e) => {
    if (!fine.matches) return;
    const b = (e.target as HTMLElement).closest<HTMLElement>('.cardbtn');
    if (!b) return;
    cancelClose();
    window.clearTimeout(hoverTimer);
    if (isOpenFor(Number(b.dataset.idx)) || isHoverBlocked(b)) return;
    hoverTimer = window.setTimeout(() => openFor(b, 'hover'), 220);
  });
  rows.addEventListener('mouseout', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.cardbtn');
    if (!b || b.contains(e.relatedTarget as Node)) return;
    unblockHover(b);
    window.clearTimeout(hoverTimer);
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
    await clearAll();
    Object.assign(S, { groups: [], roles: {}, opts: { ...DEFAULT_OPTS }, showMissing: false, savedAt: null, summaries: [], query: '', replacing: false });
    ($('#search') as HTMLInputElement).value = '';
    showErrors([]);
    // anche la lingua scelta è cancellata: si torna a quella del browser
    setLang(detectLang(null, navigator.languages || [navigator.language]));
    applyStatic();
    if (S.d) renderDataline();
    refresh(false);
    toast(t('clear.done'));
  });

  $('#theme').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    lsSet('theme', next);
    applyTheme(next);
  });
  window.addEventListener('hashchange', route);

  // immagine non disponibile (per esempio uno Scryfall ID sconosciuto): ripiego sulla printing di riferimento
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.dataset.fallback && img.src !== img.dataset.fallback) {
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
      ($('#setHidden') as HTMLInputElement).checked = true;
      if (S.setFilter) refresh(false);
    },
  });
  quick = initQuick({
    data: () => S.d, opts: () => S.opts, collection: () => (hasColl() ? S.cix : null), openArtworks: openArtworksFor,
  });
  dust = initDust({
    data: () => S.d, opts: () => S.opts, collection: () => (hasColl() ? S.cix : null), openArtworks: openArtworksFor,
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
  await restore();
  refresh(false);
  if (location.hash === '#informazioni') renderAbout($('#viewAbout'), S.d);
  void renderNews();
}

void main();
