import { describe, expect, it } from 'vitest';

import { compute, DEFAULT_OPTS } from '../src/lib/compare';
import { fmtEur } from '../src/i18n';
import { cheapestPrice, ownedPrice, ownedPrices, priceTotals, printPrice, type PricesFile } from '../src/lib/prices';
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
    const res = compute(d, group([row({ n: 'Brainstorm', i: ID(2), q: 3 }), row({ n: 'Gush' })]), { b: 'coll' }, OPTS);
    const tot = priceTotals(d, PRICES, res, (x) => cheapestPrice(PRICES, x.idx));
    // Brainstorm 3 × 0,20; Gush senza printing nota; mancanti: Delver (nessun prezzo) e Pyroblast 0,30 (Island è una terra base: fuori dalla lista)
    expect(tot).toEqual({ ownedValue: 60, ownedCards: 2, ownedUnpriced: 1, missingCost: 30, missingCards: 2, missingUnpriced: 1 });
  });

  it('formato in euro per lingua', () => {
    expect(fmtEur(123, 'it').replace(/\s/g, ' ')).toBe('1,23 €');
    expect(fmtEur(123456, 'en')).toBe('€1,234.56');
  });
});
