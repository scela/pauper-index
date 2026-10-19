// Debutti: carte apparse per la prima volta nei tornei di recente (data/debuts.json, calcolato dalla pipeline).
// Qui solo logica pura: filtri per periodo e categoria, "In osservazione", frase riassuntiva da modelli fissi.

import { fmtDate, fmtPct, translate, type Key, type Lang } from '../i18n';
import type { CardsFile } from './types';

export type DebutKind = 'n' | 'l' | 'u' | 'r';
/** [variante, mazzi con la carta, mazzi della variante, liste prima, mazzo nuovo, [[carta, prima, con, senza o -1]]] */
export type Replace = [string, number, number, number, 0 | 1, [number, number, number, number][]];

export interface DebutRow {
  c: number;
  k: DebutKind;
  f: string;
  u?: string;
  d: number;
  p: number;
  /** [famiglia, mazzi con la carta, mazzi della famiglia dalla prima apparizione] */
  a: [string, number, number][];
  /** solo main, solo side, entrambi */
  z: [number, number, number];
  /** copie 1, 2, 3, 4+ */
  q: [number, number, number, number];
  y: number;
  r: Replace[];
  w0: string;
  w: number[];
  wt: number[];
  co: [number, number][];
  b: [number, number | string | null][];
}

export interface DebutsFile {
  v: number;
  anchor: string;
  max: number;
  minDecks: number;
  minPlayers: number;
  lastWeekPartial: 0 | 1;
  fam: Record<string, string>;
  arch: Record<string, string>;
  t: Record<string, [string, string, string, 'm' | 'p']>;
  /** in osservazione: [carta, categoria, prima apparizione, mazzi, giocatori] */
  o: [number, DebutKind, string, number, number][];
  c: DebutRow[];
}

/** Periodi offerti (giorni dalla data dell'ultimo torneo, compresa); 90 è il predefinito. */
export const PERIODS = [30, 61, 90, 120] as const;
export const DEFAULT_PERIOD = 90;
export const KINDS: DebutKind[] = ['n', 'l', 'u', 'r'];
/** Dati dei tornei dal 2014 (Tournaments-Archive): prima non si sa se una carta era giocata. */
export const DATA_SINCE = 2014;

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
export const ageDays = (iso: string, anchor: string) => day(anchor) - day(iso);

