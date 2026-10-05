import './style.css';

import {
  compute, DEFAULT_OPTS, defaultRole, presetCounts, summarize, WINDOW_LABELS,
  type ImportSummary, type Opts, type Result,
} from './lib/compare';
import { baseName, isFoil, looksLikeCSV, readTable } from './lib/csv';
import { imageUrl, loadData, type Data } from './lib/data';
import { $, h } from './lib/dom';
import { realignedCSV, textList } from './lib/exports';
import { daysBetween, fmtDate, fmtInt, fmtPct } from './lib/format';
import { norm } from './lib/norm';
import { clearAll, idbGet, idbSet, lsGet, lsSet } from './lib/store';
import { parseTextList } from './lib/text';
import type { Group, Role, Row } from './lib/types';
import { renderAbout } from './ui/about';
import { cancelClose, closeSheet, isOpenFor, openSheet, renderGrid, scheduleClose } from './ui/sheet';

const PAGE = 100;
const NEW_DAYS = 60;
const STALE_MONTHS_DAYS = 182;
const STATUS = { owned: 'Posseduta', partial: 'Parziale', missing: 'Mancante' } as const;

interface Saved {
  v: 2;
  groups: Group[];
  roles: Record<string, Role>;
  opts: Opts;
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
  savedAt: null as number | null,
  filter: 'all' as 'all' | 'owned' | 'partial' | 'missing',
  query: '',
  seen: (lsGet('seen') as 'all' | 'recent' | 'old') || 'all',
  sort: (lsGet('sort') as 'share' | 'name' | 'recent' | 'oldest') || 'share',
  results: [] as Result[],
  view: [] as Result[],
  shown: PAGE,
  order: [] as Result[],
  summaries: [] as SummaryItem[],
  allNames: null as Set<string> | null,
};
let animateNext = false;
let toastTimer: number | undefined;
let resetTimer: number | undefined;
let hoverTimer: number | undefined;

/* ---------- utilità ---------- */

function toast(msg: string): void {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 2600);
}

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

let saveTimer: number | undefined;
function persist(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    S.savedAt = Date.now();
    const ok = await idbSet('state', { v: 2, groups: S.groups, roles: S.roles, opts: S.opts, savedAt: S.savedAt } satisfies Saved);
    $('#memo').textContent = ok ? memoText() : 'Questo browser non permette di salvare la collezione: la prossima volta dovrai ricaricarla.';
  }, 150);
}

function memoText(): string {
  if (!S.savedAt) return '';
  const d = new Date(S.savedAt);
  return `Ultimo aggiornamento: ${d.toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Per aggiornare un Binder ricarica il suo export: sostituisce quello vecchio.`;
}

async function restore(): Promise<void> {
  const saved = await idbGet<Saved>('state');
  if (!saved || saved.v !== 2 || !Array.isArray(saved.groups)) return;
  S.groups = saved.groups;
  S.roles = saved.roles || {};
  S.opts = { ...DEFAULT_OPTS, ...(saved.opts || {}) };
  S.savedAt = saved.savedAt || null;
}

/* ---------- importazione ---------- */

function addGroups(gs: Group[]): void {
  for (const g of gs) {
    const i = S.groups.findIndex((x) => x.id === g.id);
    if (i >= 0) S.groups[i] = g;
    else S.groups.push(g);
    if (!S.roles[g.id]) S.roles[g.id] = defaultRole(g);
  }
}

function textGroup(rows: Row[], label: string): Group {
  let n = 1;
  let id = 'testo';
  while (S.groups.some((g) => g.id === id)) id = `testo-${++n}`;
  return { id, name: n > 1 ? `${label} ${n}` : label, type: '', source: label, rows, hasProxy: false, kind: 'text' };
}

async function summarizeImport(source: string, kind: 'csv' | 'text', groups: Group[]): Promise<void> {
  if (!S.d) return;
  let s = summarize(S.d, groups);
  if (s.unrecognized.length) {
    const all = await getAllNames();
    if (all) s = summarize(S.d, groups, all);
  }
  S.summaries = [{ source, kind, s }, ...S.summaries.filter((x) => x.source !== source)].slice(0, 4);
  renderSummaries();
}

