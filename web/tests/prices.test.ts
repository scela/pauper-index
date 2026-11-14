import { describe, expect, it } from 'vitest';

import { compute, DEFAULT_OPTS, type Result } from '../src/lib/compare';
import { fmtEur } from '../src/i18n';
import { cheapestPrice, ownedPrice, ownedPrices, priceTotals, printPrice, rowPrice, sortByPrice, type PricesFile } from '../src/lib/prices';
import type { Group, Row } from '../src/lib/types';
import { ID, makeData } from './helpers';

// prezzi allineati alle printing di helpers.ts: Brainstorm ice (1,00 € / foil 5,00 €) e mmq (0,20 €, nessun foil);
// Delver isd (nessun prezzo); Gush mmq (3,00 €); Island; Pyroblast ice (0,40 €) e a25 (0,30 €, foil 2,00 €)
const PRICES: PricesFile = { v: 1, date: '2026-10-07', p: [[100, 500, 20, 0], [0, 0], [300, 0], [5, 0], [40, 0, 30, 200]] };
const OPTS = { ...DEFAULT_OPTS, win: 3, legalOnly: false };
const row = (r: Partial<Row>): Row => ({ n: '', s: '', sn: '', c: '', f: '', q: 1, l: 'en', i: '', p: 0, ...r });
const group = (rows: Row[]): Group[] => [{ id: 'b', name: 'Binder', type: 'binder', source: 'x.csv', hasProxy: false, kind: 'csv', rows }];

