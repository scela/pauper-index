import { describe, expect, it } from 'vitest';

import { buildGroups, displayPrint, isHiddenSet, memberCodes, printsInSets, rarityHere, searchGroups, type SetRow } from '../src/lib/sets';
import { makeData } from './helpers';

const SETS: SetRow[] = [
  { c: 'dmu', n: 'Dominaria United', d: '2022-09-09', t: 'expansion' },
  { c: 'dmc', n: 'Dominaria United Commander', d: '2022-09-09', t: 'commander', p: 'dmu' },
  { c: 'pdmu', n: 'Dominaria United Promos', d: '2022-09-09', t: 'promo', p: 'dmu' },
  { c: 'ice', n: 'Ice Age', d: '1995-06-03', t: 'expansion' },
  { c: 'a25', n: 'Masters 25', d: '2018-03-16', t: 'masters' },
  { c: 'sld', n: 'Secret Lair Drop', d: '2019-12-02', t: 'box' },
  { c: 'plst', n: 'The List', d: '2020-09-26', t: 'masters' },
  { c: 'vma', n: 'Vintage Masters', d: '2014-06-16', t: 'masters', g: 1 },
  { c: 'mmq', n: 'Mercadian Masques', d: '1999-10-04', t: 'expansion' },
];

describe('espansioni', () => {
  const groups = buildGroups(SETS);

  it('promo, Secret Lair, The List e set digitali sono nascosti di default', () => {
    const hidden = SETS.filter(isHiddenSet).map((s) => s.c);
    expect(hidden.sort()).toEqual(['pdmu', 'plst', 'sld', 'vma']);
  });

  it('i set collegati si raggruppano sotto il set principale (parent_set_code)', () => {
    expect([...groups.keys()].sort()).toEqual(['a25', 'dmu', 'ice', 'mmq', 'plst', 'sld', 'vma']);
    expect(groups.get('dmu')!.members.map((s) => s.c)).toEqual(['dmu', 'dmc', 'pdmu']);
    expect([...memberCodes(groups.get('dmu')!, false)]).toEqual(['dmu', 'dmc']);
    expect([...memberCodes(groups.get('dmu')!, true)]).toEqual(['dmu', 'dmc', 'pdmu']);
  });

  it('ricerca per nome o codice, dalla più recente; i gruppi nascosti solo se richiesti', () => {
    expect(searchGroups(groups, '', false).map((g) => g.code)).toEqual(['dmu', 'a25', 'mmq', 'ice']);
    expect(searchGroups(groups, '', true).map((g) => g.code)).toEqual(['dmu', 'plst', 'sld', 'a25', 'vma', 'mmq', 'ice']);
    expect(searchGroups(groups, 'masters', false).map((g) => g.code)).toEqual(['a25']); // Vintage Masters è digitale
    expect(searchGroups(groups, 'commander', false).map((g) => g.code)).toEqual(['dmu']);
    expect(searchGroups(groups, 'ICE', false).map((g) => g.code)).toEqual(['ice']);
    expect(searchGroups(groups, 'promos', false)).toEqual([]);
    expect(searchGroups(groups, 'promos', true).map((g) => g.code)).toEqual(['dmu']);
  });
});

describe('rarità "qui"', () => {
  const d = makeData();
  // Pyroblast (indice 4): comune in ICE, non comune in A25; set d'ingresso ICE
  it('comune nel set: "comune qui"; altrove: rarità del set e set d’ingresso', () => {
    expect(printsInSets(d, 4, new Set(['a25']))).toEqual([1]);
    expect(rarityHere(d, 4, new Set(['ice']))).toEqual({ rarity: 'c', common: true, entrySet: 'ice' });
    expect(rarityHere(d, 4, new Set(['a25']))).toEqual({ rarity: 'u', common: false, entrySet: 'ice' });
    expect(rarityHere(d, 4, new Set(['ice', 'a25']))!.common).toBe(true); // basta una stampa comune nel gruppo
    expect(rarityHere(d, 4, new Set(['dmu']))).toBeNull();
  });

  it('immagine: prima la stampa del set principale, poi la comune', () => {
    expect(displayPrint(d, 4, new Set(['ice', 'a25']), 'a25')).toBe(1);
    expect(displayPrint(d, 4, new Set(['ice', 'a25']), 'dmu')).toBe(0);
    expect(displayPrint(d, 4, new Set(['dmu']), 'dmu')).toBe(-1);
  });
});