function readOne(name: string, text: string): { groups?: Group[]; kind?: 'csv' | 'text'; error?: string } {
  if (text.includes('\u0000')) return { error: `${name}: non è un file di testo o CSV.` };
  if (/\.csv$/i.test(name) || looksLikeCSV(text)) {
    const res = readTable(name, text);
    if ('groups' in res) return { groups: res.groups, kind: 'csv' };
    if (res.error === 'noname') {
      return { error: `${name}: non sembra un export di ManaBox: nella prima riga non c’è una colonna con il nome della carta (per esempio "Name"). Intestazioni lette: ${res.headers.slice(0, 8).join(', ')}.` };
    }
    return { error: `${name}: il file non contiene carte.` };
  }
  const { rows } = parseTextList(text);
  if (!rows.length) return { error: `${name}: non trovo righe nel formato "4 Nome carta".` };
  return { groups: [textGroup(rows, baseName(name) || 'Testo')], kind: 'text' };
}

async function handleFiles(files: File[]): Promise<void> {
  const errs: string[] = [];
  let added = false;
  for (const f of files) {
    let text: string;
    try {
      text = await f.text();
    } catch {
      errs.push(`${f.name}: impossibile leggere il file.`);
      continue;
    }
    const r = readOne(f.name, text);
    if (r.error) errs.push(r.error);
    if (r.groups) {
      addGroups(r.groups);
      added = true;
      await summarizeImport(f.name, r.kind!, r.groups);
    }
  }
  showErrors(errs);
  if (added) {
    animateNext = true;
    refresh();
  }
}

async function handleText(): Promise<void> {
  const ta = $('#pasteText') as HTMLTextAreaElement;
  const text = ta.value;
  if (!text.trim()) {
    showErrors(['Il riquadro è vuoto: incolla una lista di carte, una per riga (per esempio "4 Ponder").']);
    return;
  }
  let groups: Group[];
  let kind: 'csv' | 'text';
  if (looksLikeCSV(text)) {
    const res = readTable('Testo incollato', text);
    if (!('groups' in res)) {
      showErrors(['Il testo sembra un CSV ma non contiene carte.']);
      return;
    }
    groups = res.groups;
    kind = 'csv';
  } else {
    const { rows } = parseTextList(text);
    if (!rows.length) {
      showErrors(['Il testo incollato non contiene carte. Usa una riga per carta, per esempio "4 Ponder" o "1 Ponder (M12) 73".']);
      return;
    }
    groups = [textGroup(rows, 'Testo incollato')];
    kind = 'text';
  }
  showErrors([]);
  addGroups(groups);
  ta.value = '';
  await summarizeImport(groups.length === 1 ? groups[0].name : 'Testo incollato', kind, groups);
  animateNext = true;
  refresh();
}

function showErrors(list: string[]): void {
  $('#errors').replaceChildren(...list.map((e) => h('li', null, e)));
}

function renderSummaries(): void {
  const root = $('#importSummary');
  root.replaceChildren(...S.summaries.map(({ source, kind, s }) => {
    const bits = [`${fmtInt(s.rows)} righe lette`, `${fmtInt(s.inList)} di carte della lista`];
    if (s.notInList) bits.push(`${fmtInt(s.notInList)} di carte mai giocate in Pauper`);
    bits.push(`${fmtInt(s.unrecognized.length)} non riconosciute`);
    const shown = s.unrecognized.slice(0, 60);
    return h('div', { class: 'item' },
      h('b', null, source), ': ', bits.join(', ') + '.',
      kind === 'text' ? h('p', { class: 'note' }, 'Con il testo non ci sono Binder: tutte le carte incollate contano come possedute.') : null,
      s.approxPrint ? h('p', { class: 'note' }, `${fmtInt(s.approxPrint)} righe senza set e numero: per l'immagine uso la printing di riferimento.`) : null,
      shown.length
        ? h('details', null, h('summary', null, 'Righe non riconosciute'),
          h('ul', null, ...shown.map((r) => h('li', null, `${r.q} ${r.n}${r.s ? ` (${r.s.toUpperCase()})` : ''}`))),
          s.unrecognized.length > shown.length ? h('p', { class: 'note' }, `e altre ${s.unrecognized.length - shown.length}.`) : null,
          h('p', { class: 'note' }, 'Controlla che il nome sia in inglese e scritto per intero.'))
        : null);
  }));
}

