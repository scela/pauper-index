// Preferite: logica pura (chiavi, aggiunta e rimozione, riconciliazione con i dati, import ed export in testo).
// Ogni preferita ha il nome inglese e, quando la carta è in cards.json, il suo oracle_id: all'avvio si cerca prima per
// oracle_id (così una carta rinominata da Scryfall si ritrova e il nome salvato si aggiorna), poi per nome. Le carte mai
// giocate in Pauper (solo in cardnames.json) restano per nome; se il nome sparisce dai dati la preferita è "non trovata".

import { loose } from './italian';
import { norm, splitFaces } from './norm';
import { parseTextList } from './text';
import type { CardRow } from './types';

export interface Fav {
  /** nome inglese (quello di cards.json o di cardnames.json, "A // B" per le carte con più facce) */
  n: string;
  /** oracle_id, solo per le carte di cards.json */
  o?: string;
  /** quando è stata aggiunta (ms) */
  at: number;
}

export interface FavFile {
  v: 1;
  list: Fav[];
}

export type FavRef = Pick<Fav, 'n' | 'o'>;

/** Chiave di una preferita: l'oracle_id se c'è, altrimenti il nome normalizzato. */
export const favKey = (f: FavRef): string => (f.o ? `o:${f.o}` : `n:${norm(f.n)}`);

export const isFavFile = (x: unknown): x is FavFile =>
  !!x && (x as FavFile).v === 1 && Array.isArray((x as FavFile).list)
  && (x as FavFile).list.every((f) => f && typeof f.n === 'string' && typeof f.at === 'number');

/** Aggiunge (in cima) se manca, altrimenti toglie. */
export function toggleFav(list: Fav[], f: FavRef, now: number): { list: Fav[]; added: boolean } {
  const k = favKey(f);
  if (list.some((x) => favKey(x) === k)) return { list: list.filter((x) => favKey(x) !== k), added: false };
  return { list: [{ n: f.n, ...(f.o ? { o: f.o } : {}), at: now }, ...list], added: true };
}

export const removeFav = (list: Fav[], key: string): Fav[] => list.filter((x) => favKey(x) !== key);

/** Unisce le preferite importate a quelle che ci sono (mai sostituisce): le già presenti restano come sono. */
export function mergeFavs(list: Fav[], incoming: Fav[]): { list: Fav[]; added: number; already: number } {
  const have = new Set(list.map(favKey));
  const add: Fav[] = [];
  let already = 0;
  for (const f of incoming) {
    const k = favKey(f);
    if (have.has(k)) {
      already++;
      continue;
    }
    have.add(k);
    add.push(f);
  }
  return { list: [...add, ...list], added: add.length, already };
}

/** Dove cercare i nomi: carte giocate (cards.json), tutti i nomi (cardnames.json) e, se scaricati, i nomi italiani. */
export interface NameSource {
  cards: CardRow[];
  /** indice in cards.json dal nome (cardByName: nome intero, faccia frontale, "A/B") */
  cardIdx: (name: string) => number;
  /** nome normalizzato (intero o di una faccia) -> nome inglese di tutte le carte giocabili; null finché non arriva */
  all: Map<string, string> | null;
  /** nome italiano (senza maiuscole, accenti e apostrofi) -> nome inglese; null se non scaricati */
  italian?: Map<string, string> | null;
}

/** Indice di cardnames.json: nome intero e, se non ambiguo, ogni faccia. */
export function allNamesIndex(names: [string, string][]): Map<string, string> {
  const m = new Map<string, string>();
  for (const [n] of names) m.set(norm(n), n);
  for (const [n] of names) {
    for (const f of splitFaces(n)) if (!m.has(norm(f))) m.set(norm(f), n);
  }
  return m;
}

/** Indice dei nomi italiani: `played[i]` della carta i di cards.json, `other` per indice di cardnames.json. */
export function italianIndex(cards: CardRow[], played: string[][], other: Map<number, string[]> | null, names: [string, string][] | null): Map<string, string> {
  const m = new Map<string, string>();
  const add = (it: string, en: string) => {
    const k = loose(it);
    if (k && !m.has(k)) m.set(k, en);
    for (const f of splitFaces(it)) if (loose(f) && !m.has(loose(f))) m.set(loose(f), en);
  };
  played.forEach((list, i) => list.forEach((it) => cards[i] && add(it, cards[i].n)));
  if (other && names) for (const [i, list] of other) if (names[i]) list.forEach((it) => add(it, names[i][0]));
  return m;
}

