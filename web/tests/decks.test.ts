import { describe, expect, it } from 'vitest';

import {
  archetypes, closestDeck, completion, emptyTierFilters, families, listPrice, missingCost, variantLabels, visibleFamilies, deckText, missingText, placementScore, readDecks, sectionOf, sortDecks, validDecks, visibleDecks,
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
    expect(missingText(cards, [{ idx: 1, n: 3 }, { idx: 4, n: 2 }])).toBe('3 Delver of Secrets\n2 Pyroblast\n');
    expect(missingText(cards, [])).toBe('');
    // nomi come in MTG Arena: Delver (transform, con dn) solo con la prima faccia; una split (senza dn) completa
    expect(deckText(cards, deck)).toBe('4 Brainstorm\n4 Delver of Secrets\n52 Island\n\nSideboard\n3 Pyroblast\n');
    const split = cards.map((c, i) => (i === 4 ? { ...c, n: 'Fire // Ice' } : c));
    expect(deckText(split, deck)).toContain('\n3 Fire // Ice\n');
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

describe('tier list', () => {
  // due famiglie: Terror (due varianti di colore) e Gush; una lista non classificata
  const tfile = (): DecksFile => ({
    v: 2, days: 61, anchor: '2026-10-04', basics: [3],
    t: { '2026100400': ['2026-10-04', 'Pauper Challenge 32', 'https://www.mtgo.com/decklist/a', 'm'] },
    a: {
      c1U: ['Mono-Blue Terror', 'U', 'c', 'f1'], c1UR: ['Izzet Terror', 'UR', 'c', 'f1'],
      a7: ['Gush + Pyroblast', 'R', 'a', 'a7'], xU: ['', 'U', 'x'],
    },
    f: { f1: ['Terror', 1, 812, 1, 0], a7: ['Gush + Pyroblast', 4, 40, 2, 2] },
    l: [
      ['c1U', 'U', [0, 4, 1, 4, 3, 52], [], [[2026100400, 1], [2026100400, 2]]],
      ['c1UR', 'UR', [0, 4, 1, 4, 4, 4, 3, 48], [], [[2026100400, 3]]],
      ['a7', 'R', [2, 4, 4, 4, 3, 52], [], [[2026100400, 4]]],
      ['xU', 'U', [0, 2, 3, 58], [], [[2026100400, 9]]],
    ],
  });

  it('raggruppa le liste per famiglia, con varianti, quota, lista tipica; le non classificate restano fuori', () => {
    const f = tfile();
    const fams = families(f, readDecks(f));
    expect(fams.map((x) => x.id)).toEqual(['f1', 'a7']);
    expect(fams[0]).toMatchObject({ name: 'Terror', tier: 1, share: 0.0812, symbol: 1, colors: 'U', lists: 2, apps: 3 });
    expect(fams[0].variants.map((v) => [v.name, v.apps])).toEqual([['Mono-Blue Terror', 2], ['Izzet Terror', 1]]);
    expect(fams[0].typical?.i).toBe(0);
  });

  it('etichette delle varianti senza le parole finali comuni', () => {
    expect(variantLabels(['Mono-Blue Terror', 'Izzet Terror'])).toEqual(['Mono-Blue', 'Izzet']);
    expect(variantLabels(['Dimir Faeries', 'Mono-Blue Faeries'])).toEqual(['Dimir', 'Mono-Blue']);
    expect(variantLabels(['Faeries', 'Dimir Faeries'])).toEqual(['Faeries', 'Dimir Faeries']);
    expect(variantLabels(['Terror'])).toEqual(['Terror']);
  });

  it('prezzo della lista (terre base escluse), costo per completare e lista più vicina', () => {
    const f = tfile();
    const decks = readDecks(f);
    const priceOf = (idx: number) => ({ 0: 100, 1: 50, 4: 0 } as Record<number, number>)[idx] || 0;
    expect(listPrice(decks[0], priceOf, new Set([3]))).toEqual({ cents: 600, unpriced: 0 });
    expect(listPrice(decks[1], priceOf, new Set([3]))).toEqual({ cents: 600, unpriced: 1 });
    const owned = (idx: number) => ({ 0: 4, 1: 2 } as Record<number, number>)[idx] || 0;
    const comp = new Map(decks.map((x) => [x.i, completion(x, owned, true, new Set([3]))]));
    expect(missingCost(comp.get(0)!, priceOf)).toBe(100);
    const fam = families(f, decks)[0];
    // Mono-Blue: 6 di 8; Izzet: 6 di 12 -> la più vicina è Mono-Blue
    expect(closestDeck(fam, comp, priceOf)).toMatchObject({ pct: 0.75, cost: 100 });
    expect(closestDeck(fam, comp, priceOf)!.deck.i).toBe(0);
  });

  it('filtri: colori sulle varianti, tier, prezzo noto, completamento della lista più vicina', () => {
    const f = tfile();
    const fams = families(f, readDecks(f));
    const ids = (x: typeof fams) => x.map((y) => y.id);
    const score = (p: Record<string, number | null>, c: Record<string, number | null> = {}) =>
      (fam: (typeof fams)[number]) => ({ price: p[fam.id] ?? null, pct: c[fam.id] ?? null });
    const none = score({});
    expect(ids(visibleFamilies(fams, emptyTierFilters(), none))).toEqual(['f1', 'a7']);
    // Terror passa con il rosso grazie alla variante Izzet; con "solo blu" grazie a Mono-Blue
    expect(ids(visibleFamilies(fams, { ...emptyTierFilters(), colors: ['R'] }, none))).toEqual(['f1', 'a7']);
    expect(ids(visibleFamilies(fams, { ...emptyTierFilters(), colors: ['U'], colorMode: 'only' }, none))).toEqual(['f1']);
    expect(ids(visibleFamilies(fams, { ...emptyTierFilters(), colors: ['M'] }, none))).toEqual(['f1']);
    expect(ids(visibleFamilies(fams, { ...emptyTierFilters(), tiers: [4] }, none))).toEqual(['a7']);
    // prezzo: senza prezzo la famiglia esce dal filtro; 0 = solo già completi
    const prices = score({ f1: 5000, a7: null });
    expect(ids(visibleFamilies(fams, { ...emptyTierFilters(), maxPrice: 5000 }, prices))).toEqual(['f1']);
    expect(ids(visibleFamilies(fams, { ...emptyTierFilters(), maxPrice: 4999 }, prices))).toEqual([]);
    // "già completo": completamento al 100%, non solo costo zero (le mancanti senza prezzo costano 0)
    expect(ids(visibleFamilies(fams, { ...emptyTierFilters(), maxPrice: 0 }, score({ f1: 0, a7: 0 }, { f1: 1, a7: 0.9 })))).toEqual(['f1']);
    expect(ids(visibleFamilies(fams, { ...emptyTierFilters(), min: 0.75 }, score({}, { f1: 0.75, a7: 0.5 })))).toEqual(['f1']);
  });

  it("pagina dell'archetipo: liste della famiglia, o le non classificate con 'x'", () => {
    const decks = readDecks(tfile());
    expect(visibleDecks(decks, { arch: '', min: 0, fam: 'f1' }, null).map((x) => x.i)).toEqual([0, 1]);
    expect(visibleDecks(decks, { arch: 'c1UR', min: 0, fam: 'f1' }, null).map((x) => x.i)).toEqual([1]);
    expect(visibleDecks(decks, { arch: '', min: 0, fam: 'x' }, null).map((x) => x.i)).toEqual([3]);
  });
});