describe('prezzi indicativi', () => {
  const d = makeData();

  it('prezzo di una printing: normale o foil, 0 se manca (nessun ripiego tra i due)', () => {
    expect(printPrice(PRICES, 0, 0)).toBe(100);
    expect(printPrice(PRICES, 0, 0, true)).toBe(500);
    expect(printPrice(PRICES, 0, 1, true)).toBe(0);
    expect(printPrice(PRICES, 1, 0)).toBe(0);
    expect(printPrice(PRICES, 0, -1)).toBe(0);
    expect(printPrice(null, 0, 0)).toBe(0);
    expect(printPrice(PRICES, 99, 0)).toBe(0);
  });

  it('mancanti: la printing non foil più economica, anche tra printing indicate', () => {
    expect(cheapestPrice(PRICES, 0)).toBe(20);
    expect(cheapestPrice(PRICES, 4)).toBe(30);
    expect(cheapestPrice(PRICES, 4, [0])).toBe(40);
    expect(cheapestPrice(PRICES, 1)).toBe(0);
    expect(cheapestPrice(null, 0)).toBe(0);
  });

  it('possedute: la printing posseduta (foil se è foil), la più cara se sono più di una', () => {
    const res = compute(d, group([
      row({ n: 'Brainstorm', i: ID(2), q: 3 }), // mmq, 0,20 €
      row({ n: 'Brainstorm', s: 'ICE', c: '61', f: 'foil' }), // per set e numero, foil 5,00 €
      row({ n: 'Pyroblast', i: 'ffffffff-0000-4000-8000-000000000000', s: 'a25', c: '149', l: 'it' }), // ID sconosciuto
      row({ n: 'Gush' }), // solo il nome: printing non nota
    ]), { b: 'coll' }, OPTS);
    const bs = res.find((x) => x.idx === 0)!;
    expect(ownedPrice(d, PRICES, bs)).toBe(500);
    expect(ownedPrices(d, PRICES, bs).map((o) => [o.cents, o.foil, o.op.q])).toEqual([[500, true, 1], [20, false, 3]]);
    expect(ownedPrice(d, PRICES, res.find((x) => x.idx === 4)!)).toBe(30); // set + numero della riga
    expect(ownedPrice(d, PRICES, res.find((x) => x.idx === 2)!)).toBe(0); // "—"
    expect(ownedPrice(d, null, bs)).toBe(0);
  });

  it('riepilogo: tutte le copie possedute e una copia di ogni mancante, con quelle senza prezzo', () => {
    const res = compute(d, group([row({ n: 'Brainstorm', i: ID(2), q: 3 }), row({ n: 'Gush', q: 2 })]), { b: 'coll' }, OPTS);
    const tot = priceTotals(d, PRICES, res, (x) => cheapestPrice(PRICES, x.idx));
    // Brainstorm 3 × 0,20; Gush senza printing nota: stima minima con la stampa non foil più economica, 2 × 3,00;
    // mancanti: Delver (nessun prezzo) e Pyroblast 0,30 (Island è una terra base: fuori dalla lista)
    expect(tot).toEqual({ ownedValue: 660, ownedCards: 2, ownedUnpriced: 0, ownedEstimated: 1, missingCost: 30, missingCards: 2, missingUnpriced: 1 });
  });

  it('lista incollata (righe senza printing): mai 0,00 €, ma una stima minima; senza alcun prezzo resta "senza prezzo"', () => {
    const res = compute(d, group([row({ n: 'Brainstorm', q: 4 }), row({ n: 'Delver of Secrets', q: 2 })]), { b: 'coll' }, OPTS);
    const tot = priceTotals(d, PRICES, res, (x) => cheapestPrice(PRICES, x.idx));
    // Brainstorm: la più economica è mmq (0,20 €), non la ice da 1,00 €; Delver non ha prezzi in nessuna printing
    expect([tot.ownedValue, tot.ownedEstimated, tot.ownedUnpriced]).toEqual([80, 1, 1]);
  });

  it('prezzo della riga: posseduta (la più cara, foil se è foil), mancante e senza printing "da X €", vista per espansione', () => {
    const res = compute(d, group([
      row({ n: 'Brainstorm', i: ID(2), q: 3 }), // mmq 0,20 €
      row({ n: 'Brainstorm', s: 'ICE', c: '61', f: 'foil' }), // ice foil 5,00 €
      row({ n: 'Gush' }), // senza printing: la più economica
      row({ n: 'Delver of Secrets', s: 'isd', c: '51' }), // printing nota senza prezzo: "—"
    ]), { b: 'coll' }, OPTS);
    const by = (i: number) => res.find((x) => x.idx === i)!;
    expect(rowPrice(d, PRICES, by(0))).toEqual({ cents: 500, from: false });
    expect(rowPrice(d, PRICES, by(2))).toEqual({ cents: 300, from: true });
    expect(rowPrice(d, PRICES, by(1))).toEqual({ cents: 0, from: false });
    expect(rowPrice(d, PRICES, by(4))).toEqual({ cents: 30, from: true }); // mancante: a25, non la ice da 0,40 €
    // vista per espansione: la stampa del set mostrata nella riga, anche se posseduta in un'altra
    expect(rowPrice(d, PRICES, by(0), 0)).toEqual({ cents: 100, from: false });
    expect(rowPrice(d, PRICES, by(4), 0)).toEqual({ cents: 40, from: false });
    expect(rowPrice(d, PRICES, by(4), -1)).toEqual({ cents: 0, from: false });
    expect(rowPrice(d, null, by(0))).toEqual({ cents: 0, from: false });
  });

  describe('ordinamento per prezzo', () => {
    const r = (idx: number, share: number): Result => ({ idx, owned: 0, need: 0, typical: 4, share, status: 'missing', prints: [], binders: [] });
    const names = ['A', 'B', 'C', 'D', 'E', 'F'];
    const tie = (a: Result, b: Result) => b.share - a.share || names[a.idx].localeCompare(names[b.idx]);
    const cents = [300, 0, 100, 300, 0, 100];
    const rows = () => [r(0, 0.1), r(1, 0.9), r(2, 0.2), r(3, 0.5), r(4, 0.3), r(5, 0.2)];
    const order = (s: 'priceAsc' | 'priceDesc') => sortByPrice(rows(), (x) => cents[x.idx], s, tie).map((x) => names[x.idx]).join('');

    it('crescente e decrescente; a parità più giocate, poi nome', () => {
      expect(order('priceAsc')).toBe('CFDA' + 'BE'); // C e F a 1,00 €, stessa quota: per nome; D prima di A (più giocata)
      expect(order('priceDesc')).toBe('DACF' + 'BE');
    });

    it('senza prezzo sempre in fondo, in entrambi gli ordini (tra loro più giocate, poi nome)', () => {
      expect(order('priceAsc').slice(-2)).toBe('BE');
      expect(order('priceDesc').slice(-2)).toBe('BE');
      expect(sortByPrice(rows(), () => 0, 'priceDesc', tie).map((x) => names[x.idx]).join('')).toBe('BDECFA');
    });

    it('con i prezzi reali delle righe: posseduta con più printing e foil', () => {
      const res = compute(d, group([row({ n: 'Brainstorm', i: ID(2), q: 3 }), row({ n: 'Brainstorm', s: 'ICE', c: '61', f: 'foil' }), row({ n: 'Gush' })]), { b: 'coll' }, OPTS);
      const owned = res.filter((x) => x.owned > 0);
      const asc = sortByPrice([...owned], (x) => rowPrice(d, PRICES, x).cents, 'priceAsc', tie).map((x) => x.idx);
      // Gush 3,00 € (da), Brainstorm 5,00 € (foil, la più cara posseduta, non 0,20 €)
      expect(asc).toEqual([2, 0]);
    });
  });

  it('formato in euro per lingua', () => {
    expect(fmtEur(123, 'it').replace(/\s/g, ' ')).toBe('1,23 €');
    expect(fmtEur(123456, 'en')).toBe('€1,234.56');
  });
});
