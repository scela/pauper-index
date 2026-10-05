// Dati sintetici minimi nel formato di data/*.json.
import { buildData, type Data } from '../src/lib/data';
import type { CardRow, CardsFile, MetaFile, PrintRow, PrintingsFile } from '../src/lib/types';

export const ID = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

export function makeData(): Data {
  const c: CardRow[] = [
    { o: 'o-brainstorm', n: 'Brainstorm', l: 'l', e: 'ice', s: [[50, 50, 200, 4, 4], [400, 390, 1500, 4, 4], [800, 790, 3000, 4, 4], [5000, 4900, 19000, 4, 4]], f: '2014-05-07', z: '2026-10-04', lm: [0, 1, 4, 0], r: 0 },
    { o: 'o-delver', n: 'Delver of Secrets // Insectile Aberration', l: 'l', e: 'isd', s: [[10, 10, 40, 4, 4], [100, 100, 400, 4, 4], [300, 300, 1200, 4, 4], [3000, 3000, 12000, 4, 4]], f: '2014-05-07', z: '2026-09-20', lp: [1, '5-0', 4, 0], r: 0 },
    { o: 'o-gush', n: 'Gush', l: 'b', e: 'mmq', s: [0, 0, 0, [7000, 7000, 20000, 4, 4]], f: '2014-05-06', z: '2019-05-22', r: 0 },
    { o: 'o-island', n: 'Island', l: 'l', b: 1, e: 'lea', s: [[90, 90, 900, 10, 10], [800, 800, 8000, 10, 10], [1500, 1500, 15000, 10, 10], [9000, 9000, 90000, 10, 10]], f: '2014-05-06', z: '2026-10-04', r: 0 },
    { o: 'o-pyro', n: 'Pyroblast', l: 'l', e: 'ice', s: [[0, 0, 0, 0, 0], [30, 2, 60, 2, 1], [60, 4, 120, 2, 1], [600, 40, 1200, 2, 1]], f: '2015-01-01', z: '2026-08-01', r: 1 },
  ];
  // Pyroblast: s[0] = 0 (non giocata negli ultimi 61 giorni)
  c[4].s[0] = 0;
  const cards: CardsFile = {
    v: 1, anchor: '2026-10-04', w: [61, 365, 730, 0], tot: [[1000, 40], [5000, 200], [10000, 400], [100000, 4000]],
    sets: { ice: ['Ice Age', '1995-06-03', 'expansion'] },
    t: [['2026-10-04', 'Pauper Challenge 32', 'https://www.mtgo.com/decklist/x', 'm'], ['2026-09-20', 'Torneo locale', 'https://melee.gg/Tournament/View/1', 'p']],
    c,
  };
  const p: PrintRow[][] = [
    [[ID(1), 'ice', '61', 0, 0, 0], [ID(2), 'mmq', '58', 1, 1, 0]],
    [[ID(3), 'isd', '51', 2, 0, 1]],
    [[ID(4), 'mmq', '69', 3, 0, 0]],
    [[ID(5), 'lea', '288', 4, 0, 0]],
    [[ID(6), 'ice', '212', 5, 0, 0], [ID(7), 'a25', '149', 6, 1, 0]],
  ];
  const prints: PrintingsFile = { v: 1, sets: { ice: ['Ice Age', '1995-06-03'], mmq: ['Mercadian Masques', '1999-10-04'] }, artists: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], p };
  const names: Record<string, number> = {
    brainstorm: 0, 'delver of secrets // insectile aberration': 1, 'delver of secrets': 1, 'insectile aberration': 1,
    gush: 2, island: 3, pyroblast: 4,
  };
  const meta = { last_tournament: '2026-10-04', generated_at: '2026-10-05T10:00:00+00:00', tournaments: 4000, decks: 100000, windows: [], cards: 5, scryfall: {}, source: { status: 'ok', days_since_last_tournament: 1 } } as MetaFile;
  return buildData(cards, prints, names, meta);
}
