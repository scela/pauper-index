import { describe, expect, it } from 'vitest';

import {
  availableTypes, cardTypes, emptyFilters, haystacks, isActive, matchCard, matchColors, matchMv, matchTypes, mvLabel,
  textWords, type CardFilters,
} from '../src/lib/cardfilter';
import { compute, DEFAULT_OPTS } from '../src/lib/compare';
import { realignedCSV, textList } from '../src/lib/exports';
import type { CardRow } from '../src/lib/types';
import { visible, type ListFilters } from '../src/lib/view';
import { makeData } from './helpers';

const F = (x: Partial<CardFilters>): CardFilters => ({ ...emptyFilters(), ...x });
const row = (n: string, k: string | undefined, m: number, tl: string, b?: 1): CardRow =>
  ({ o: n, n, l: 'l', k, m, tl, b, s: [0, 0, 0, 0], f: '', z: '', r: 0 });

describe('colori', () => {
  // incolore, mono blu, mono rosso, blu-rosso, bianco-blu-nero
  const cols = ['', 'U', 'R', 'UR', 'WUB'];
  const pass = (f: CardFilters) => cols.filter((k) => matchColors(k || undefined, f));

  it('nessun colore scelto: passano tutte', () => {
    expect(pass(F({}))).toEqual(cols);
  });

  it('"almeno uno dei colori scelti" (predefinita)', () => {
    expect(pass(F({ colors: ['U'] }))).toEqual(['U', 'UR', 'WUB']);
    expect(pass(F({ colors: ['R', 'B'] }))).toEqual(['R', 'UR', 'WUB']);
    expect(pass(F({ colors: ['M'] }))).toEqual(['UR', 'WUB']);
    expect(pass(F({ colors: ['C'] }))).toEqual(['']);
    expect(pass(F({ colors: ['R', 'C'] }))).toEqual(['', 'R', 'UR']);
  });

  it('"solo questi colori": tutti i colori della carta tra quelli scelti', () => {
    const only = (colors: CardFilters['colors']) => pass(F({ colors, colorMode: 'only' }));
    expect(only(['U'])).toEqual(['U']);
    expect(only(['U', 'R'])).toEqual(['U', 'R', 'UR']);
    expect(only(['U', 'R', 'M'])).toEqual(['UR']); // con Multicolore solo le multicolori
    expect(only(['M'])).toEqual(['UR', 'WUB']);
    expect(only(['C'])).toEqual(['']);
    expect(only(['U', 'C'])).toEqual(['', 'U']);
  });
});

