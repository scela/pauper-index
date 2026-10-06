// Filtro per espansione: gruppi di set (parent_set_code), set nascosti di default, rarità per set.

import type { Data } from './data';
import { norm } from './norm';

/** Una voce di data/sets.json. */
export interface SetRow {
  c: string; // codice
  n: string; // nome
  d: string; // uscita
  t: string; // set_type Scryfall
  p?: string; // set padre
  g?: 1; // solo digitale
  i?: string; // icona nello sprite data/seticons.svg: assente = il codice, "" = nessuna
}

export interface SetGroup {
  code: string;
  name: string;
  date: string;
  hidden: boolean; // il set principale è di un tipo nascosto di default
  members: SetRow[]; // set principale e set collegati
  icon: string; // icona del set principale ("" se non c'è)
}

const HIDDEN_TYPES = new Set(['promo', 'memorabilia', 'token', 'alchemy']);
const HIDDEN_CODES = new Set(['sld', 'slu', 'plst', 'plist']);

/** Promo, Secret Lair, The List, set solo digitali (e memorabilia/token): nascosti di default, attivabili. */
export function isHiddenSet(s: SetRow): boolean {
  return HIDDEN_TYPES.has(s.t) || !!s.g || HIDDEN_CODES.has(s.c) || (!!s.p && HIDDEN_CODES.has(s.p))
    || /^secret lair/i.test(s.n) || /^the list/i.test(s.n);
}

/** Nome dell'icona del set nello sprite, "" se il set non ne ha (marchi esclusi dalla pipeline). */
export function iconOf(s: SetRow | undefined): string {
  if (!s) return '';
  return s.i ?? s.c;
}

/** Gruppi: il set principale è l'antenato senza padre (risalendo parent_set_code). */
export function buildGroups(sets: SetRow[]): Map<string, SetGroup> {
  const by = new Map(sets.map((s) => [s.c, s]));
  const rootOf = (s: SetRow): SetRow => {
    let cur = s;
    const seen = new Set<string>();
    while (cur.p && by.has(cur.p) && !seen.has(cur.c)) {
      seen.add(cur.c);
      cur = by.get(cur.p)!;
    }
    return cur;
  };
  const groups = new Map<string, SetGroup>();
  for (const s of sets) {
    const r = rootOf(s);
    let g = groups.get(r.c);
    if (!g) groups.set(r.c, (g = { code: r.c, name: r.n, date: r.d, hidden: isHiddenSet(r), members: [], icon: iconOf(r) }));
    g.members.push(s);
  }
  return groups;
}

/** Codici dei set del gruppo da considerare: i set nascosti solo se richiesto. */
export function memberCodes(g: SetGroup, showHidden: boolean): Set<string> {
  return new Set(g.members.filter((s) => showHidden || s.c === g.code || !isHiddenSet(s)).map((s) => s.c));
}

/** Gruppi selezionabili, dal più recente; con la ricerca filtra per nome o codice (anche dei set collegati). */
export function searchGroups(groups: Map<string, SetGroup>, query: string, showHidden: boolean, limit = 60): SetGroup[] {
  const q = norm(query);
  const out: SetGroup[] = [];
  for (const g of groups.values()) {
    if (g.hidden && !showHidden) continue;
    if (q && !g.members.some((s) => (showHidden || s.c === g.code || !isHiddenSet(s))
      && (norm(s.n).includes(q) || s.c.toLowerCase() === q))) continue;
    out.push(g);
  }
  out.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  return out.slice(0, limit);
}

/** Indici delle printing della carta nei set indicati. */
export function printsInSets(d: Data, idx: number, codes: Set<string>): number[] {
  const out: number[] = [];
  (d.prints.p[idx] || []).forEach((p, i) => {
    if (codes.has(p[1])) out.push(i);
  });
  return out;
}

export interface RarityHere {
  rarity: string; // c u r m s b: la più bassa tra le printing della carta in questo gruppo
  common: boolean;
  entrySet?: string; // codice del set d'ingresso nel Pauper (dove è comune)
}

const ORDER = 'curmsb';

/** Rarità della carta "qui": se in almeno una printing del gruppo è comune, è comune qui. */
export function rarityHere(d: Data, idx: number, codes: Set<string>): RarityHere | null {
  const prints = printsInSets(d, idx, codes).map((i) => d.prints.p[idx][i]);
  if (!prints.length) return null;
  const rarity = prints.map((p) => p[6] || 's').sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0];
  return { rarity, common: rarity === 'c', entrySet: d.cards.c[idx].e };
}

/** Printing da mostrare per la carta nel gruppo: prima il set principale, poi la comune, poi la prima. */
export function displayPrint(d: Data, idx: number, codes: Set<string>, main: string): number {
  const ids = printsInSets(d, idx, codes);
  const p = d.prints.p[idx];
  return ids.find((i) => p[i][1] === main && p[i][6] === 'c') ?? ids.find((i) => p[i][1] === main)
    ?? ids.find((i) => p[i][6] === 'c') ?? ids[0] ?? -1;
}
