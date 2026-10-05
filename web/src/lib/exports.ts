// Export: liste "1 Nome" e List riallineata in CSV per ManaBox.

import type { Result } from './compare';
import type { Data } from './data';

export function textList(d: Data, results: Result[], kind: 'owned' | 'missing', qtyMode: boolean): string {
  const sel = kind === 'owned' ? results.filter((x) => x.status === 'owned') : results.filter((x) => x.status !== 'owned');
  const lines = sel.map((x) => {
    const n = kind === 'owned' ? (qtyMode ? x.need : 1) : qtyMode ? x.need - x.owned : 1;
    return `${n} ${d.cards.c[x.idx].n}`;
  });
  return lines.length ? lines.join('\n') + '\n' : '';
}

export function csvCell(v: unknown): string {
  // Nessun prefisso anti-formula: il file serve all'import in ManaBox, che vuole i nomi esatti ("+2 Mace").
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function realignedCSV(d: Data, results: Result[]): string {
  const head = ['Name', 'Set code', 'Collector number', 'Foil', 'Language', 'Scryfall ID', 'Quantity'];
  const rows = results.map((x) => {
    const c = d.cards.c[x.idx];
    const best = x.prints.find((p) => p.row.i) || x.prints[0];
    if (best) {
      const r = best.row;
      const known = best.print >= 0 ? d.prints.p[x.idx][best.print] : null;
      return [c.n, (r.s || known?.[1] || '').toUpperCase(), r.c || known?.[2] || '', r.f || 'normal', r.l || 'en',
        r.i || known?.[0] || '', x.need];
    }
    const ref = d.prints.p[x.idx][c.r];
    return [c.n, ref ? ref[1].toUpperCase() : '', ref ? ref[2] : '', 'normal', 'en', ref ? ref[0] : '', x.need];
  });
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
