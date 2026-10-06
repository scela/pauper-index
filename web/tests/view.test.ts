import { describe, expect, it } from 'vitest';

import { compute, DEFAULT_OPTS, presetCounts, type Result } from '../src/lib/compare';
import { buildGroups, memberCodes, printsInSets, type SetRow } from '../src/lib/sets';
import type { Group } from '../src/lib/types';
import { restrictToSet, shownNote, visible, type ListFilters } from '../src/lib/view';
import { makeData } from './helpers';

// Ice Age con un set collegato visibile (Masters 25, finto figlio) e uno nascosto (promo)
const SETS: SetRow[] = [
  { c: 'ice', n: 'Ice Age', d: '1995-06-03', t: 'expansion' },
  { c: 'a25', n: 'Masters 25', d: '2018-03-16', t: 'masters', p: 'ice' },
  { c: 'mmq', n: 'Ice Age Promos', d: '1995-06-03', t: 'promo', p: 'ice' },
];
const OPTS = { ...DEFAULT_OPTS, win: 3, legalOnly: false }; // storico, anche le bannate (Gush)
const NONE: ListFilters = { query: '', seen: 'all', onlyOwned: false };
const COLL: Group[] = [{
  id: 'b', name: 'Binder', type: 'binder', source: 'x.csv', hasProxy: false, kind: 'csv',
  rows: [{ n: 'Brainstorm', s: 'ice', sn: 'Ice Age', c: '61', f: '', q: 1, l: 'en', i: '', p: 0 }],
}];
const names = (d: ReturnType<typeof makeData>, rs: Result[]) => rs.map((x) => d.cards.c[x.idx].n).sort();

describe('riepilogo ed elenco contano lo stesso insieme', () => {
  const d = makeData();
  const group = buildGroups(SETS).get('ice')!;
  const all = compute(d, COLL, { b: 'coll' }, OPTS);

  it('set collegati e set nascosti: il riepilogo segue l’opzione, come l’elenco', () => {
    const shown = restrictToSet(d, all, memberCodes(group, false));
    expect(names(d, shown)).toEqual(['Brainstorm', 'Pyroblast']); // ice + a25 (collegato)
    const withHidden = restrictToSet(d, all, memberCodes(group, true));
    expect(names(d, withHidden)).toEqual(['Brainstorm', 'Gush', 'Pyroblast']); // + promo nascosta
    // senza filtri dell'elenco l'elenco è esattamente l'insieme contato: nessuna nota
    for (const head of [shown, withHidden]) {
      expect(visible(d, head, NONE)).toEqual(head);
      expect(shownNote(head, visible(d, head, NONE))).toBeNull();
    }
  });

  it('con i filtri dell’elenco la nota dice quante carte si vedono, sempre uguale all’elenco', () => {
    const head = restrictToSet(d, all, memberCodes(group, true));
    const cases: [ListFilters, string[]][] = [
      [{ ...NONE, seen: 'old' }, ['Gush']], // il caso di Edge of Eternities: riepilogo 3, elenco 1
      [{ ...NONE, seen: 'recent' }, ['Brainstorm', 'Pyroblast']],
      [{ ...NONE, query: 'pyro' }, ['Pyroblast']],
      [{ ...NONE, onlyOwned: true }, ['Brainstorm']],
      [{ query: 'zzz', seen: 'all', onlyOwned: false }, []],
    ];
    for (const [f, expected] of cases) {
      const view = visible(d, head, f);
      expect(names(d, view)).toEqual(expected);
      expect(shownNote(head, view)).toBe(view.length);
    }
  });

  it('vista collezione: titolo sulle possedute; con le mancanti la nota conta l’elenco intero', () => {
    const owned = all.filter((x) => x.owned > 0);
    expect(shownNote(owned, visible(d, all, { ...NONE, onlyOwned: true }))).toBeNull();
    expect(shownNote(owned, visible(d, all, NONE))).toBe(all.length);
  });

  it('con un’espansione i conteggi del menu Periodo sono quelli dell’espansione', () => {
    const codes = memberCodes(group, false);
    const keep = (idx: number) => printsInSets(d, idx, codes).length > 0;
    const counts = presetCounts(d, OPTS, keep);
    expect(counts[3]).toBe(restrictToSet(d, compute(d, [], {}, OPTS), codes).length);
    expect(counts[3]).toBeLessThan(presetCounts(d, OPTS)[3]);
  });
});
