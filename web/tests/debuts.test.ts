import { describe, expect, it } from 'vitest';

import {
  inPeriod, isThisWeek, joinList, kindCounts, summary, typicalCopies, validDebuts, visibleDebuts, watchList, weekShares,
  type DebutRow, type DebutsFile,
} from '../src/lib/debuts';
import type { CardsFile } from '../src/lib/types';

const names = ["Giant's Boulder", 'Prophetic Prism', 'Candy Trail', 'Baleful Strix', 'Suffocating Fumes', 'Tidewater Minion',
  'Vandalblast', 'Great Forest Druid', 'Old Card'];
const cards = {
  v: 3, anchor: '2026-10-11', w: [61, 365, 730, 0], tot: [], t: [],
  sets: { hob: ['The Hobbit', '2026-08-14', 'expansion'], slz: ['The Zeta Set', '2026-09-02', 'box'], rav: ['Ravnica: City of Guilds', '2005-10-07', 'expansion'] },
  c: names.map((n, i) => ({ o: `o${i}`, n, l: 'l', e: ['hob', 'hob', 'hob', 'slz', 'hob', 'rav', 'slz', 'hob', 'rav'][i] })),
} as unknown as CardsFile;

const row = (over: Partial<DebutRow>): DebutRow => ({
  c: 0, k: 'n', f: '2026-08-11', d: 763, p: 442, a: [['c10', 504, 530]], z: [763, 0, 0], q: [14, 84, 107, 558], y: 2026,
  r: [], w0: '2026-08-10', w: [36, 49], wt: [508, 553], co: [], b: [], ...over,
});

const file = (c: DebutRow[], o: DebutsFile['o'] = []): DebutsFile => ({
  v: 1, anchor: '2026-10-11', max: 120, minDecks: 5, minPlayers: 3, lastWeekPartial: 0,
  fam: { c10: 'Tron', c3: 'Affinity', c19: 'Dimir Control', a9: 'Boots of Speed + Tidewater Minion' },
  arch: { c10: 'Tron', c7UB: 'Dimir Faeries', a9: 'Boots of Speed + Tidewater Minion' }, t: {}, o, c,
});

describe('debutti: frase riassuntiva da modelli fissi', () => {
  it('carta nuova con "al posto di" nella stessa famiglia (Giant\'s Boulder)', () => {
    const r = row({ r: [['c10', 504, 530, 399, 0, [[1, 750, 310, 690], [2, 840, 440, 810]]]] });
    const f = file([r]);
    expect(summary(f, r, cards, 'it')).toBe('Entrata con The Hobbit, giocata soprattutto in Tron (66%), quasi sempre in 4 copie, al posto di Prophetic Prism e Candy Trail.');
    expect(summary(f, r, cards, 'en')).toBe('Arrived with The Hobbit, played mostly in Tron (66%), nearly always as 4 copies, in place of Prophetic Prism and Candy Trail.');
  });

  it('appena legale, due famiglie, "al posto di" in un\'altra variante (Baleful Strix)', () => {
    const r = row({
      c: 3, k: 'l', d: 538, a: [['c3', 183, 410], ['c19', 140, 116]], q: [10, 48, 59, 421],
      r: [['c3', 121, 181, 15, 0, []], ['c7UB', 136, 175, 210, 0, [[4, 860, 410, 970]]]],
    });
    expect(summary(file([r]), r, cards, 'it')).toBe('Diventata legale con The Zeta Set, giocata in Affinity (34%) e Dimir Control (26%), quasi sempre in 4 copie, al posto di Suffocating Fumes in Dimir Faeries.');
  });

  it('riscoperta: "mai vista nei tornei dal 2014" con l\'anno della prima stampa; mazzo nuovo', () => {
    const r = row({ c: 5, k: 'r', d: 26, a: [['a9', 20, 20]], q: [1, 0, 2, 23], y: 2005, r: [['a9', 20, 20, 0, 1, []]] });
    expect(summary(file([r]), r, cards, 'it')).toBe('Mai vista nei tornei dal 2014, ma stampata nel 2005, giocata soprattutto in Boots of Speed + Tidewater Minion (77%), quasi sempre in 4 copie, in un mazzo nuovo, comparso dopo il suo debutto.');
    // stampata dopo il 2014 (Great Forest Druid, 2026)
    const r2 = row({ c: 7, k: 'r', y: 2026, a: [] });
    expect(summary(file([r2]), r2, cards, 'en')).toMatch(/^Never seen in tournaments before, printed in 2026,/);
  });

  it('in side, copie diverse; tolta dalle bandite; liste non classificate', () => {
    const r = row({ c: 6, k: 'l', d: 570, a: [['x', 300, 2000], ['c10', 127, 306]], z: [0, 565, 5], q: [200, 285, 68, 17] });
    expect(summary(file([r]), r, cards, 'it')).toBe('Diventata legale con The Zeta Set, giocata soprattutto in liste non classificate (53%), in side, di solito in 2 copie.');
    const u = row({ c: 8, k: 'u', u: '2026-11-03', f: '2015-01-01', z: [3, 3, 4], q: [10, 0, 0, 0], d: 10, a: [] });
    expect(summary(file([u]), u, cards, 'it')).toBe('Tolta dalle bandite il 3 nov 2026, in main e in side, sempre in 1 copia.');
  });

  it('elenchi nella lingua scelta', () => {
    expect(joinList(['A', 'B', 'C'], 'it')).toBe('A, B e C');
    expect(joinList(['A', 'B'], 'en')).toBe('A and B');
    expect(typicalCopies([2, 11, 14, 73])).toEqual({ n: 4, share: 0.73 });
  });
});