/* ---------- rendering ---------- */

function refresh(save = true): void {
  if (!S.d) return;
  S.results = compute(S.d, S.groups, S.roles, S.opts);
  S.shown = PAGE;
  render();
  if (save) persist();
}

function render(): void {
  renderGroups();
  renderPresets();
  renderResults();
}

function renderBanner(): void {
  const b = $('#banner');
  const d = S.d;
  if (!d) return;
  const m = d.meta;
  const parts: (Node | string)[] = [
    h('span', null, 'Dati al ', h('b', null, fmtDate(m.last_tournament))),
    h('span', null, `${fmtInt(m.tournaments)} tornei · ${fmtInt(m.decks)} mazzi`),
  ];
  if (m.source.status === 'ferma') {
    parts.push(h('span', { class: 'warn' }, `Attenzione: la fonte dei tornei non si aggiorna da ${m.source.days_since_last_tournament} giorni, i dati più recenti potrebbero mancare.`));
  }
  b.classList.remove('error');
  b.replaceChildren(...parts);
}

function seg(id: string, val: Role, label: string, role: Role): HTMLLabelElement {
  return h('label', null, h('input', { type: 'radio', name: `role-${id}`, value: val, dataset: { gid: id }, checked: role === val }),
    h('span', null, label));
}

function renderGroups(): void {
  const has = S.groups.length > 0;
  $('#assign').hidden = !has;
  if (!has) return;
  $('#groupRows').replaceChildren(...S.groups.map((g) => {
    const role = S.roles[g.id];
    const cards = g.rows.reduce((a, r) => a + r.q, 0);
    const typ = g.kind === 'text' ? 'testo' : g.type || '';
    return h('tr', null,
      h('td', { class: 'g-name' }, h('span', { class: 'gname' }, g.name), typ ? h('span', { class: 'gtype' }, typ) : null),
      h('td', { class: 'g-count count num' }, `${fmtInt(g.rows.length)} voci, ${fmtInt(cards)} carte`),
      h('td', { class: 'g-role' }, h('div', { class: 'seg', role: 'radiogroup', 'aria-label': `Ruolo di ${g.name}` },
        seg(g.id, 'coll', 'Le mie carte', role), seg(g.id, 'skip', 'Ignora', role))),
      h('td', { class: 'g-act' }, h('button', { class: 'btn quiet', type: 'button', dataset: { remove: g.id } }, 'Rimuovi')));
  }));
  ($('#optProxy') as HTMLInputElement).checked = S.opts.proxies;
  $('#optProxyWrap').hidden = !S.groups.some((g) => g.hasProxy && S.roles[g.id] === 'coll');
  if (!$('#memo').textContent) $('#memo').textContent = memoText();
}

function renderPresets(): void {
  const d = S.d!;
  const counts = presetCounts(d, S.opts);
  const desc = ['ultimi 61 giorni', 'ultimi 12 mesi', 'ultimi 24 mesi', 'dal 2014'];
  $('#presets').replaceChildren(...WINDOW_LABELS.map((label, i) => h('label', { class: 'preset' },
    h('input', { type: 'radio', name: 'preset', value: String(i), checked: S.opts.win === i }),
    h('b', null, label + (i === 1 ? ' (default)' : '')),
    h('small', { class: 'sub' }, `${desc[i]} · ${fmtInt(d.cards.tot[i][0])} mazzi`),
    h('span', { class: 'n' }, fmtInt(counts[i])), h('small', null, counts[i] === 1 ? ' carta' : ' carte'))));
  ($('#optMin') as HTMLInputElement).value = String(S.opts.minDecks);
  ($('#optLegal') as HTMLInputElement).checked = S.opts.legalOnly;
  ($('#optBasics') as HTMLInputElement).checked = S.opts.noBasics;
  ($('#optSide') as HTMLInputElement).checked = S.opts.side;
  ($('#optQty') as HTMLInputElement).checked = S.opts.qty;
}

