// Formati dei file in data/ (descritti in CLAUDE.md, "Output della pipeline").

export type WindowStats = 0 | [number, number, number, number, number]; // mazzi, mazzi main, copie, mediana, mediana main
export type LastSeen = [number, number | string | null, number, number]; // torneo, risultato, main, side

export interface CardRow {
  o: string;
  n: string;
  l: 'l' | 'b' | 'n';
  b?: 1;
  e?: string;
  s: WindowStats[];
  f: string;
  z: string;
  lm?: LastSeen;
  lp?: LastSeen;
  /** mazzi per anno nello storico: [primo anno, mazzi, …] (cards.json v2) */
  y?: number[];
  r: number;
}

export interface CardsFile {
  v: number;
  anchor: string;
  w: number[];
  tot: [number, number][];
  sets: Record<string, [string, string, string]>;
  t: [string, string, string, 'm' | 'p'][];
  c: CardRow[];
  /** mazzi totali per anno: [primo anno, mazzi, …] (v2) */
  yt?: number[];
}

// [scryfall_id, set, numero, indice artista, gruppo illustrazione, retro 0|1, rarità c|u|r|m|s|b, lingua?]
export type PrintRow = [string, string, string, number, number, 0 | 1, string, string?];

export interface PrintingsFile {
  // v2: rarità in posizione 6, lingua in posizione 7
  v: number;
  sets: Record<string, [string, string]>;
  artists: string[];
  p: PrintRow[][];
}

export interface MetaFile {
  generated_at: string;
  last_tournament: string;
  tournaments: number;
  decks: number;
  windows: { days: number | null; decks: number; tournaments: number }[];
  cards: number;
  scryfall: Record<string, string>;
  source: { status: 'ok' | 'ferma'; days_since_last_tournament: number; commit_date?: string };
}

/** Riga della collezione: n nome, s set, sn nome set, c numero, f foil, q quantità, l lingua, i Scryfall ID, p proxy. */
export interface Row {
  n: string;
  s: string;
  sn: string;
  c: string;
  f: string;
  q: number;
  l: string;
  i: string;
  p: 0 | 1;
}

export interface Group {
  id: string;
  name: string;
  type: string;
  source: string;
  rows: Row[];
  hasProxy: boolean;
  kind: 'csv' | 'text';
}

export type Role = 'coll' | 'skip';
