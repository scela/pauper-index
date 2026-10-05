import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compute, DEFAULT_OPTS, listIndexes, matchRow, presetCounts, summarize } from '../src/lib/compare';
import { looksLikeCSV, parseCSV, readTable } from '../src/lib/csv';
import { cardByName, imageUrl } from '../src/lib/data';
import { realignedCSV, textList } from '../src/lib/exports';
import { norm } from '../src/lib/norm';
import { parseTextList } from '../src/lib/text';
import type { Group, Row } from '../src/lib/types';
import { ID, makeData } from './helpers';

const here = dirname(fileURLToPath(import.meta.url));
const VECTORS: [string, string][] = JSON.parse(
  readFileSync(resolve(here, '../../pipeline/tests/fixtures/norm_vectors.json'), 'utf-8'));

describe('norm (identica alla pipeline Python)', () => {
  it.each(VECTORS)('%s', (raw, expected) => expect(norm(raw)).toBe(expected));
});

const MANABOX_HEADER = 'Binder Name,Binder Type,Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Signed,Condition,Language,Proxy,Purchase price currency';

describe('CSV ManaBox', () => {
  it('raggruppa per Binder e legge le colonne', () => {
    const csv = [MANABOX_HEADER,
      `Rosso,binder,Brainstorm,ICE,Ice Age,61,normal,common,2,1,${ID(1)},0.5,false,false,false,near_mint,en,false,EUR`,
      `Mazzo,deck,Gush,MMQ,Mercadian Masques,69,foil,common,1,2,${ID(4)},1,false,false,false,near_mint,it,true,EUR`,
      `Lista,list,"Delver of Secrets // Insectile Aberration",ISD,Innistrad,51,normal,common,4,3,${ID(3)},1,false,false,false,near_mint,en,false,EUR`,
    ].join('\r\n');
    const res = readTable('collezione.csv', csv);
    if (!('groups' in res)) throw new Error('atteso groups');
    expect(res.groups.map((g) => [g.name, g.type])).toEqual([['Rosso', 'binder'], ['Mazzo', 'deck'], ['Lista', 'list']]);
    const r = res.groups[1].rows[0];
    expect(r).toMatchObject({ n: 'Gush', s: 'MMQ', c: '69', f: 'foil', q: 1, l: 'it', i: ID(4), p: 1 });
    expect(res.groups[2].rows[0].n).toBe('Delver of Secrets // Insectile Aberration');
  });

  it('accetta punto e virgola, BOM e virgolette', () => {
    const res = readTable('x.csv', '﻿Name;Quantity\n"Fire // Ice";3\n"Nome ""strano""";1\n');
    if (!('groups' in res)) throw new Error('atteso groups');
    expect(res.groups[0].rows.map((r) => [r.n, r.q])).toEqual([['Fire // Ice', 3], ['Nome "strano"', 1]]);
  });

  it('segnala un file senza colonna del nome', () => {
    expect(readTable('x.csv', 'foo,bar\n1,2\n')).toEqual({ error: 'noname', headers: ['foo', 'bar'] });
  });

  it('riconosce un CSV incollato come testo', () => {
    expect(looksLikeCSV(MANABOX_HEADER + '\n')).toBe(true);
    expect(looksLikeCSV('4 Ponder\n4 Brainstorm')).toBe(false);
    expect(looksLikeCSV('Name\nPonder')).toBe(false);
  });

  it('parseCSV gestisce righe vuote e CRLF', () => {
    expect(parseCSV('a,b\r\n\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('testo incollato', () => {
  it('formati accettati', () => {
    const t = parseTextList([
      'Deck', '4 Ponder', '4x Ponder', '4 Ponder (M12) 73', 'Ponder', '1 Brainstorm (ICE) 61 *F*',
      '2 Delver of Secrets // Insectile Aberration (ISD) 51', 'Sideboard', 'SB: 2 Pyroblast', '1 Island (PLST) STH-35',
      '// commento', '', '1 Mox (PMEI) 58a *E*',
    ].join('\r\n'));
    expect(t.ignored).toBe(3);
    expect(t.rows.map((r) => [r.q, r.n, r.s, r.c, r.f])).toEqual([
      [4, 'Ponder', '', '', ''], [4, 'Ponder', '', '', ''], [4, 'Ponder', 'M12', '73', ''], [1, 'Ponder', '', '', ''],
      [1, 'Brainstorm', 'ICE', '61', 'foil'], [2, 'Delver of Secrets // Insectile Aberration', 'ISD', '51', ''],
      [2, 'Pyroblast', '', '', ''], [1, 'Island', 'PLST', 'STH-35', ''], [1, 'Mox', 'PMEI', '58a', 'etched'],
    ]);
  });
});

describe('abbinamento e confronto', () => {
  const d = makeData();
  const row = (o: Partial<Row>): Row => ({ n: '', s: '', sn: '', c: '', f: '', q: 1, l: '', i: '', p: 0, ...o });

  it('per Scryfall ID, per set+numero, per nome e per faccia', () => {
    expect(matchRow(d, row({ n: 'qualunque', i: ID(2) }))).toEqual({ card: 0, print: 1, via: 'id' });
    expect(matchRow(d, row({ n: 'Brainstorm', s: 'MMQ', c: '58' }))).toEqual({ card: 0, print: 1, via: 'setcn' });
    expect(matchRow(d, row({ n: 'Brainstorm' }))).toEqual({ card: 0, print: -1, via: 'name' });
    expect(matchRow(d, row({ n: 'Delver of Secrets' })).card).toBe(1);
    expect(cardByName(d, 'Delver of Secrets/Insectile Aberration')).toBe(1);
    // printing straniera: ID sconosciuto, ma il nome inglese basta
    expect(matchRow(d, row({ n: 'Brainstorm', i: 'ffffffff-0000-4000-8000-000000000000' })).card).toBe(0);
    expect(matchRow(d, row({ n: 'Lightning Bolt' })).card).toBe(-1);
  });

  it('riepilogo dell\'importazione', () => {
    const g: Group = { id: 't', name: 'Testo', type: '', source: 'testo', kind: 'text', hasProxy: false, rows: [
      row({ n: 'Brainstorm' }), row({ n: 'Carta Inesistente' }), row({ n: 'Lightning Bolt', i: 'ffffffff-0000-4000-8000-000000000000' }),
    ] };
    const s = summarize(d, [g]);
    expect(s).toMatchObject({ rows: 3, inList: 1, notInList: 1, approxPrint: 1 });
    expect(s.unrecognized.map((r) => r.n)).toEqual(['Carta Inesistente']);
    // con l'elenco di tutti i nomi, una carta vera mai giocata non è "non riconosciuta"
    g.rows.push(row({ n: 'Black Lotus' }));
    const s2 = summarize(d, [g], new Set(['black lotus', 'lightning bolt']));
    expect(s2).toMatchObject({ rows: 4, inList: 1, notInList: 2 });
    expect(s2.unrecognized.map((r) => r.n)).toEqual(['Carta Inesistente']);
  });

  it('definizione della lista e preset', () => {
    expect(listIndexes(d, DEFAULT_OPTS)).toEqual([0, 1, 4]); // Gush bannata, Island base
    expect(listIndexes(d, { ...DEFAULT_OPTS, side: false, minDecks: 3 })).toEqual([0, 1]); // Pyroblast: 2 mazzi main
    expect(presetCounts(d, DEFAULT_OPTS)).toEqual([2, 3, 3, 3]);
    expect(listIndexes(d, { ...DEFAULT_OPTS, legalOnly: false, win: 3 })).toEqual([0, 1, 2, 4]); // Island mai inclusa
  });

  it('possedute e mancanti: basta una copia, i proxy contano solo se richiesto', () => {
    const g: Group = { id: 'b', name: 'Binder', type: 'binder', source: 'f', kind: 'csv', hasProxy: true, rows: [
      row({ n: 'Brainstorm', i: ID(1), q: 2 }), row({ n: 'Brainstorm', i: ID(2), q: 1 }),
      row({ n: 'Pyroblast', q: 1, p: 1 }),
    ] };
    const roles = { b: 'coll' as const };
    let res = compute(d, [g], roles, DEFAULT_OPTS);
    expect(res.map((r) => [r.idx, r.status, r.owned])).toEqual([[0, 'owned', 3], [1, 'missing', 0], [4, 'missing', 0]]);
    res = compute(d, [g], roles, { ...DEFAULT_OPTS, proxies: true });
    expect(res.map((r) => [r.idx, r.status, r.owned, r.need])).toEqual([[0, 'owned', 3, 1], [1, 'missing', 0, 1], [4, 'owned', 1, 1]]);
    expect(res[0].prints.map((p) => p.q)).toEqual([2, 1]);
    expect(compute(d, [g], { b: 'skip' }, DEFAULT_OPTS).every((r) => r.status === 'missing')).toBe(true);
  });

  it('export di testo e List riallineata', () => {
    const g: Group = { id: 'b', name: 'B', type: 'binder', source: 'f', kind: 'csv', hasProxy: false, rows: [
      row({ n: 'Brainstorm', s: 'MMQ', c: '58', i: ID(2), q: 1, f: 'foil', l: 'it' }),
    ] };
    const res = compute(d, [g], { b: 'coll' }, DEFAULT_OPTS);
    expect(textList(d, res, 'missing')).toBe('1 Delver of Secrets // Insectile Aberration\n1 Pyroblast\n');
    expect(textList(d, res, 'owned')).toBe('1 Brainstorm\n');
    const csv = realignedCSV(d, res).split('\r\n');
    expect(csv[0]).toBe('Name,Set code,Collector number,Foil,Language,Scryfall ID,Quantity');
    expect(csv[1]).toBe(`Brainstorm,MMQ,58,foil,it,${ID(2)},1`);
    expect(csv[2]).toBe(`Delver of Secrets // Insectile Aberration,ISD,51,normal,en,${ID(3)},1`);
  });

  it('URL immagini solo da Scryfall e solo con ID validi', () => {
    expect(imageUrl(ID(1), 'normal', 'back')).toBe(`https://cards.scryfall.io/normal/back/0/0/${ID(1)}.jpg`);
    expect(imageUrl('../../evil"><script>')).toContain('00000000-0000-0000-0000-000000000000');
  });
});