function inAll(all: Map<string, string>, raw: string): string | null {
  const faces = splitFaces(raw);
  return all.get(norm(raw)) ?? (faces.length > 1 ? all.get(norm(faces.join(' // '))) ?? all.get(norm(faces[0])) : undefined)
    ?? (raw.includes('/') && faces.length === 1 ? all.get(norm(raw.replace('/', ' // '))) : undefined) ?? null;
}

/** Il nome scritto (inglese o italiano, anche una faccia o "A/B") come preferita; null se non si riconosce. */
export function resolveName(src: NameSource, raw: string): FavRef | null {
  const name = raw.trim();
  if (!name) return null;
  const byEnglish = (n: string): FavRef | null => {
    const i = src.cardIdx(n);
    if (i >= 0) return { n: src.cards[i].n, o: src.cards[i].o };
    const a = src.all ? inAll(src.all, n) : null;
    return a ? { n: a } : null;
  };
  const en = byEnglish(name);
  if (en) return en;
  const it = src.italian?.get(loose(name));
  return it ? byEnglish(it) : null;
}

export type FavStatus = 'card' | 'never' | 'missing' | 'pending';

export interface FavEntry {
  fav: Fav;
  /** indice in cards.json, -1 per le carte mai giocate */
  idx: number;
  /** card: in cards.json; never: mai giocata (in cardnames.json); missing: nome sparito dai dati;
   *  pending: non in cards.json e cardnames.json non ancora scaricato */
  status: FavStatus;
}

/**
 * Riconciliazione con i dati: prima per oracle_id (il nome salvato si aggiorna se la carta è stata rinominata),
 * poi per nome (una carta mai giocata che entra in cards.json prende l'oracle_id). `changed`: c'è da salvare.
 */
export function reconcile(list: Fav[], src: NameSource): { list: Fav[]; entries: FavEntry[]; changed: boolean } {
  const byO = new Map(src.cards.map((c, i) => [c.o, i]));
  let changed = false;
  const entries: FavEntry[] = [];
  const out: Fav[] = [];
  const seen = new Set<string>();
  for (const f of list) {
    let fav = f;
    let idx = f.o !== undefined ? byO.get(f.o) ?? -1 : -1;
    if (idx < 0) idx = src.cardIdx(f.n);
    let status: FavStatus = 'card';
    if (idx >= 0) {
      const c = src.cards[idx];
      if (c.n !== f.n || c.o !== f.o) {
        fav = { n: c.n, o: c.o, at: f.at };
        changed = true;
      }
    } else {
      const a = src.all ? inAll(src.all, f.n) : null;
      status = !src.all ? 'pending' : a ? 'never' : 'missing';
      if (a && a !== f.n) {
        fav = { n: a, at: f.at };
        changed = true;
      }
    }
    // due preferite diventate la stessa carta (per esempio dopo una rinomina): se ne tiene una
    const k = favKey(fav);
    if (seen.has(k)) {
      changed = true;
      continue;
    }
    seen.add(k);
    out.push(fav);
    entries.push({ fav, idx, status });
  }
  return { list: out, entries, changed };
}

export interface ImportResult {
  favs: Fav[];
  /** righe ripetute nella lista importata */
  dups: number;
  /** righe non riconosciute (il nome come scritto) */
  unknown: string[];
}

/**
 * Lista di testo: "Nome", "1 Nome", "4x Nome (SET) 12", righe di una decklist (intestazioni come "Sideboard" ignorate);
 * nomi inglesi o italiani. Le preferite mantengono l'ordine della lista (la prima riga è la più recente).
 */
export function parseFavList(text: string, src: NameSource, now: number): ImportResult {
  const { rows } = parseTextList(text);
  const favs: Fav[] = [];
  const keys = new Set<string>();
  const unknown: string[] = [];
  let dups = 0;
  rows.forEach((r) => {
    const f = resolveName(src, r.n);
    if (!f) {
      unknown.push(r.n);
      return;
    }
    const k = favKey(f);
    if (keys.has(k)) {
      dups++;
      return;
    }
    keys.add(k);
    favs.push({ ...f, at: now - favs.length });
  });
  return { favs, dups, unknown };
}

/** Export nel formato "1 Nome" (come la lista delle mancanti): serve anche come lista acquisti. */
export function favText(list: Fav[]): string {
  return list.length ? list.map((f) => `1 ${f.n}`).join('\n') + '\n' : '';
}

export type FavSort = 'recent' | 'name' | 'share';
