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
const STALE_DAYS = 182;
const STALE_SOURCE_DAYS = 21;
const PERIOD_DESC = ['ultimi 61 giorni', 'ultimo anno', 'ultimi 2 anni', 'dal 2014'];
const PERIOD_LABELS = [`${WINDOW_LABELS[0]} (61 giorni)`, WINDOW_LABELS[1], WINDOW_LABELS[2], `${WINDOW_LABELS[3]} (dal 2014)`];

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
};
let toastTimer: number | undefined;
let resetTimer: number | undefined;
let hoverTimer: number | undefined;
let saveTimer: number | undefined;

/* ---------- utilità ---------- */

function toast(msg: string): void {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 2600);
}

const hasColl = () => S.groups.some((g) => S.roles[g.id] === 'coll');
const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n === 1 ? one : many}`;

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
    $('#memo').textContent = ok ? memoText() : 'Questo browser non permette di salvare la collezione: la prossima volta dovrai ricaricarla.';
  }, 150);
}

function memoText(): string {
  if (!S.savedAt) return '';
  const d = new Date(S.savedAt);
  return `Salvata su questo dispositivo il ${d.toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`;
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
  S.summaries = [{ source, kind, s }, ...S.summaries.filter((x) => x.source !== source)].slice(0, 6);
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
  const parsed: { name: string; r: ReturnType<typeof readOne> }[] = [];
  for (const f of files) {
    try {
      parsed.push({ name: f.name, r: readOne(f.name, await f.text()) });
    } catch {
      errs.push(`${f.name}: impossibile leggere il file.`);
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
    beginImport();
    groups = [textGroup(rows, 'Testo incollato')];
    kind = 'text';
  }
  if (kind === 'csv') beginImport();
  showErrors([]);
  addGroups(groups);
  ta.value = '';
  await summarizeImport(groups.length === 1 ? groups[0].name : 'Testo incollato', kind, groups);
  refresh();
}

function showErrors(list: string[]): void {
  $('#errors').replaceChildren(...list.map((e) => h('li', null, e)));
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
  renderLoad();
  renderFilters();
  renderResults();
  renderExtra();
}

function renderDataline(): void {
  const m = S.d!.meta;
  const el = $('#dataline');
  el.classList.remove('error');
  el.replaceChildren(`Tornei fino al ${fmtDate(m.last_tournament)} · ${fmtInt(m.tournaments)} tornei · ${fmtInt(m.decks)} mazzi · dati aggiornati il ${fmtDate(m.generated_at)}`);
  // allarme calcolato anche nel browser: se i dati non cambiano non c'è un nuovo commit, ma l'avviso deve comparire
  const days = daysBetween(m.last_tournament, new Date().toISOString().slice(0, 10));
  if (m.source.status === 'ferma' || days > STALE_SOURCE_DAYS) {
    el.append(h('span', { class: 'warn' }, `La fonte dei tornei non riceve nuovi tornei da ${days} giorni: i dati più recenti potrebbero mancare.`));
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
    line.replaceChildren('Collezione: ', h('b', null, plural(collectionCards(), 'carta', 'carte')), ' · ',
      h('button', { class: 'linkbtn', type: 'button', id: 'replace' }, 'Sostituisci'));
  }
}

function renderFilters(): void {
  const d = S.d!;
  const counts = presetCounts(d, S.opts);
  $('#period').replaceChildren(...PERIOD_LABELS.map((label, i) => h('option', { value: String(i), selected: S.opts.win === i },
    `${label} · ${fmtInt(counts[i])} carte`)));
  ($('#period') as HTMLSelectElement).value = String(S.opts.win);
  ($('#optMin') as HTMLInputElement).value = String(S.opts.minDecks);
  ($('#optLegal') as HTMLInputElement).checked = S.opts.legalOnly;
  ($('#optSide') as HTMLInputElement).checked = S.opts.side;
  ($('#optQty') as HTMLInputElement).checked = S.opts.qty;
}

function renderResults(): void {
  const R = S.results;
  const coll = hasColl();
  const period = PERIOD_DESC[S.opts.win];
  const owned = R.filter((x) => x.owned > 0).length;
  const full = R.filter((x) => x.status === 'owned').length;
  let v: string;
  let sub: string;
  if (!S.groups.length) {
    v = `${plural(R.length, 'carta giocata', 'carte giocate')} in Pauper`;
    sub = `Periodo: ${period}. Carica la tua collezione per vedere quali possiedi.`;
  } else if (!coll) {
    v = 'Nessun gruppo incluso nella collezione';
    sub = 'Includi almeno un Binder in "Binder inclusi", in fondo alla pagina.';
  } else {
    v = `Possiedi ${plural(owned, 'carta giocata', 'carte giocate')} in Pauper`;
    sub = `Su ${fmtInt(R.length)} nel periodo (${period})`
      + (S.opts.qty ? `; per ${fmtInt(full)} hai tutte le copie tipiche` : '') + '.';
  }
  $('#verdict').textContent = v;
  $('#sub').textContent = sub;
  $('#thQty').textContent = coll ? (S.opts.qty ? 'Tue / tipiche' : 'Tue') : 'Copie tipiche';
  renderRows();
}

function filtered(): Result[] {
  const d = S.d!;
  const q = norm(S.query);
  const anchor = d.cards.anchor;
  const onlyOwned = hasColl() && !S.showMissing;
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

function thumbIds(x: Result): { id: string; owned: boolean }[] {
  const d = S.d!;
  const prints = d.prints.p[x.idx] || [];
  const ref = prints[d.cards.c[x.idx].r];
  const ids: { id: string; owned: boolean }[] = [];
  for (const p of x.prints) {
    const id = p.row.i || (p.print >= 0 ? prints[p.print][0] : '');
    if (id && !ids.some((t) => t.id === id)) ids.push({ id, owned: true });
  }
  if (!ids.length && ref) ids.push({ id: ref[0], owned: x.prints.length > 0 });
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
  const more = $('#more');
  more.hidden = S.view.length <= rows.length;
  more.textContent = `Mostra altre ${fmtInt(Math.min(PAGE, S.view.length - rows.length))} (${fmtInt(S.view.length - rows.length)} rimaste)`;
  if (!rows.length) {
    $('#cardRows').replaceChildren(h('tr', { class: 'nores' }, h('td', { colspan: 5 },
      S.query || S.seen !== 'all' ? 'Nessuna carta corrisponde ai filtri.' : coll && !S.showMissing ? 'Nessuna carta posseduta in questo periodo.' : 'Nessuna carta.')));
    return;
  }
  $('#cardRows').replaceChildren(...rows.map((x) => {
    const c = d.cards.c[x.idx];
    const st = c.s[S.opts.win];
    const thumbs = thumbIds(x);
    const refId = d.prints.p[x.idx]?.[c.r]?.[0];
    const entry = c.e ? d.cards.sets[c.e] : null;
    const status = coll && x.status !== 'owned'
      ? h('span', { class: `badge st-${x.status}` }, x.status === 'missing' ? 'mancante' : 'parziale')
      : null;
    const own = x.prints.length
      ? h('span', { class: 'own' }, x.prints.map((p) => `${fmtPrint(p.row)} ×${p.q}`).join(', ')
        + (x.binders.length ? ` · ${x.binders.map((b) => b[0]).join(', ')}` : ''))
      : null;
    const btn = h('button', { class: 'cardbtn', type: 'button', dataset: { idx: String(x.idx) }, 'aria-haspopup': 'dialog', 'aria-label': `${c.n}: apri la scheda` },
      h('span', { class: 'thumbs' },
        ...thumbs.slice(0, 3).map((t) => h('img', {
          class: 'thumb' + (t.owned ? ' owned' : ''), src: imageUrl(t.id, 'small'), alt: '', loading: 'lazy', width: 146, height: 204,
          dataset: refId ? { fallback: imageUrl(refId, 'small') } : undefined,
        })),
        thumbs.length > 3 ? h('span', { class: 'more-n' }, `+${thumbs.length - 3}`) : null),
      h('span', { class: 'nmwrap' }, h('span', { class: 'nm' }, c.n), status,
        isNew(c.e) ? h('span', { class: 'badge new' }, 'nuova') : null,
        c.l === 'b' ? h('span', { class: 'badge banned' }, 'bannata') : null, own));
    return h('tr', { class: coll ? `r-${x.status}` : '' },
      h('td', { class: 'c-name' }, btn),
      h('td', { class: 'c-qty num' }, coll ? (S.opts.qty ? `${x.owned} / ${x.need}` : String(x.owned)) : String(x.typical)),
      h('td', { class: 'c-pct num' }, fmtPct(x.share), h('span', { class: 'muted' }, st ? ` · ${fmtInt(S.opts.side ? st[0] : st[1])}` : '')),
      h('td', { class: 'c-seen' }, fmtDate(c.z)),
      h('td', { class: 'c-entry' }, entry && c.e ? `${c.e.toUpperCase()} ${entry[1].slice(0, 4)}` : '—'));
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
  if (!loaded) return;

  const inc = S.groups.filter((g) => S.roles[g.id] === 'coll').length;
  $('#grpSummary').textContent = `Binder inclusi: ${inc} di ${S.groups.length} · modifica`;
  $('#groupRows').replaceChildren(...S.groups.map((g) => {
    const role = S.roles[g.id];
    const cards = g.rows.reduce((a, r) => a + r.q, 0);
    const typ = g.kind === 'text' ? 'testo' : g.type || '';
    return h('tr', null,
      h('td', { class: 'g-name' }, h('span', { class: 'gname' }, g.name), typ ? h('span', { class: 'gtype' }, typ) : null),
      h('td', { class: 'g-count count num' }, `${fmtInt(g.rows.length)} voci, ${fmtInt(cards)} carte`),
      h('td', { class: 'g-role' }, h('div', { class: 'seg', role: 'radiogroup', 'aria-label': `Ruolo di ${g.name}` },
        seg(g.id, 'coll', 'Inclusa', role), seg(g.id, 'skip', 'Esclusa', role))),
      h('td', { class: 'g-act' }, h('button', { class: 'btn quiet small', type: 'button', dataset: { remove: g.id } }, 'Rimuovi')));
  }));
  ($('#optProxy') as HTMLInputElement).checked = S.opts.proxies;
  $('#optProxyWrap').hidden = !S.groups.some((g) => g.hasProxy && S.roles[g.id] === 'coll');
  $('#memo').textContent = memoText();

  const unrec = S.summaries.reduce((a, x) => a + x.s.unrecognized.length, 0);
  const rows = S.summaries.reduce((a, x) => a + x.s.rows, 0);
  $('#impSummary').textContent = S.summaries.length
    ? `Importazione: ${plural(rows, 'riga', 'righe')}, ${fmtInt(unrec)} non riconosciute`
    : 'Importazione';
  $('#importSummary').replaceChildren(...(S.summaries.length ? S.summaries.map(({ source, kind, s }) => {
    const bits = [plural(s.rows, 'riga letta', 'righe lette'), `${fmtInt(s.inList)} di carte giocate in Pauper`];
    if (s.notInList) bits.push(`${fmtInt(s.notInList)} di carte mai giocate`);
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
  }) : [h('p', { class: 'note' }, 'Il riepilogo compare dopo un nuovo caricamento.')]));
}

async function renderNews(): Promise<void> {
  const root = $('#news');
  const empty = h('p', { class: 'note' }, 'Nessuna revisione ancora. Quando esce un set che porta carte nel Pauper, dopo 60 giorni qui compare il resoconto: carte nuove nella lista, carte uscite, ban e unban.');
  type Rev = {
    set: string; nome: string; uscita: string; data: string; sommario: string;
    nuove: [string, number, number][]; entrate: [string, number, number][]; uscite: [string, number][];
    legalita: [string, string, string][];
  };
  const LEG: Record<string, string> = { l: 'legale', b: 'bannata', n: 'non legale' };
  const list_ = (title: string, items: string[]) => items.length
    ? h('div', null, h('b', null, title), h('ul', null, ...items.map((t) => h('li', null, t))))
    : null;
  try {
    const r = await fetch('data/reviews/index.json');
    const list = r.ok ? ((await r.json()) as Rev[]) : [];
    if (!Array.isArray(list) || !list.length) return void root.replaceChildren(empty);
    root.replaceChildren(...list.slice(0, 6).map((x) => h('details', { class: 'review' },
      h('summary', null, `${x.nome} (${String(x.set).toUpperCase()}) · revisione del ${fmtDate(x.data)}`),
      h('p', { class: 'note' }, x.sommario),
      list_('Carte del set nella lista', (x.nuove || []).map(([n, d, p]) => `${n}: ${fmtInt(d)} mazzi (${p}%)`)),
      list_('Entrate nella lista', (x.entrate || []).map(([n, d, p]) => `${n}: ${fmtInt(d)} mazzi (${p}%)`)),
      list_('Uscite dalla lista', (x.uscite || []).map(([n]) => n)),
      list_('Cambi di legalità', (x.legalita || []).map(([n, a, b]) => `${n}: ${LEG[a] || a} → ${LEG[b] || b}`)))));
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

const LABEL: Record<string, string> = { owned: 'carte possedute', missing: 'carte mancanti', csv: 'List riallineata' };

async function doCopy(kind: string): Promise<void> {
  const text = payload(kind);
  if (!text.trim()) return toast(`Non ci sono ${LABEL[kind]} da copiare.`);
  try {
    await navigator.clipboard.writeText(text);
    return toast(`Copiato: ${LABEL[kind]}.`);
  } catch {
    ($('#copyText') as HTMLTextAreaElement).value = text;
    $('#copyPanel').hidden = false;
    ($('#copyText') as HTMLTextAreaElement).select();
  }
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
  const optBool = (sel: string, key: 'legalOnly' | 'side' | 'qty' | 'proxies') =>
    $(sel).addEventListener('change', (e) => {
      S.opts[key] = (e.target as HTMLInputElement).checked;
      refresh();
    });
  optBool('#optLegal', 'legalOnly');
  optBool('#optSide', 'side');
  optBool('#optQty', 'qty');
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
    S.shown += PAGE;
    renderRows();
  });
  $('#optMissing').addEventListener('change', (e) => {
    S.showMissing = (e.target as HTMLInputElement).checked;
    S.shown = PAGE;
    renderRows();
    persist();
  });

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

  // cancella i miei dati (conferma in due tempi)
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
    Object.assign(S, { groups: [], roles: {}, opts: { ...DEFAULT_OPTS }, showMissing: false, savedAt: null, summaries: [], query: '', replacing: false });
    ($('#search') as HTMLInputElement).value = '';
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
  applyTheme(lsGet('theme'));
  wire();
  route();
  try {
    S.d = await loadData();
  } catch {
    const el = $('#dataline');
    el.classList.add('error');
    el.textContent = 'Non riesco a caricare la lista delle carte. Ricarica la pagina tra qualche minuto.';
    return;
  }
  renderDataline();
  await restore();
  refresh(false);
  if (location.hash === '#informazioni') renderAbout($('#viewAbout'), S.d);
  void renderNews();
}

void main();
