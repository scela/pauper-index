import { describe, expect, it } from 'vitest';

import {
  archetypes, completion, deckText, missingText, placementScore, readDecks, sectionOf, sortDecks, validDecks, visibleDecks,
  type DecksFile,
} from '../src/lib/decks';
import { makeData } from './helpers';

// carte sintetiche di helpers.ts: 0 Brainstorm, 1 Delver, 2 Gush, 3 Island (terra base), 4 Pyroblast
const file = (): DecksFile => ({
  v: 1, days: 61, anchor: '2026-10-04', basics: [3],
  t: {
    '2026100400': ['2026-10-04', 'Pauper Challenge 32', 'https://www.mtgo.com/decklist/a', 'm'],
    '2026092000': ['2026-09-20', 'Pauper League', 'https://www.mtgo.com/decklist/b', 'm'],
    '2026091000': ['2026-09-10', 'Torneo locale', 'https://melee.gg/Tournament/View/1', 'p'],
  },
  a: { c1: ['Mono-Blue Terror', '', 'c'], a7: ['Gush + Pyroblast', 'UR', 'a'], xU: ['', 'U', 'x'] },
  l: [
    ['c1', 'U', [0, 4, 1, 4, 3, 52], [4, 3], [[2026092000, '5-0'], [2026091000, 3]]],
    ['a7', 'UR', [2, 4, 4, 2, 3, 54], [0, 2], [[2026100400, 12]]],
    ['xU', 'U', [0, 2, 3, 58], [], [[2026091000, 9]]],
    // solo terre base: segnaposto, scartato
    ['xU', 'U', [3, 60], [], [[2026091000, 20]]],
  ],
});

describe('mazzi', () => {
  const d = makeData();
  const cards = d.cards.c;

  it('valida il file rispetto alle carte caricate', () => {
    expect(validDecks(file(), cards.length)).toBe(true);
    const bad = file();
    bad.l[0][2] = [99, 4];
    expect(validDecks(bad, cards.length)).toBe(false);
    expect(validDecks(null, cards.length)).toBe(false);
  });

  it('legge archetipi, apparizioni, ultima data e migliore piazzamento; scarta le liste di sole terre base', () => {
    const decks = readDecks(file());
    expect(decks.map((x) => x.i)).toEqual([0, 1, 2]);
    expect(decks[0]).toMatchObject({ name: 'Mono-Blue Terror', colors: 'U', kind: 'c', last: '2026-09-20' });
    // 3° posto meglio di un 5-0 di League (che vale come subito dopo la top 8)
    expect(decks[0].best.result).toBe(3);
    expect(decks[2].name).toBe('');
    expect(placementScore(1)).toBeLessThan(placementScore('5-0'));
    expect(placementScore('5-0')).toBeLessThan(placementScore(9));
    expect(placementScore('4-1')).toBeGreaterThan(placementScore(32));
  });

  it('completamento: minimo tra copie possedute e richieste, terre base escluse, side a richiesta', () => {
    const [deck] = readDecks(file());
    const owned = (idx: number) => ({ 0: 4, 1: 1, 4: 1 } as Record<number, number>)[idx] || 0;
    const basics = new Set([3]);
    const main = completion(deck, owned, false, basics);
    expect(main).toMatchObject({ need: 8, have: 5 });
    expect(main.pct).toBeCloseTo(5 / 8);
    expect(main.missing).toEqual([{ idx: 1, n: 3 }]);
    const all = completion(deck, owned, true, basics);
    expect(all).toMatchObject({ need: 11, have: 6 });
    expect(all.missing).toEqual([{ idx: 1, n: 3 }, { idx: 4, n: 2 }]);
    // stessa carta in main e side: le copie si sommano
    const [, b] = readDecks(file());
    expect(completion(b, () => 4, true, basics).missing).toEqual([]);
    expect(completion(b, (i) => (i === 0 ? 1 : 4), true, basics).missing).toEqual([{ idx: 0, n: 1 }]);
  });

  it('ordine: per completamento con la collezione, per ultima apparizione senza; filtri', () => {
    const decks = readDecks(file());
    expect(sortDecks(decks, null).map((x) => x.i)).toEqual([1, 0, 2]);
    const basics = new Set([3]);
    const owned = (idx: number) => (idx === 0 ? 4 : 0);
    const comp = new Map(decks.map((x) => [x.i, completion(x, owned, false, basics)]));
    expect(sortDecks(decks, comp).map((x) => x.i)).toEqual([2, 0, 1]);
    expect(visibleDecks(decks, { arch: 'c1', min: 0 }, comp).map((x) => x.i)).toEqual([0]);
    expect(visibleDecks(decks, { arch: '', min: 1 }, comp).map((x) => x.i)).toEqual([2]);
    // senza collezione il completamento minimo non si applica
    expect(visibleDecks(decks, { arch: '', min: 1 }, null)).toHaveLength(3);
    expect(archetypes(decks).map((a) => [a.id, a.lists, a.apps])).toEqual([['c1', 1, 2], ['a7', 1, 1], ['xU', 1, 1]]);
  });

  it('export: lista acquisti "N Nome" e decklist nel formato di MTG Arena', () => {
    const [deck] = readDecks(file());
    expect(missingText(cards, [{ idx: 1, n: 3 }, { idx: 4, n: 2 }])).toBe('3 Delver of Secrets // Insectile Aberration\n2 Pyroblast\n');
    expect(missingText(cards, [])).toBe('');
    expect(deckText(cards, deck)).toBe('4 Brainstorm\n4 Delver of Secrets // Insectile Aberration\n52 Island\n\nSideboard\n3 Pyroblast\n');
    const [, , solo] = readDecks(file());
    expect(deckText(cards, solo)).toBe('2 Brainstorm\n58 Island\n');
  });

  it('sezioni della decklist dal tipo della prima faccia', () => {
    const c = (tl: string) => ({ ...cards[0], tl });
    expect(sectionOf(c('Artifact Creature — Golem'))).toBe('creature');
    expect(sectionOf(c('Artifact Land'))).toBe('land');
    expect(sectionOf(c('Sorcery // Land'))).toBe('sorcery');
    expect(sectionOf(c('Basic Snow Land — Island'))).toBe('land');
    expect(sectionOf(c('Instant'))).toBe('instant');
    expect(sectionOf(c('Kindred Enchantment — Faerie'))).toBe('enchantment');
  });
});
