import { fmtDate, fmtInt, fmtPct, fmtResult, t } from '../i18n';
import type { Data } from './data';
import { isFoil } from './csv';
import type { LastSeen, Row } from './types';

// Date e numeri dipendono dalla lingua corrente (src/i18n).
export { fmtDate, fmtInt, fmtPct, fmtResult };

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

export interface LastSeenText {
  kind: 'm' | 'p';
  date: string;
  tournament: string;
  result: string;
  copies: string;
  uri: string;
}

export function lastSeen(d: Data, ls: LastSeen | undefined, kind: 'm' | 'p'): LastSeenText | null {
  if (!ls) return null;
  const tour = d.cards.t[ls[0]];
  if (!tour) return null;
  const [main, side] = [ls[2], ls[3]];
  const copies = [main ? t('sheet.copiesMain', { n: main }) : '', side ? t('sheet.copiesSide', { n: side }) : '']
    .filter(Boolean).join(' + ');
  return { kind, date: tour[0], tournament: tour[1], result: fmtResult(ls[1]), copies, uri: tour[2] };
}

/** Printing di una riga della collezione in breve: "ICE #61 foil it proxy". */
export function fmtPrint(r: Row): string {
  const parts: string[] = [];
  const set = r.s ? r.s.toUpperCase() : r.sn || '';
  if (set) parts.push(set);
  if (r.c) parts.push('#' + r.c);
  if (isFoil(r.f)) parts.push(/^(true|yes|1|y)$/i.test(r.f) ? t('print.foil') : r.f.toLowerCase());
  if (r.l && !/^(en|english)$/i.test(r.l)) parts.push(r.l.toLowerCase());
  if (r.p) parts.push(t('print.proxy'));
  return parts.join(' ') || t('print.unknown');
}
