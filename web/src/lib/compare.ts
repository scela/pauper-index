// Abbinamento della collezione alla lista integrata e calcolo dei risultati.

import { isFoil } from './csv';
import { cardByName, type Data } from './data';
import { norm, splitFaces } from './norm';
import type { CardRow, Group, Role, Row } from './types';

export const WINDOW_LABELS = ['Meta attuale', 'Ultimo anno', 'Ultimi 2 anni', 'Storico'];
export const BASICS_NOTE = 'Plains, Island, Swamp, Mountain, Forest, Wastes e le versioni Snow.';

export interface Opts {
  win: number; // indice in cards.w
  minDecks: number;
  legalOnly: boolean;
  noBasics: boolean;
  side: boolean; // conta anche i mazzi che la giocano solo in side
  qty: boolean; // "Conta le copie"
  proxies: boolean;
}

export const DEFAULT_OPTS: Opts = { win: 1, minDecks: 1, legalOnly: true, noBasics: true, side: true, qty: false, proxies: false };

export type Via = 'id' | 'setcn' | 'name' | 'none';

export interface Match {
  card: number; // -1 se non è nella lista
  print: number; // indice in printings.p[card], -1 se non noto
  via: Via;
}

export function matchRow(d: Data, r: Row): Match {
  if (r.i) {
    const hit = d.byId.get(r.i);
    if (hit) return { card: hit[0], print: hit[1], via: 'id' };
  }
  if (r.s && r.c) {
    const hit = d.bySetCn.get(`${r.s}|${r.c}`.toLowerCase());
    if (hit && (cardByName(d, r.n) === hit[0] || cardByName(d, r.n) === -1)) {
      return { card: hit[0], print: hit[1], via: 'setcn' };
    }
  }
  const card = cardByName(d, r.n);
  if (card < 0) return { card: -1, print: -1, via: 'none' };
  let print = -1;
  if (r.s) {
    const set = r.s.toLowerCase();
    print = d.prints.p[card].findIndex((p) => p[1] === set && (!r.c || p[2].toLowerCase() === r.c.toLowerCase()));
  }
  return { card, print, via: 'name' };
}

export interface ImportSummary {
  rows: number;
  inList: number; // righe di carte della lista
  notInList: number; // righe di carte esistenti ma mai giocate (Scryfall ID o nome noto)
  unrecognized: Row[]; // righe senza Scryfall ID il cui nome non corrisponde a nessuna carta
  approxPrint: number; // righe abbinate per nome senza printing esatta
}

/** `allNames`: nomi normalizzati di tutte le carte (data/allnames.json); senza, i non trovati restano "non riconosciuti". */
export function summarize(d: Data, groups: Group[], allNames?: Set<string>): ImportSummary {
  const s: ImportSummary = { rows: 0, inList: 0, notInList: 0, unrecognized: [], approxPrint: 0 };
  const known = (n: string) => {
    if (!allNames) return false;
    const faces = splitFaces(n);
    return allNames.has(norm(n)) || allNames.has(norm(faces.join(' // '))) || allNames.has(norm(faces[0]));
  };
  for (const g of groups) {
    for (const r of g.rows) {
      s.rows++;
      const m = matchRow(d, r);
      if (m.card >= 0) {
        s.inList++;
        if (m.print < 0 && !r.i) s.approxPrint++;
      } else if (r.i || known(r.n)) s.notInList++;
      else s.unrecognized.push(r);
    }
  }
  return s;
}

/** Carte della lista per la definizione scelta. */
export function inList(c: CardRow, o: Opts): boolean {
  const st = c.s[o.win];
  if (!st) return false;
  const decks = o.side ? st[0] : st[1];
  if (decks < Math.max(1, o.minDecks)) return false;
  if (o.legalOnly && c.l !== 'l') return false;
  if (o.noBasics && c.b) return false;
  return true;
}

export function listIndexes(d: Data, o: Opts): number[] {
  const out: number[] = [];
  d.cards.c.forEach((c, i) => {
    if (inList(c, o)) out.push(i);
  });
  return out;
}

export function presetCounts(d: Data, o: Opts): number[] {
  return d.cards.w.map((_, win) => listIndexes(d, { ...o, win }).length);
}

/** Copie tipiche: mediana delle copie tra i mazzi che la giocano (main+side o solo main). */
export function typicalCopies(c: CardRow, o: Opts): number {
  const st = c.s[o.win];
  if (!st) return 1;
  return Math.max(1, o.side ? st[3] : st[4]);
}

export function deckShare(d: Data, c: CardRow, o: Opts): number {
  const st = c.s[o.win];
  const tot = d.cards.tot[o.win][0];
  if (!st || !tot) return 0;
  return (o.side ? st[0] : st[1]) / tot;
}

export interface OwnedPrint {
  key: string;
  row: Row;
  print: number; // -1 se la printing non è tra quelle note
  exact: boolean; // printing identificata (ID o set+numero)
  q: number;
}

export interface Result {
  idx: number;
  owned: number;
  need: number;
  typical: number;
  share: number;
  status: 'owned' | 'partial' | 'missing';
  prints: OwnedPrint[];
  binders: [string, number][];
}

export function printKey(r: Row): string {
  return [r.i || '', (r.s || '').toLowerCase(), (r.c || '').toLowerCase(), isFoil(r.f) ? r.f.toLowerCase() : '',
    (r.l || '').toLowerCase(), r.p].join('|');
}

export function compute(d: Data, groups: Group[], roles: Record<string, Role>, o: Opts): Result[] {
  const coll = new Map<number, { total: number; prints: Map<string, OwnedPrint>; binders: Map<string, number> }>();
  for (const g of groups) {
    if (roles[g.id] !== 'coll') continue;
    for (const r of g.rows) {
      if (r.p && !o.proxies) continue;
      const m = matchRow(d, r);
      if (m.card < 0) continue;
      let e = coll.get(m.card);
      if (!e) {
        e = { total: 0, prints: new Map(), binders: new Map() };
        coll.set(m.card, e);
      }
      e.total += r.q;
      const k = printKey(r);
      const pe = e.prints.get(k);
      if (pe) pe.q += r.q;
      else e.prints.set(k, { key: k, row: r, print: m.print, exact: m.via !== 'name' || m.print >= 0 || !!r.i, q: r.q });
      e.binders.set(g.name, (e.binders.get(g.name) || 0) + r.q);
    }
  }
  return listIndexes(d, o).map((idx) => {
    const c = d.cards.c[idx];
    const e = coll.get(idx);
    const owned = e ? e.total : 0;
    const typical = typicalCopies(c, o);
    const need = o.qty ? typical : 1;
    const status = owned >= need ? 'owned' : owned > 0 ? 'partial' : 'missing';
    return {
      idx, owned, need, typical, share: deckShare(d, c, o), status,
      prints: e ? [...e.prints.values()].sort((a, b) => b.q - a.q) : [],
      binders: e ? [...e.binders.entries()] : [],
    };
  });
}

export function defaultRole(g: Group): Role {
  const t = g.type || '';
  if (t.includes('deck') || t.includes('list')) return 'skip';
  return 'coll';
}
