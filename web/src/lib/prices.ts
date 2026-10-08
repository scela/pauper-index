// Prezzi indicativi in euro (Cardmarket, dal bulk di Scryfall): data/prices.json, allineato a printings.json.
// p[carta] = [eur, eur_foil, eur, eur_foil, …] in centesimi, una coppia per printing; 0 = prezzo assente.
// Il file si genera durante la pubblicazione: se manca, ogni prezzo è assente ("—") e il sito funziona lo stesso.

import type { OwnedPrint, Result } from './compare';
import { isFoil } from './csv';
import type { Data } from './data';

export interface PricesFile {
  v: number;
  date: string;
  p: number[][];
}

/** Prezzo di una printing in centesimi (0 = assente). Nessun ripiego tra normale e foil: sono prezzi diversi. */
export function printPrice(pr: PricesFile | null, idx: number, pi: number, foil = false): number {
  if (!pr || pi < 0) return 0;
  const v = pr.p[idx]?.[pi * 2 + (foil ? 1 : 0)];
  return typeof v === 'number' && v > 0 ? v : 0;
}

/** Indice della printing posseduta: quella abbinata, altrimenti set + numero della riga; -1 se non si sa. */
export function ownedPrintIndex(d: Data, idx: number, op: OwnedPrint): number {
  if (op.print >= 0) return op.print;
  const prints = d.prints.p[idx] || [];
  if (op.row.i) {
    const k = prints.findIndex((p) => p[0] === op.row.i);
    if (k >= 0) return k;
  }
  if (op.row.s && op.row.c) {
    const set = op.row.s.toLowerCase();
    const cn = op.row.c.toLowerCase();
    return prints.findIndex((p) => p[1] === set && p[2].toLowerCase() === cn);
  }
  return -1;
}

export interface OwnedPrice {
  op: OwnedPrint;
  foil: boolean;
  cents: number; // prezzo di una copia, 0 = assente
}

/** Prezzo di ogni printing posseduta (foil se la riga è foil), dalla più cara. */
export function ownedPrices(d: Data, pr: PricesFile | null, x: Result): OwnedPrice[] {
  return x.prints
    .map((op) => {
      const foil = isFoil(op.row.f);
      return { op, foil, cents: printPrice(pr, x.idx, ownedPrintIndex(d, x.idx, op), foil) };
    })
    .sort((a, b) => b.cents - a.cents);
}

/** Carta posseduta: il prezzo della printing posseduta di valore più alto (0 = nessun prezzo). */
export function ownedPrice(d: Data, pr: PricesFile | null, x: Result): number {
  return ownedPrices(d, pr, x)[0]?.cents || 0;
}

/** Carta mancante: la printing non foil più economica (tra `only`, se indicate). 0 = nessun prezzo. */
export function cheapestPrice(pr: PricesFile | null, idx: number, only?: number[]): number {
  const row = pr?.p[idx];
  if (!row) return 0;
  let best = 0;
  const each = only || Array.from({ length: row.length / 2 }, (_, i) => i);
  for (const i of each) {
    const v = row[i * 2];
    if (v > 0 && (!best || v < best)) best = v;
  }
  return best;
}

export interface PriceTotals {
  ownedValue: number; // centesimi: tutte le copie possedute
  ownedCards: number; // carte possedute contate
  ownedUnpriced: number; // carte possedute con almeno una copia senza prezzo
  missingCost: number; // centesimi: una copia di ogni carta mancante
  missingCards: number;
  missingUnpriced: number; // carte mancanti senza prezzo
}

/**
 * Riepilogo dei prezzi su un insieme di carte (quello dell'elenco con i filtri attivi).
 * `missingPrice`: prezzo di una carta mancante (la più economica, o la stampa del set nella vista per espansione).
 */
export function priceTotals(d: Data, pr: PricesFile | null, rows: Result[], missingPrice: (x: Result) => number): PriceTotals {
  const t: PriceTotals = { ownedValue: 0, ownedCards: 0, ownedUnpriced: 0, missingCost: 0, missingCards: 0, missingUnpriced: 0 };
  for (const x of rows) {
    if (x.owned > 0) {
      t.ownedCards++;
      let gap = false;
      for (const o of ownedPrices(d, pr, x)) {
        if (o.cents) t.ownedValue += o.cents * o.op.q;
        else gap = true;
      }
      if (gap) t.ownedUnpriced++;
    } else {
      t.missingCards++;
      const c = missingPrice(x);
      if (c) t.missingCost += c;
      else t.missingUnpriced++;
    }
  }
  return t;
}