describe('debutti: periodo, categoria, osservazione', () => {
  const rows = [row({ c: 0, f: '2026-08-11' }), row({ c: 3, k: 'l', f: '2026-09-07' }), row({ c: 7, k: 'r', f: '2026-07-14' }),
    row({ c: 1, f: '2026-10-06' }), row({ c: 8, k: 'u', f: '2015-01-01', u: '2026-10-05' })];
  const f = file(rows, [[5, 'r', '2026-07-21', 9, 2], [6, 'n', '2026-08-29', 4, 4], [2, 'n', '2026-06-21', 3, 3]]);

  it('il periodo conta dalla data dell\'ultimo torneo (compresa) e, per le sbloccate, dallo sblocco', () => {
    expect(inPeriod(f, 61).map((r) => r.c)).toEqual([0, 3, 1, 8]); // 11 agosto: 61 giorni esatti
    expect(inPeriod(f, 60).map((r) => r.c)).toEqual([3, 1, 8]);
    expect(inPeriod(f, 90).map((r) => r.c)).toEqual([0, 3, 7, 1, 8]);
    expect(kindCounts(inPeriod(f, 90))).toEqual({ n: 2, l: 1, u: 1, r: 1 });
  });

  it('categoria e "Solo quelle che possiedi"', () => {
    expect(visibleDebuts(f, { days: 90, kind: 'l', ownedOnly: false }, null).map((r) => r.c)).toEqual([3]);
    const owned = (i: number) => (i === 7 ? 2 : 0);
    expect(visibleDebuts(f, { days: 90, kind: '', ownedOnly: true }, owned).map((r) => r.c)).toEqual([7]);
    expect(visibleDebuts(f, { days: 90, kind: '', ownedOnly: true }, null)).toHaveLength(5); // senza collezione non filtra
  });

  it('"In osservazione" filtrata per periodo, con il motivo', () => {
    expect(watchList(f, 90).map((o) => [o.c, o.why])).toEqual([[5, 'players'], [6, 'decks']]);
    expect(watchList(f, 120).map((o) => o.c)).toEqual([5, 6, 2]);
  });

  it('nuova questa settimana e quote settimanali', () => {
    expect(isThisWeek({ f: '2026-10-06' }, '2026-10-11')).toBe(true);
    expect(isThisWeek({ f: '2026-10-04' }, '2026-10-11')).toBe(false);
    expect(isThisWeek({ f: '2015-01-01', u: '2026-10-05' }, '2026-10-11')).toBe(true);
    expect(weekShares(row({ w: [36, 0], wt: [508, 0] }))).toEqual([36 / 508, 0]);
  });

  it('file non coerente con le carte: rifiutato', () => {
    expect(validDebuts(f, names.length)).toBe(true);
    expect(validDebuts(f, 3)).toBe(false);
    expect(validDebuts({ ...f, v: 2 }, names.length)).toBe(false);
    expect(validDebuts(file([row({ w: [1], wt: [1, 2] })]), names.length)).toBe(false);
  });
});
