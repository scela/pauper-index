// "Rispolvera una carta": carte un tempo giocate e poi dimenticate (logica pura, testata).

import type { Data } from './data';
import { daysBetween } from './format';
import type { CardRow } from './types';

/** Almeno tanti mazzi (main+side) nello storico. */
export const DUST_MIN_DECKS = 20;
/** Nessuna apparizione negli ultimi N giorni, contati dalla data dei dati (come le finestre). */
export const DUST_QUIET_DAYS = 365;

export interface DustRules {
  minDecks: number;
  quietDays: number;
}

export const DUST_RULES: DustRules = { minDecks: DUST_MIN_DECKS, quietDays: DUST_QUIET_DAYS };

/** Indice della finestra "storico" (w = 0). */
export function historyWindow(d: Data): number {
  const i = d.cards.w.indexOf(0);
  return i >= 0 ? i : d.cards.w.length - 1;
}

/** Carte ammesse: legali oggi, non terre base, con abbastanza mazzi nello storico e ferme da abbastanza tempo. */
export function dustPool(d: Data, rules: DustRules = DUST_RULES): number[] {
  const hw = historyWindow(d);
  const anchor = d.cards.anchor;
  const out: number[] = [];
  d.cards.c.forEach((c, i) => {
    const st = c.s[hw];
    if (c.l !== 'l' || c.b || !st || st[0] < rules.minDecks) return;
    if (daysBetween(c.z, anchor) < rules.quietDays) return;
    out.push(i);
  });
  return out;
}

/** Anno di massima diffusione: quota più alta di mazzi sul totale dell'anno (i volumi cambiano molto tra gli anni). */
export function peakYear(c: CardRow, yt: number[] | undefined): { year: number; decks: number; share: number } | null {
  if (!c.y || c.y.length < 2 || !yt || yt.length < 2) return null;
  let best: { year: number; decks: number; share: number } | null = null;
  for (let k = 1; k < c.y.length; k++) {
    const year = c.y[0] + k - 1;
    const tot = yt[year - yt[0] + 1];
    const decks = c.y[k];
    if (!decks || !tot) continue;
    const share = decks / tot;
    if (!best || share > best.share) best = { year, decks, share };
  }
  return best;
}

/**
 * Prossima carta senza segnarla come vista (per scegliere in anticipo la carta successiva e precaricarne
 * l'immagine). `restarted`: tutte le carte sono già state viste, si ricomincia.
 */
export function pickCard(d: Data, pool: number[], seen: Set<string>, rnd: () => number = Math.random):
  { idx: number; restarted: boolean } | null {
  if (!pool.length) return null;
  let avail = pool.filter((i) => !seen.has(d.cards.c[i].o));
  const restarted = !avail.length;
  if (restarted) avail = pool;
  return { idx: avail[Math.min(avail.length - 1, Math.floor(rnd() * avail.length))], restarted };
}

/** Segna come vista la carta scelta (se si ricomincia, prima azzera le carte del gruppo). */
export function commitCard(d: Data, pool: number[], seen: Set<string>, pick: { idx: number; restarted: boolean }): void {
  if (pick.restarted) pool.forEach((i) => seen.delete(d.cards.c[i].o));
  seen.add(d.cards.c[pick.idx].o);
}

/**
 * Pesca una carta del gruppo non ancora vista. Se le ha già viste tutte ricomincia (restarted = true).
 * `seen` contiene oracle_id (stabili tra un aggiornamento dei dati e l'altro).
 */
export function drawCard(d: Data, pool: number[], seen: Set<string>, rnd: () => number = Math.random):
  { idx: number; restarted: boolean } | null {
  const pick = pickCard(d, pool, seen, rnd);
  if (pick) commitCard(d, pool, seen, pick);
  return pick;
}
