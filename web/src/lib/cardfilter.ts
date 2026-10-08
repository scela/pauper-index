// Filtri per colore, costo di mana, tipo e testo delle regole (vista collezione, mancanti, vista per espansione).
// Dati da cards.json v3 (k colori, m mana value, tl riga del tipo) e da texts.json (testo delle regole).

import type { CardRow } from './types';

/** Colori del filtro: i cinque colori, M multicolore, C incolore. */
export const COLORS = ['W', 'U', 'B', 'R', 'G', 'M', 'C'] as const;
export type ColorKey = (typeof COLORS)[number];
/** Costo di mana: 0…5 esatti, 6 = 6 o più. */
export const MVS = [0, 1, 2, 3, 4, 5, 6] as const;
/** Tipi delle carte (regola 205.2a); i primi sei si mostrano sempre per primi, in quest'ordine. */
export const MAIN_TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land'];
const CARD_TYPES = new Set([...MAIN_TYPES, 'Battle', 'Conspiracy', 'Dungeon', 'Kindred', 'Phenomenon', 'Plane',
  'Planeswalker', 'Scheme', 'Tribal', 'Vanguard']);

export interface CardFilters {
  colors: ColorKey[];
  /** any: contiene almeno uno dei colori scelti; only: solo questi colori */
  colorMode: 'any' | 'only';
  mv: number[];
  types: string[];
  text: string;
}

export const emptyFilters = (): CardFilters => ({ colors: [], colorMode: 'any', mv: [], types: [], text: '' });

export function isActive(f: CardFilters): boolean {
  return f.colors.length > 0 || f.mv.length > 0 || f.types.length > 0 || textWords(f.text).length > 0;
}

/** Tipi della carta su tutte le facce ("Kindred Instant — Faerie // …" -> Kindred, Instant). */
export function cardTypes(tl: string | undefined): string[] {
  const out = new Set<string>();
  for (const face of (tl || '').split(' // ')) {
    for (const w of face.split(' — ')[0].split(/\s+/)) if (CARD_TYPES.has(w)) out.add(w);
  }
  return [...out];
}

/** Tipi presenti tra le carte (terre base escluse): prima i sei principali, poi gli altri in ordine alfabetico. */
export function availableTypes(cards: CardRow[]): string[] {
  const seen = new Set<string>();
  for (const c of cards) if (!c.b) for (const x of cardTypes(c.tl)) seen.add(x);
  return [...MAIN_TYPES.filter((x) => seen.has(x)), ...[...seen].filter((x) => !MAIN_TYPES.includes(x)).sort()];
}

/**
 * Colori. "any": la carta ha almeno un colore scelto, oppure è multicolore (M) o incolore (C) se scelti.
 * "only": una carta incolore passa solo con C; una colorata se tutti i suoi colori sono tra quelli scelti
 * (con M scelto deve anche essere multicolore; con solo M, qualsiasi multicolore).
 */
export function matchColors(k: string | undefined, f: CardFilters): boolean {
  if (!f.colors.length) return true;
  const cols = k || '';
  const want = new Set(f.colors);
  const multi = cols.length >= 2;
  if (f.colorMode === 'any') {
    if (!cols) return want.has('C');
    return (multi && want.has('M')) || [...cols].some((x) => want.has(x as ColorKey));
  }
  if (!cols) return want.has('C');
  const five: string[] = f.colors.filter((x) => x !== 'M' && x !== 'C');
  if (want.has('M') && !multi) return false;
  if (!five.length) return want.has('M');
  return [...cols].every((x) => five.includes(x));
}

export function matchMv(m: number | undefined, f: CardFilters): boolean {
  if (!f.mv.length) return true;
  return f.mv.includes(Math.min(m ?? 0, 6));
}

export function matchTypes(tl: string | undefined, f: CardFilters): boolean {
  if (!f.types.length) return true;
  const ts = cardTypes(tl);
  return f.types.some((x) => ts.includes(x));
}

/** Minuscole, senza accenti, apostrofi e trattini tipografici semplificati. */
export function normText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[‘’ʼ]/g, "'").replace(/[–—−]/g, '-');
}

/** Parole cercate: tutte devono comparire (in qualsiasi punto) nella riga del tipo o nel testo delle regole. */
export function textWords(q: string): string[] {
  return normText(q).split(/\s+/).filter(Boolean);
}

const hayCache = new WeakMap<string[], string[]>();

/** Testo in cui cercare per ogni carta: riga del tipo e testo delle regole di tutte le facce. */
export function haystacks(cards: CardRow[], texts: string[]): string[] {
  let h = hayCache.get(texts);
  if (!h) {
    h = cards.map((c, i) => normText(`${c.tl || ''}\n${texts[i] || ''}`));
    hayCache.set(texts, h);
  }
  return h;
}

/** La carta i rispetta i filtri. `hay` è null finché texts.json non è arrivato: il filtro sul testo aspetta. */
export function matchCard(c: CardRow, i: number, f: CardFilters, words: string[], hay: string[] | null): boolean {
  if (!matchColors(c.k, f) || !matchMv(c.m, f) || !matchTypes(c.tl, f)) return false;
  if (words.length && hay) return words.every((w) => hay[i].includes(w));
  return true;
}

/** Costi scelti come intervalli: [1,2,4,6] -> "1–2, 4, 6+". */
export function mvLabel(mv: number[]): string {
  const xs = [...new Set(mv)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < xs.length; i++) {
    let j = i;
    while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
    const end = xs[j] === 6 ? '6+' : String(xs[j]);
    parts.push(i === j ? end : `${xs[i]}–${end}`);
    i = j;
  }
  return parts.join(', ');
}
