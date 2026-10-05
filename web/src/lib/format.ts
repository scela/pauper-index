import { fmtDate, fmtInt, fmtPct, fmtResult, t } from '../i18n';
import type { Data } from './data';
import type { LastSeen } from './types';

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