describe('costo, tipo e testo', () => {
  it('costo di mana: valori esatti, 6 = 6 o più', () => {
    const f = F({ mv: [1, 6] });
    expect([0, 1, 2, 6, 9].filter((m) => matchMv(m, f))).toEqual([1, 6, 9]);
    expect(matchMv(undefined, F({ mv: [0] }))).toBe(true);
  });

  it('tipi su tutte le facce, senza supertipi né sottotipi', () => {
    expect(cardTypes('Kindred Enchantment — Faerie')).toEqual(['Kindred', 'Enchantment']);
    expect(cardTypes('Legendary Snow Creature — Elf')).toEqual(['Creature']);
    expect(cardTypes('Sorcery // Land')).toEqual(['Sorcery', 'Land']);
    expect(cardTypes('Creature — Giant // Instant — Adventure')).toEqual(['Creature', 'Instant']);
    expect(matchTypes('Sorcery // Land', F({ types: ['Land'] }))).toBe(true);
    expect(matchTypes('Artifact Creature — Thopter', F({ types: ['Instant', 'Artifact'] }))).toBe(true);
    expect(matchTypes('Instant', F({ types: ['Creature'] }))).toBe(false);
  });

  it('tipi disponibili: i sei principali per primi, poi gli altri presenti; terre base escluse', () => {
    const cards = [row('a', 'U', 2, 'Kindred Instant — Faerie'), row('b', 'G', 2, 'Creature — Elf'),
      row('c', '', 0, 'Basic Land — Island', 1), row('d', '', 0, 'Battle — Siege')];
    expect(availableTypes(cards)).toEqual(['Creature', 'Instant', 'Battle', 'Kindred']);
  });

  it('testo: tutte le parole, in qualsiasi punto, senza distinzione di maiuscole; anche la riga del tipo', () => {
    const cards = [row('Ponder', 'U', 1, 'Sorcery'), row('Spellstutter', 'U', 2, 'Creature — Faerie Wizard'),
      row('Trinket', '', 2, 'Artifact — Equipment')];
    const texts = ['Look at the top three cards of your library.\nDraw a card.', 'Flash\nFlying', 'Equipped creature gets +1/+0.\nEquip {1}'];
    const hay = haystacks(cards, texts);
    const pass = (q: string) => cards.filter((c, i) => matchCard(c, i, F({ text: q }), textWords(q), hay)).map((c) => c.n);
    expect(pass('draw a card')).toEqual(['Ponder']);
    expect(pass('DRAW   card')).toEqual(['Ponder']);
    expect(pass('faerie')).toEqual(['Spellstutter']);
    expect(pass('equipment')).toEqual(['Trinket']);
    expect(pass('flying draw')).toEqual([]);
    expect(pass('+1/+0')).toEqual(['Trinket']);
    // testo non ancora scaricato: il filtro sul testo aspetta, gli altri valgono
    const waiting = cards.filter((c, i) => matchCard(c, i, F({ text: 'draw', types: ['Sorcery'] }), ['draw'], null));
    expect(waiting.map((c) => c.n)).toEqual(['Ponder']);
    // apostrofi tipografici
    expect(textWords('Can’t')).toEqual(["can't"]);
  });

  it('filtri attivi ed etichetta del costo', () => {
    expect(isActive(F({}))).toBe(false);
    expect(isActive(F({ text: '   ' }))).toBe(false);
    expect(isActive(F({ colorMode: 'only' }))).toBe(false);
    expect(isActive(F({ mv: [0] }))).toBe(true);
    expect(mvLabel([2, 1])).toBe('1–2');
    expect(mvLabel([1, 2, 4, 6])).toBe('1–2, 4, 6+');
    expect(mvLabel([0, 5, 6])).toBe('0, 5–6+');
  });
});

describe('elenco ed export con i nuovi filtri', () => {
  const d = makeData();
  const opts = { ...DEFAULT_OPTS, win: 3, legalOnly: false };
  const all = compute(d, [], {}, opts);
  const NONE: ListFilters = { query: '', seen: 'all', onlyOwned: false };
  const list = (f: Partial<CardFilters>, extra: Partial<ListFilters> = {}) =>
    visible(d, all, { ...NONE, ...extra, card: F(f), hay: null });
  const names = (f: Partial<CardFilters>, extra: Partial<ListFilters> = {}) =>
    list(f, extra).map((x) => d.cards.c[x.idx].n).sort();

  it('si combinano tra loro e con gli altri filtri dell’elenco', () => {
    expect(names({ colors: ['R'] })).toEqual(['Pyroblast']);
    expect(names({ mv: [1] })).toEqual(['Brainstorm', 'Delver of Secrets // Insectile Aberration', 'Pyroblast']);
    expect(names({ mv: [1], types: ['Instant'] })).toEqual(['Brainstorm', 'Pyroblast']);
    expect(names({ colors: ['U'], types: ['Instant'] }, { query: 'gu' })).toEqual(['Gush']);
    expect(names({ colors: ['U'], types: ['Instant'] }, { seen: 'recent' })).toEqual(['Brainstorm']);
  });

  it('gli export comprendono tutte le carte che rispettano i filtri, non solo quelle mostrate', () => {
    const rows = list({ types: ['Instant'] });
    expect(textList(d, rows, 'missing')).toBe('1 Brainstorm\n1 Gush\n1 Pyroblast\n');
    expect(realignedCSV(d, rows).trim().split('\r\n')).toHaveLength(4); // intestazione + 3 carte
  });
});