function renderResults(): void {
  const R = S.results;
  const tot = R.length;
  const coll = hasColl();
  const own = R.filter((x) => x.status === 'owned').length;
  const par = R.filter((x) => x.status === 'partial').length;
  const mis = tot - own - par;

  let v: string;
  if (!S.groups.length) v = `La lista contiene ${fmtInt(tot)} carte. Carica la tua collezione per vedere quali possiedi.`;
  else if (!coll) v = 'Nessun gruppo conta come tue carte: imposta almeno un gruppo su “Le mie carte”.';
  else if (!tot) v = 'Con queste impostazioni la lista è vuota.';
  else if (S.opts.qty) v = `Hai tutte le copie per ${fmtInt(own)} carte su ${fmtInt(tot)}${par ? `, e una parte delle copie per altre ${fmtInt(par)}.` : '.'}`;
  else v = `Possiedi ${fmtInt(own)} delle ${fmtInt(tot)} carte della lista, in qualunque printing.`;
  $('#verdict').textContent = v;

  const box = $('#box');
  box.hidden = $('#boxmeta').hidden = $('#export').hidden = !coll;
  if (coll) {
    S.order = [...R.filter((x) => x.status === 'owned'), ...R.filter((x) => x.status === 'partial'), ...R.filter((x) => x.status === 'missing')];
    box.className = 'box' + (tot > 400 ? ' dense' : '') + (animateNext ? ' animate' : '');
    box.setAttribute('aria-label', `${own} carte possedute${par ? `, ${par} parziali` : ''}, ${mis} mancanti su ${tot}`);
    box.replaceChildren(...S.order.map((x, i) => h('span', {
      class: `tick ${x.status}`, dataset: { i: String(i) },
      style: animateNext && x.status !== 'missing' ? { '--d': `${Math.round((i / Math.max(tot, 1)) * 600)}ms` } : undefined,
    })));
    $('#legend').replaceChildren(
      h('span', null, h('i', { class: 'owned' }), `Possedute ${fmtInt(own)}`),
      ...(S.opts.qty ? [h('span', null, h('i', { class: 'partial' }), `Parziali ${fmtInt(par)}`)] : []),
      h('span', null, h('i'), `Mancanti ${fmtInt(mis)}`));
  }
  animateNext = false;

  if (!S.opts.qty && S.filter === 'partial') S.filter = 'all';
  if (!coll) S.filter = 'all';
  const tabs: [typeof S.filter, string, number][] = [['all', 'Tutte', tot]];
  if (coll) {
    tabs.push(['owned', 'Possedute', own]);
    if (S.opts.qty) tabs.push(['partial', 'Parziali', par]);
    tabs.push(['missing', 'Mancanti', mis]);
  }
  $('#tabs').replaceChildren(...tabs.map(([val, label, n]) => h('label', null,
    h('input', { type: 'radio', name: 'tab', value: val, checked: S.filter === val }),
    h('span', null, `${label} `, h('span', { class: 'num' }, fmtInt(n))))));
  renderRows();
}