/** Il file è coerente con le carte caricate? */
export function validDebuts(j: unknown, cardCount: number): j is DebutsFile {
  const f = j as DebutsFile;
  if (!f || f.v !== 1 || !Array.isArray(f.c) || !Array.isArray(f.o) || typeof f.anchor !== 'string') return false;
  const ok = (i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < cardCount;
  return f.c.every((r) => ok(r.c) && Array.isArray(r.w) && Array.isArray(r.wt) && r.w.length === r.wt.length
    && r.co.every(([i]) => ok(i)) && r.r.every((x) => x[5].every(([i]) => ok(i))))
    && f.o.every((o) => ok(o[0]));
}

/** Data da cui conta il periodo: lo sblocco per le carte tolte dalle bandite, altrimenti la prima apparizione. */
const since = (r: { f: string; u?: string }) => r.u || r.f;

export interface DebutFilters {
  days: number;
  kind: DebutKind | '';
  ownedOnly: boolean;
}

/** Carte del periodo, nell'ordine del file (dai più mazzi). */
export function inPeriod(f: DebutsFile, days: number): DebutRow[] {
  return f.c.filter((r) => ageDays(since(r), f.anchor) <= days);
}

export function visibleDebuts(f: DebutsFile, F: DebutFilters, owned: ((idx: number) => number) | null): DebutRow[] {
  return inPeriod(f, F.days).filter((r) => (!F.kind || r.k === F.kind) && (!F.ownedOnly || !owned || owned(r.c) > 0));
}

export function kindCounts(rows: DebutRow[]): Record<DebutKind, number> {
  const n = { n: 0, l: 0, u: 0, r: 0 };
  for (const r of rows) n[r.k]++;
  return n;
}

/** "In osservazione" del periodo, con il motivo dell'esclusione. */
export function watchList(f: DebutsFile, days: number): { c: number; k: DebutKind; f: string; d: number; p: number; why: 'decks' | 'players' }[] {
  return f.o.filter((o) => ageDays(o[2], f.anchor) <= days)
    .map(([c, k, first, d, p]) => ({ c, k, f: first, d, p, why: d < f.minDecks ? 'decks' as const : 'players' as const }));
}

/** Entrata nell'ultima settimana di tornei (i 7 giorni fino all'ultimo torneo). */
export const isThisWeek = (r: { f: string; u?: string }, anchor: string) => ageDays(since(r), anchor) < 7;

/** Copie più frequenti e la loro quota. */
export function typicalCopies(q: DebutRow['q']): { n: number; share: number } {
  const tot = q.reduce((a, b) => a + b, 0) || 1;
  let n = 0;
  for (let i = 1; i < 4; i++) if (q[i] > q[n]) n = i;
  return { n: n + 1, share: q[n] / tot };
}

/** Prima variante con carte sostituite (o con un mazzo nuovo). */
export function mainReplace(r: DebutRow): Replace | null {
  return r.r.find((x) => x[5].length > 0) || r.r.find((x) => x[4] === 1) || null;
}

/** Percentuali delle settimane (mazzi con la carta sui mazzi della settimana). */
export const weekShares = (r: DebutRow) => r.w.map((n, i) => (r.wt[i] ? n / r.wt[i] : 0));

/** Nome della famiglia o della variante; "" = liste non classificate. */
export const famName = (f: DebutsFile, id: string) => (id === 'x' ? '' : f.fam[id] ?? '');

/** Unisce "A", "A e B", "A, B e C" nella lingua scelta. */
export function joinList(items: string[], lang: Lang): string {
  if (items.length < 2) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} ${translate(lang, 'deb.and')} ${items[items.length - 1]}`;
}

/** Frase riassuntiva da modelli fissi (niente IA): perché è comparsa, dove si gioca, quante copie, al posto di cosa. */
export function summary(f: DebutsFile, r: DebutRow, cards: CardsFile, lang: Lang): string {
  const tr = (k: Key, v?: Record<string, string | number>) => translate(lang, k, v);
  const c = cards.c[r.c];
  const set = c?.e ? cards.sets[c.e]?.[0] || c.e.toUpperCase() : '';
  const parts: string[] = [];
  if (r.k === 'u') parts.push(tr('deb.s.unban', { date: fmtDate(r.u || r.f, lang) }));
  else if (r.k === 'r') {
    parts.push(!r.y ? tr('deb.s.rediscoveredNoYear')
      : r.y < DATA_SINCE ? tr('deb.s.rediscovered', { since: DATA_SINCE, year: r.y }) : tr('deb.s.rediscoveredNew', { year: r.y }));
  }
  else if (set) parts.push(tr(r.k === 'n' ? 'deb.s.new' : 'deb.s.legal', { set }));
  // dove si gioca: una famiglia se ha almeno metà dei mazzi, altrimenti le prime due
  const [a1, a2] = r.a;
  const fname = (x: [string, number, number]) => famName(f, x[0]) || tr('deb.unclassified');
  if (a1) {
    const s1 = a1[1] / r.d;
    if (s1 >= 0.5 || !a2) parts.push(tr('deb.s.mostly', { arch: fname(a1), pct: fmtPct(s1, lang) }));
    else parts.push(tr('deb.s.two', { arch: fname(a1), pct: fmtPct(s1, lang), arch2: fname(a2), pct2: fmtPct(a2[1] / r.d, lang) }));
  }
  // main o side, copie
  const zone = r.z[1] / r.d >= 0.8 ? 'side' : r.z[0] / r.d >= 0.8 ? 'main' : 'both';
  const cp = typicalCopies(r.q);
  const copies = cp.share >= 0.9 ? 'deb.s.copiesAlways' : cp.share >= 0.6 ? 'deb.s.copiesMostly' : 'deb.s.copiesUsually';
  parts.push(tr(zone === 'side' ? 'deb.s.side' : zone === 'both' ? 'deb.s.both' : 'deb.s.main', { copies: tr(copies, { n: cp.n }) }));
  // al posto di
  const rep = mainReplace(r);
  if (rep && rep[5].length) {
    // la variante si nomina solo se non è la famiglia già detta ("al posto di … in Dimir Faeries" per Baleful Strix)
    const variant = f.arch[rep[0]] || '';
    const list = joinList(rep[5].slice(0, 2).map(([i]) => cards.c[i]?.n || '?'), lang);
    const said = a1 ? fname(a1) : '';
    parts.push(variant && variant !== said ? tr('deb.s.replacesIn', { cards: list, variant }) : tr('deb.s.replaces', { cards: list }));
  }
  else if (rep && rep[4]) parts.push(tr('deb.s.newDeck'));
  const text = parts.join(', ');
  return text ? text[0].toLocaleUpperCase(lang) + text.slice(1) + '.' : '';
}
