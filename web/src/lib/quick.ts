// Controllo rapido di una carta: suggerimenti su tutti i nomi e possesso per carta o per nome.

import { matchRow, printKey, type OwnedPrint } from './compare';
import { cardByName, type Data } from './data';
import { norm, splitFaces } from './norm';
import type { Group, Role } from './types';

export interface NameEntry {
  name: string;
  key: string; // norm(name)
  words: string[]; // inizi di parola (anche delle facce) per la ricerca
  legal: 'l' | 'b' | 'n';
  card: number; // indice in cards.json, -1 se mai giocata
}

function entry(name: string, legal: 'l' | 'b' | 'n', card: number): NameEntry {
  const key = norm(name);
  return { name, key, words: key.split(/[\s/,:-]+/).filter(Boolean), legal, card };
}

/** Carte giocate (sempre) più, se disponibile, l'elenco di tutti i nomi (data/cardnames.json). */
export function buildNameIndex(d: Data, all?: [string, string][]): NameEntry[] {
  const out: NameEntry[] = d.cards.c.map((c, i) => entry(c.n, c.l, i));
  const seen = new Set(out.map((e) => e.key));
  for (const [name, legal] of all || []) {
    const k = norm(name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(entry(name, (legal as 'l' | 'b' | 'n') || 'n', cardByName(d, name)));
  }
  return out;
}

/**
 * Suggerimenti: 0 = il nome inizia con la ricerca, 1 = una parola inizia con la ricerca,
 * 2 = ogni parola cercata è l'inizio di una parola del nome ("light bol"), 3 = la ricerca compare ovunque.
 * A parità: prima le carte giocate in Pauper, poi i nomi più corti.
 */
export function suggest(entries: NameEntry[], query: string, limit = 8): NameEntry[] {
  const q = norm(query);
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: [number, NameEntry][] = [];
  for (const e of entries) {
    let s = -1;
    if (e.key.startsWith(q)) s = 0;
    else if (e.words.some((w) => w.startsWith(q))) s = 1;
    else if (tokens.length > 1 && tokens.every((tk) => e.words.some((w) => w.startsWith(tk)))) s = 2;
    else if (q.length >= 3 && e.key.includes(q)) s = 3;
    if (s >= 0) scored.push([s, e]);
  }
  scored.sort((a, b) => a[0] - b[0] || Number(a[1].card < 0) - Number(b[1].card < 0)
    || a[1].key.length - b[1].key.length || a[1].key.localeCompare(b[1].key));
  return scored.slice(0, limit).map((x) => x[1]);
}

/** Nome esatto (normalizzato) tra quelli noti, anche come faccia di una carta doppia. */
export function exactEntry(entries: NameEntry[], query: string): NameEntry | null {
  const q = norm(query);
  if (!q) return null;
  return entries.find((e) => e.key === q) || entries.find((e) => splitFaces(e.name).some((f) => norm(f) === q)) || null;
}

export interface Owned {
  total: number;
  prints: OwnedPrint[];
  binders: [string, number][];
}

export interface CollectionIndex {
  byCard: Map<number, Owned>;
  byName: Map<string, Owned>;
}

/** Possesso di tutte le carte della collezione: per indice (carte giocate) e per nome (tutte). */
export function collectionIndex(d: Data, groups: Group[], roles: Record<string, Role>, proxies: boolean): CollectionIndex {
  const acc = new Map<string, { total: number; prints: Map<string, OwnedPrint>; binders: Map<string, number> }>();
  const add = (k: string, g: Group, r: Group['rows'][number], print: number, exact: boolean) => {
    let e = acc.get(k);
    if (!e) acc.set(k, (e = { total: 0, prints: new Map(), binders: new Map() }));
    e.total += r.q;
    const pk = printKey(r);
    const pe = e.prints.get(pk);
    if (pe) pe.q += r.q;
    else e.prints.set(pk, { key: pk, row: r, print, exact, q: r.q });
    e.binders.set(g.name, (e.binders.get(g.name) || 0) + r.q);
  };
  for (const g of groups) {
    if (roles[g.id] !== 'coll') continue;
    for (const r of g.rows) {
      if (r.p && !proxies) continue;
      const m = matchRow(d, r);
      if (m.card >= 0) add(`#${m.card}`, g, r, m.print, m.via !== 'name' || m.print >= 0 || !!r.i);
      else {
        add(`n:${norm(r.n)}`, g, r, -1, !!r.i);
        const front = splitFaces(r.n)[0];
        if (front && norm(front) !== norm(r.n)) add(`n:${norm(front)}`, g, r, -1, !!r.i);
      }
    }
  }
  const byCard = new Map<number, Owned>();
  const byName = new Map<string, Owned>();
  for (const [k, e] of acc) {
    const owned: Owned = { total: e.total, prints: [...e.prints.values()].sort((a, b) => b.q - a.q), binders: [...e.binders] };
    if (k.startsWith('#')) byCard.set(Number(k.slice(1)), owned);
    else byName.set(k.slice(2), owned);
  }
  return { byCard, byName };
}

export function ownedFor(ix: CollectionIndex, e: NameEntry): Owned | null {
  if (e.card >= 0) return ix.byCard.get(e.card) || null;
  return ix.byName.get(e.key) || null;
}
