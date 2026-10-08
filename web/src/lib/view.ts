// Elenco mostrato e riepilogo: la stessa catena di filtri, così i numeri del riepilogo contano esattamente
// le carte che l'elenco può mostrare (vedi CLAUDE.md, "Riepiloghi ed elenco").

import { matchCard, textWords, type CardFilters } from './cardfilter';
import type { Result } from './compare';
import type { Data } from './data';
import { daysBetween } from './format';
import { norm } from './norm';
import { printsInSets } from './sets';

export const STALE_DAYS = 182; // "viste negli ultimi 6 mesi"

export type Seen = 'all' | 'recent' | 'old';

/** Filtri che agiscono solo sull'elenco (dopo periodo, minimo mazzi, legalità, side ed espansione). */
export interface ListFilters {
  query: string;
  seen: Seen;
  onlyOwned: boolean;
  /** colore, costo, tipo e testo delle regole */
  card?: CardFilters;
  /** testo in cui cercare (riga del tipo e testo delle regole), null finché texts.json non è arrivato */
  hay?: string[] | null;
}

/** Carte stampate nel gruppo di set (a qualsiasi rarità). */
export function restrictToSet(d: Data, results: Result[], codes: Set<string> | null): Result[] {
  return codes ? results.filter((x) => printsInSets(d, x.idx, codes).length > 0) : results;
}

/** Le carte che l'elenco mostra (senza ordinamento). */
export function visible(d: Data, results: Result[], f: ListFilters): Result[] {
  const q = norm(f.query);
  const anchor = d.cards.anchor;
  const words = f.card ? textWords(f.card.text) : [];
  return results.filter((x) => {
    if (f.onlyOwned && x.owned === 0) return false;
    const c = d.cards.c[x.idx];
    if (q && !norm(c.n).includes(q)) return false;
    if (f.card && !matchCard(c, x.idx, f.card, words, f.hay ?? null)) return false;
    if (f.seen !== 'all') {
      const old = daysBetween(c.z, anchor) > STALE_DAYS;
      if (f.seen === 'old' ? !old : old) return false;
    }
    return true;
  });
}

/**
 * Nota sotto il riepilogo: quante carte mostra l'elenco, se non sono esattamente quelle contate nel titolo
 * (filtri dell'elenco attivi, oppure "mostra anche le mancanti"). null se i due insiemi coincidono.
 */
export function shownNote(headline: Result[], view: Result[]): number | null {
  if (view.length === headline.length) {
    const ids = new Set(headline.map((x) => x.idx));
    if (view.every((x) => ids.has(x.idx))) return null;
  }
  return view.length;
}