function filtered(): Result[] {
  const d = S.d!;
  const q = norm(S.query);
  const anchor = d.cards.anchor;
  let rows = S.results.filter((x) => {
    if (S.filter !== 'all' && x.status !== S.filter) return false;
    const c = d.cards.c[x.idx];
    if (q && !norm(c.n).includes(q)) return false;
    if (S.seen !== 'all') {
      const old = daysBetween(c.z, anchor) > STALE_MONTHS_DAYS;
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

function thumbIds(x: Result): { id: string; owned: boolean }[] {
  const d = S.d!;
  const prints = d.prints.p[x.idx] || [];
  const ids: { id: string; owned: boolean }[] = [];
  for (const p of x.prints) {
    const id = p.row.i || (p.print >= 0 ? prints[p.print][0] : '');
    if (id && !ids.some((t) => t.id === id)) ids.push({ id, owned: true });
  }
  if (x.prints.length && !ids.length) {
    const ref = prints[d.cards.c[x.idx].r];
    if (ref) ids.push({ id: ref[0], owned: true }); // posseduta ma printing non indicata
  }
  if (!ids.length) {
    const ref = prints[d.cards.c[x.idx].r];
    if (ref) ids.push({ id: ref[0], owned: false });
  }
  return ids;
}

function fmtPrint(r: Row): string {
  const parts: string[] = [];
  const set = r.s ? r.s.toUpperCase() : r.sn || '';
  if (set) parts.push(set);
  if (r.c) parts.push('#' + r.c);
  if (isFoil(r.f)) parts.push(/^(true|yes|1|y)$/i.test(r.f) ? 'foil' : r.f.toLowerCase());
  if (r.l && !/^(en|english)$/i.test(r.l)) parts.push(r.l.toLowerCase());
  if (r.p) parts.push('proxy');
  return parts.join(' ') || 'printing non indicata';
}

function renderRows(): void {
  const d = S.d!;
  const coll = hasColl();
  S.view = filtered();
  const rows = S.view.slice(0, S.shown);
  $('#count').textContent = `${fmtInt(S.view.length)} ${S.view.length === 1 ? 'carta' : 'carte'}${S.view.length > rows.length ? `, ne vedi ${fmtInt(rows.length)}` : ''}.`;
  const more = $('#more');
  more.hidden = S.view.length <= rows.length;
  more.textContent = `Mostra altre ${fmtInt(Math.min(PAGE, S.view.length - rows.length))}`;
  if (!rows.length) {
    $('#cardRows').replaceChildren(h('tr', { class: 'nores' }, h('td', { colspan: 7 }, 'Nessuna carta corrisponde.')));
    return;
  }
  $('#cardRows').replaceChildren(...rows.map((x) => {
    const c = d.cards.c[x.idx];
    const st = c.s[S.opts.win];
    const thumbs = thumbIds(x);
    const entry = c.e ? d.cards.sets[c.e] : null;
    const btn = h('button', { class: 'cardbtn', type: 'button', dataset: { idx: String(x.idx) }, 'aria-haspopup': 'dialog', 'aria-label': `${c.n}: apri la scheda` },
      h('span', { class: 'thumbs' },
        ...thumbs.slice(0, 3).map((t) => h('img', { class: 'thumb' + (t.owned ? ' owned' : ''), src: imageUrl(t.id, 'small'), alt: '', loading: 'lazy', width: 146, height: 204 })),
        thumbs.length > 3 ? h('span', { class: 'more-n' }, `+${thumbs.length - 3}`) : null),
      h('span', null, h('span', { class: 'nm' }, c.n),
        isNew(c.e) ? h('span', { class: 'badge new' }, 'nuova') : null,
        c.l === 'b' ? h('span', { class: 'badge banned' }, 'bannata') : null));
    const prints = x.prints.length ? x.prints.map((p) => `${fmtPrint(p.row)} ×${p.q}`).join(', ') : coll ? 'nessuna' : '';
    return h('tr', null,
      h('td', { class: 'c-name' }, btn),
      h('td', { class: 'c-status' }, coll ? h('span', { class: `st st-${x.status}` }, STATUS[x.status]) : h('span', { class: 'muted' }, '—')),
      h('td', { class: 'c-qty num' }, coll ? (S.opts.qty ? `${x.owned} / ${x.need}` : String(x.owned)) : `tipiche ${x.typical}`),
      h('td', { class: 'c-pct num' }, fmtPct(x.share), h('div', { class: 'muted' }, st ? fmtInt(S.opts.side ? st[0] : st[1]) : '0')),
      h('td', { class: 'c-seen' }, fmtDate(c.z)),
      h('td', { class: 'c-entry' }, entry && c.e ? `${c.e.toUpperCase()} (${entry[1].slice(0, 4)})` : '—'),
      h('td', { class: 'c-own' }, prints, x.binders.length ? h('div', { class: 'where' }, x.binders.map((b) => b[0]).join(', ')) : null));
  }));
}

async function renderNews(): Promise<void> {
  const root = $('#news');
  const empty = h('p', { class: 'hint' }, 'Nessuna revisione ancora. Quando esce un nuovo set che porta carte nel Pauper, dopo 60 giorni qui compare il resoconto: carte nuove nella lista, carte uscite, ban e unban.');
  try {
    const r = await fetch('data/reviews/index.json');
    if (!r.ok) {
      root.replaceChildren(empty);
      return;
    }
    const list = (await r.json()) as { set: string; nome: string; data: string; sommario?: string }[];
    if (!Array.isArray(list) || !list.length) {
      root.replaceChildren(empty);
      return;
    }
    root.replaceChildren(h('ul', { class: 'news' }, ...list.slice(0, 6).map((x) => h('li', null,
      h('b', null, `${x.nome} (${String(x.set).toUpperCase()})`), ` · ${fmtDate(x.data)}`,
      x.sommario ? h('p', { class: 'hint' }, x.sommario) : null))));
  } catch {
    root.replaceChildren(empty);
  }
}

/* ---------- export ---------- */

function payload(kind: string): string {
  const d = S.d!;
  if (kind === 'csv') return realignedCSV(d, S.results);
  return textList(d, S.results, kind as 'owned' | 'missing', S.opts.qty);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const LABEL: Record<string, string> = { owned: 'carte possedute', missing: 'carte mancanti', csv: 'List riallineata' };

async function doCopy(kind: string): Promise<void> {
  const text = payload(kind);
  if (!text.trim()) return toast(`Non ci sono ${LABEL[kind]} da copiare.`);
  if (await copyText(text)) return toast(`Copiato: ${LABEL[kind]}.`);
  ($('#copyText') as HTMLTextAreaElement).value = text;
  $('#copyPanel').hidden = false;
  ($('#copyText') as HTMLTextAreaElement).select();
}

function doSave(kind: string): void {
  const text = payload(kind);
  if (!text.trim()) return toast(`Non ci sono ${LABEL[kind]} da salvare.`);
  const filename = kind === 'csv' ? 'list-riallineata.csv' : kind === 'owned' ? 'possedute.txt' : 'mancanti.txt';
  const url = URL.createObjectURL(new Blob([text], { type: kind === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' }));
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`Scaricato: ${filename}`);
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

/* ---------- tema e viste ---------- */

function applyTheme(t: string | null): void {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t;
  else delete root.dataset.theme;
  const dark = t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  $('#theme').textContent = dark ? 'Tema chiaro' : 'Tema scuro';
}

function route(): void {
  const about = location.hash === '#informazioni';
  $('#viewMain').hidden = about;
  $('#viewAbout').hidden = !about;
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
        const t = await navigator.clipboard.readText();
        const ta = $('#pasteText') as HTMLTextAreaElement;
        ta.value = t;
        ta.focus();
        if (!t.trim()) toast('Gli appunti sono vuoti.');
      } catch {
        toast('Il browser non permette di leggere gli appunti: incolla nel riquadro con un tocco prolungato.');
      }
    });
  }

  $('#groupRows').addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name?.startsWith('role-') && t.dataset.gid) {
      S.roles[t.dataset.gid] = t.value as Role;
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

  const optBool = (sel: string, key: 'legalOnly' | 'noBasics' | 'side' | 'qty' | 'proxies') =>
    $(sel).addEventListener('change', (e) => {
      S.opts[key] = (e.target as HTMLInputElement).checked;
      refresh();
    });
  optBool('#optLegal', 'legalOnly');
  optBool('#optBasics', 'noBasics');
  optBool('#optSide', 'side');
  optBool('#optQty', 'qty');
  optBool('#optProxy', 'proxies');
  $('#optMin').addEventListener('change', (e) => {
    const v = parseInt((e.target as HTMLInputElement).value, 10);
    S.opts.minDecks = Number.isFinite(v) && v > 0 ? Math.min(v, 9999) : 1;
    refresh();
  });
  $('#presets').addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'preset') {
      S.opts.win = Number(t.value);
      refresh();
    }
  });

  $('#tabs').addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'tab') {
      S.filter = t.value as typeof S.filter;
      S.shown = PAGE;
      renderRows();
    }
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
    S.shown += PAGE;
    renderRows();
  });

  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const c = t.closest<HTMLElement>('[data-copy]');
    if (c) return void doCopy(c.dataset.copy!);
    const s = t.closest<HTMLElement>('[data-save]');
    if (s) doSave(s.dataset.save!);
  });
  $('#copyClose').addEventListener('click', () => {
    $('#copyPanel').hidden = true;
  });

  // barra delle carte (dal prototipo)
  const showCap = (e: Event) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.tick');
    if (!t) return;
    const x = S.order[Number(t.dataset.i)];
    if (!x) return;
    const name = S.d!.cards.c[x.idx].n;
    const s = x.status === 'owned' ? 'posseduta' : x.status === 'partial' ? `${x.owned} copie su ${x.need}` : 'mancante';
    $('#caption').textContent = `${name}: ${s}`;
  };
  $('#box').addEventListener('pointerover', showCap);
  $('#box').addEventListener('click', showCap);

  // scheda: passaggio del cursore, focus da tastiera, tocco
  const rows = $('#cardRows');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  rows.addEventListener('mouseover', (e) => {
    if (!fine.matches) return;
    const b = (e.target as HTMLElement).closest<HTMLElement>('.cardbtn');
    if (!b) return;
    cancelClose();
    window.clearTimeout(hoverTimer);
    if (isOpenFor(Number(b.dataset.idx))) return;
    hoverTimer = window.setTimeout(() => openFor(b, 'hover'), 220);
  });
  rows.addEventListener('mouseout', (e) => {
    const b = (e.target as HTMLElement).closest('.cardbtn');
    if (!b || b.contains(e.relatedTarget as Node)) return;
    window.clearTimeout(hoverTimer);
    scheduleClose();
  });
  rows.addEventListener('focusin', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.cardbtn');
    if (b && b.matches(':focus-visible') && !isOpenFor(Number(b.dataset.idx))) openFor(b, 'hover');
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
    if (e.key === 'Escape' && !sheet.hidden) closeSheet(true);
  });
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (!sheet.hidden && !sheet.contains(t) && !t.closest('.cardbtn') && !t.closest('dialog')) closeSheet();
  });

  // cancella i miei dati (conferma in due tempi, come "Svuota tutto" del prototipo)
  $('#clearData').addEventListener('click', async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    if (!b.classList.contains('warn')) {
      b.classList.add('warn');
      b.textContent = 'Conferma: cancella collezione e preferenze';
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        b.classList.remove('warn');
        b.textContent = 'Cancella i miei dati';
      }, 4000);
      return;
    }
    window.clearTimeout(resetTimer);
    b.classList.remove('warn');
    b.textContent = 'Cancella i miei dati';
    window.clearTimeout(saveTimer);
    await clearAll();
    S.groups = [];
    S.roles = {};
    S.opts = { ...DEFAULT_OPTS };
    S.savedAt = null;
    S.summaries = [];
    S.filter = 'all';
    S.query = '';
    ($('#search') as HTMLInputElement).value = '';
    $('#memo').textContent = '';
    renderSummaries();
    showErrors([]);
    applyTheme(null);
    refresh(false);
    toast('Dati cancellati da questo dispositivo.');
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
}

/* ---------- avvio ---------- */

async function main(): Promise<void> {
  applyTheme(lsGet('theme'));
  wire();
  route();
  try {
    S.d = await loadData();
  } catch {
    const b = $('#banner');
    b.classList.add('error');
    b.textContent = 'Non riesco a caricare la lista delle carte. Ricarica la pagina tra qualche minuto.';
    return;
  }
  renderBanner();
  await restore();
  if (S.groups.length) animateNext = true;
  refresh(false);
  if (location.hash === '#informazioni') renderAbout($('#viewAbout'), S.d);
  void renderNews();
}

void main();
