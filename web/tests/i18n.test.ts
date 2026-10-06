import { describe, expect, it } from 'vitest';

import { ALL_KEYS, detectLang, DICTS, fmtDate, fmtInt, fmtPct, fmtResult, translate } from '../src/i18n';

const forms = (m: unknown) => (typeof m === 'string' ? [m] : [(m as { one: string }).one, (m as { other: string }).other]);
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dizionari', () => {
  it('italiano e inglese hanno le stesse chiavi', () => {
    expect(Object.keys(DICTS.en).sort()).toEqual([...ALL_KEYS].sort());
  });

  it('nessun testo vuoto (tranne la sintesi italiana dell’avviso, inutile in inglese)', () => {
    for (const lang of ['it', 'en'] as const) {
      for (const k of ALL_KEYS) {
        if (lang === 'en' && k === 'about.legal.summary') continue;
        for (const f of forms(DICTS[lang][k])) expect(f.trim(), `${lang}:${k}`).not.toBe('');
      }
    }
  });

  it('stessi segnaposto nelle due lingue', () => {
    for (const k of ALL_KEYS) {
      const it_ = forms(DICTS.it[k]).map(vars);
      const en = forms(DICTS.en[k]).map(vars);
      expect(en[en.length - 1], k).toEqual(it_[it_.length - 1]);
    }
  });

  it('plurali e segnaposto', () => {
    expect(translate('it', 'res.owned', { n: 1 })).toBe('Possiedi 1 carta giocata in Pauper');
    expect(translate('it', 'res.owned', { n: 12345 })).toBe('Possiedi 12.345 carte giocate in Pauper'); // in italiano 4 cifre senza separatore (CLDR)
    expect(translate('en', 'res.owned', { n: 1 })).toBe('You own 1 card played in Pauper');
    expect(translate('en', 'res.owned', { n: 1234 })).toBe('You own 1,234 cards played in Pauper');
    expect(translate('en', 'grp.summary', { inc: 2, total: 4 })).toBe('Included binders: 2 of 4 · edit');
  });
});

describe('lingua iniziale', () => {
  it('scelta salvata, poi lingua del browser, altrimenti inglese', () => {
    expect(detectLang('en', ['it-IT'])).toBe('en');
    expect(detectLang(null, ['it-IT', 'en'])).toBe('it');
    expect(detectLang(null, ['it'])).toBe('it');
    expect(detectLang(null, ['fr-FR', 'it-IT'])).toBe('it');
    expect(detectLang(null, ['de-DE'])).toBe('en');
    expect(detectLang('xx', [])).toBe('en');
  });
});

describe('formattazione per lingua', () => {
  it('date senza effetti del fuso orario', () => {
    expect(fmtDate('2026-10-04', 'it')).toBe('4 ott 2026');
    expect(fmtDate('2026-10-04', 'en')).toBe('Oct 4, 2026');
    expect(fmtDate('2026-01-01T00:30:00+00:00', 'en')).toBe('Jan 1, 2026');
  });
  it('numeri, percentuali e piazzamenti', () => {
    expect(fmtInt(155432, 'it')).toBe('155.432');
    expect(fmtInt(155432, 'en')).toBe('155,432');
    expect(fmtPct(0.057, 'it')).toBe('5,7%');
    expect(fmtPct(0.057, 'en')).toBe('5.7%');
    expect(fmtPct(0.0004, 'it')).toBe('<0,1%');
    expect([1, 2, 3, 4, 11, 21, 32].map((n) => fmtResult(n, 'en'))).toEqual(['1st', '2nd', '3rd', '4th', '11th', '21st', '32nd']);
    expect(fmtResult(3, 'it')).toBe('3°');
    expect(fmtResult('5-0', 'en')).toBe('5-0');
  });
});
