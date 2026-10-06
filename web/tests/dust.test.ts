import { describe, expect, it } from 'vitest';

import { DUST_MIN_DECKS, DUST_QUIET_DAYS, drawCard, dustPool, peakYear } from '../src/lib/dust';
import type { CardRow } from '../src/lib/types';
import { makeData } from './helpers';

function withForgotten() {
  const d = makeData();
  const base = d.cards.c[0];
  const add = (o: string, n: string, extra: Partial<CardRow>) =>
    d.cards.c.push({ ...base, o, n, lm: undefined, ...extra });
  // ferma da oltre un anno, tanti mazzi, legale: ammessa
  add('o-old', 'Old Card', { s: [0, 0, 0, [120, 100, 400, 4, 4]], f: '2015-01-01', z: '2024-01-10' });
  // ferma da esattamente 365 giorni (nessuna apparizione negli ultimi 12 mesi): ammessa
  add('o-edge', 'Edge Card', { s: [0, 0, 0, [20, 20, 80, 4, 4]], f: '2016-01-01', z: '2025-10-04' });
  // ferma da 364 giorni: no
  add('o-recent', 'Recent Card', { s: [0, [5, 5, 20, 4, 4], [5, 5, 20, 4, 4], [50, 50, 200, 4, 4]], f: '2016-01-01', z: '2025-10-05' });
  // troppo pochi mazzi: no
  add('o-few', 'Few Card', { s: [0, 0, 0, [19, 19, 60, 4, 4]], f: '2016-01-01', z: '2020-01-01' });
  // terra base o non legale: no
  add('o-snow', 'Snow-Covered Swamp', { b: 1, s: [0, 0, 0, [500, 500, 4000, 10, 10]], z: '2020-01-01' });
  return d;
}

describe('rispolvera una carta', () => {
  it('soglie di default: 20 mazzi nello storico, nessuna apparizione negli ultimi 365 giorni', () => {
    expect([DUST_MIN_DECKS, DUST_QUIET_DAYS]).toEqual([20, 365]);
  });

  it('ammette solo carte legali, non basi, con abbastanza mazzi e ferme da un anno', () => {
    const d = withForgotten();
    const names = (pool: number[]) => pool.map((i) => d.cards.c[i].n);
    // Gush è bannata, Brainstorm/Delver/Pyroblast giocate di recente, Island è una base
    expect(names(dustPool(d))).toEqual(['Old Card', 'Edge Card']);
    expect(names(dustPool(d, { minDecks: 10, quietDays: 365 }))).toEqual(['Old Card', 'Edge Card', 'Few Card']);
    expect(names(dustPool(d, { minDecks: 20, quietDays: 900 }))).toEqual(['Old Card']);
  });

  it('anno di massima diffusione in percentuale dei mazzi dell\'anno, non in numero assoluto', () => {
    const c = { y: [2018, 50, 0, 60] } as CardRow;
    // 2018: 50/500 = 10%; 2020: 60/1200 = 5%
    expect(peakYear(c, [2017, 100, 500, 800, 1200])).toEqual({ year: 2018, decks: 50, share: 0.1 });
    expect(peakYear({ y: undefined } as unknown as CardRow, [2017, 1])).toBeNull();
  });

  it('nessuna ripetizione finché ci sono carte; poi si ricomincia', () => {
    const d = withForgotten();
    const pool = dustPool(d);
    const seen = new Set<string>();
    const a = drawCard(d, pool, seen, () => 0)!;
    const b = drawCard(d, pool, seen, () => 0)!;
    expect(new Set([a.idx, b.idx]).size).toBe(2);
    expect(a.restarted || b.restarted).toBe(false);
    const c = drawCard(d, pool, seen, () => 0)!;
    expect(c.restarted).toBe(true);
    expect(drawCard(d, [], seen)).toBeNull();
  });
});
