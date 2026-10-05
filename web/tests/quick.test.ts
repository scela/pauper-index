import { describe, expect, it } from 'vitest';

import { buildNameIndex, collectionIndex, exactEntry, ownedFor, suggest } from '../src/lib/quick';
import type { Group, Row } from '../src/lib/types';
import { ID, makeData } from './helpers';

const d = makeData();
const ALL: [string, string][] = [
  ['Black Lotus', 'n'], ['Brainstorm', 'l'], ['Brain Freeze', 'l'], ['Lightning Bolt', 'l'], ['Lightning Axe', 'n'],
  ['Fire // Ice', 'l'], ['Insectile Aberration', 'l'], ['Ice Cauldron', 'n'], ['Storm Crow', 'l'],
];
const row = (o: Partial<Row>): Row => ({ n: '', s: '', sn: '', c: '', f: '', q: 1, l: '', i: '', p: 0, ...o });

describe('suggerimenti del controllo rapido', () => {
  const entries = buildNameIndex(d, ALL);

  it('senza elenco completo: solo le carte giocate', () => {
    expect(suggest(buildNameIndex(d), 'black')).toEqual([]);
    expect(suggest(buildNameIndex(d), 'brain').map((e) => e.name)).toEqual(['Brainstorm']);
  });

  it('nessun doppione tra carte giocate ed elenco completo', () => {
    expect(entries.filter((e) => e.name === 'Brainstorm')).toHaveLength(1);
    expect(entries.find((e) => e.name === 'Brainstorm')!.card).toBe(0);
    expect(entries.find((e) => e.name === 'Black Lotus')!.card).toBe(-1);
  });

  it('prima l’inizio del nome, poi l’inizio di una parola, carte giocate davanti a parità', () => {
    expect(suggest(entries, 'brain').map((e) => e.name)).toEqual(['Brainstorm', 'Brain Freeze']);
    expect(suggest(entries, 'ice').map((e) => e.name)).toEqual(['Ice Cauldron', 'Fire // Ice']);
    expect(suggest(entries, 'storm').map((e) => e.name)).toEqual(['Storm Crow', 'Brainstorm']);
  });

  it('più parole come inizi di parola, senza accenti né maiuscole', () => {
    expect(suggest(entries, 'light bol').map((e) => e.name)).toEqual(['Lightning Bolt']);
    expect(suggest(entries, 'LÌGHT').map((e) => e.name)).toEqual(['Lightning Axe', 'Lightning Bolt']);
    expect(suggest(entries, '')).toEqual([]);
    expect(suggest(entries, 'zz')).toEqual([]);
  });

  it('nome esatto, anche come faccia di una carta doppia', () => {
    expect(exactEntry(entries, 'brainstorm')!.card).toBe(0);
    expect(exactEntry(entries, 'Delver of Secrets')!.name).toBe('Delver of Secrets // Insectile Aberration');
    expect(exactEntry(entries, 'brain')).toBeNull();
  });
});

describe('possesso per il controllo rapido', () => {
  const g: Group = { id: 'b', name: 'Binder', type: 'binder', source: 'f', kind: 'csv', hasProxy: true, rows: [
    row({ n: 'Brainstorm', i: ID(1), q: 2 }), row({ n: 'Brainstorm', s: 'MMQ', c: '58', q: 1 }),
    row({ n: 'Black Lotus', i: 'ffffffff-0000-4000-8000-000000000000', q: 1 }),
    row({ n: 'Pyroblast', q: 1, p: 1 }),
  ] };
  const entries = buildNameIndex(d, ALL);
  const e = (n: string) => entries.find((x) => x.name === n)!;

  it('carte giocate per indice, carte mai giocate per nome', () => {
    const ix = collectionIndex(d, [g], { b: 'coll' }, false);
    expect(ownedFor(ix, e('Brainstorm'))!.total).toBe(3);
    expect(ownedFor(ix, e('Brainstorm'))!.prints.map((p) => p.q)).toEqual([2, 1]);
    expect(ownedFor(ix, e('Black Lotus'))!.total).toBe(1);
    expect(ownedFor(ix, e('Lightning Bolt'))).toBeNull();
    expect(ownedFor(ix, e('Pyroblast'))).toBeNull(); // proxy esclusi
    expect(ownedFor(collectionIndex(d, [g], { b: 'coll' }, true), e('Pyroblast'))!.total).toBe(1);
  });

  it('i gruppi esclusi non contano', () => {
    expect(ownedFor(collectionIndex(d, [g], { b: 'skip' }, false), e('Brainstorm'))).toBeNull();
  });
});
