// Controllo rapido di una carta: suggerimenti su tutti i nomi e possesso per carta o per nome.

import { matchRow, printKey, type OwnedPrint } from './compare';
import { cardByName, type Data } from './data';
import { loose, spaced, type Italian } from './italian';
import { norm, splitFaces } from './norm';
import type { Group, Role } from './types';

export interface NameEntry {
  name: string; // nome inglese (della carta)
  label: string; // testo del suggerimento: il nome inglese, oppure "Fulmine (Lightning Bolt)"
  search: string; // nome cercato: inglese o italiano
  key: string; // norm(nome inglese): possesso per nome
  match: string; // loose(search): nome senza maiuscole, accenti e apostrofi
  alt: string; // spaced(search): gli apostrofi come spazi ("dell antenata")
  words: string[]; // inizi di parola (anche delle facce) per la ricerca
  legal: 'l' | 'b' | 'n';
  card: number; // indice in cards.json, -1 se mai giocata
  /** nomi italiani della carta (se scaricati), dal più recente */
  its: string[];
  /** il suggerimento è per un nome italiano */
  it: boolean;
}

function entry(name: string, legal: 'l' | 'b' | 'n', card: number, its: string[], itName?: string): NameEntry {
  const search = itName ?? name;
  return {
    name, label: itName ? `${itName} (${name})` : name, search, key: norm(name), match: loose(search), alt: spaced(search),
    words: norm(search).split(/[\s/,:'-]+/).filter(Boolean), legal, card, its, it: !!itName,
  };
}

/** Voci per un nome inglese e per ciascuno dei suoi nomi italiani. */
function entries(name: string, legal: 'l' | 'b' | 'n', card: number, its: string[]): NameEntry[] {
  return [entry(name, legal, card, its), ...its.map((x) => entry(name, legal, card, its, x))];
}

/**
 * Carte giocate (sempre) più, se disponibile, l'elenco di tutti i nomi (data/cardnames.json) e, se scaricati,
 * i nomi italiani (data/itnames*.json): una voce per ogni nome italiano distinto.
 */
export function buildNameIndex(d: Data, all?: [string, string][], it?: Italian | null): NameEntry[] {
  const out: NameEntry[] = d.cards.c.flatMap((c, i) => entries(c.n, c.l, i, it?.played[i] || []));
  const seen = new Set(d.cards.c.map((c) => norm(c.n)));
  (all || []).forEach(([name, legal], i) => {
    const k = norm(name);
    if (seen.has(k)) return;
    seen.add(k);
    const card = cardByName(d, name);
    out.push(...entries(name, (legal as 'l' | 'b' | 'n') || 'n', card,
      card >= 0 ? it?.played[card] || [] : it?.other?.get(i) || []));
  });
  return out;
}

/**
 * Suggerimenti: 0 = il nome inizia con la ricerca, 1 = una parola inizia con la ricerca,
 * 2 = ogni parola cercata è l'inizio di una parola del nome ("light bol"), 3 = la ricerca compare ovunque.
 * Maiuscole, accenti e apostrofi non contano. A parità: prima le carte giocate in Pauper, poi i nomi inglesi,
 * poi i nomi più corti.
 */
export function suggest(entries: NameEntry[], query: string, limit = 8): NameEntry[] {
  const q = loose(query);
  if (!q) return [];
  const sq = spaced(query);
  const tokens = norm(query).split(/[\s']+/).filter(Boolean);
  const scored: [number, NameEntry][] = [];
  for (const e of entries) {
    let s = -1;
    if (e.match.startsWith(q) || e.alt.startsWith(sq)) s = 0;
    else if (e.words.some((w) => w.startsWith(q))) s = 1;
    else if (tokens.length > 1 && tokens.every((tk) => e.words.some((w) => w.startsWith(tk)))) s = 2;
    else if (q.length >= 3 && (e.match.includes(q) || e.alt.includes(sq))) s = 3;
    if (s >= 0) scored.push([s, e]);
  }
  scored.sort((a, b) => a[0] - b[0] || Number(a[1].card < 0) - Number(b[1].card < 0) || Number(a[1].it) - Number(b[1].it)
    || a[1].match.length - b[1].match.length || a[1].match.localeCompare(b[1].match));
  return scored.slice(0, limit).map((x) => x[1]);
}

/** Nome esatto (inglese o italiano) tra quelli noti, anche come faccia di una carta doppia. */
export function exactEntry(entries: NameEntry[], query: string): NameEntry | null {
  const q = loose(query);
  if (!q) return null;
  const sq = spaced(query);
  return entries.find((e) => e.match === q || e.alt === sq)
    || entries.find((e) => splitFaces(e.search).some((f) => loose(f) === q || spaced(f) === sq)) || null;
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
